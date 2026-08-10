// Requisitos: node 18+ (fetch builtin) ou instalar node-fetch.
// Defina YT_API_KEY no Railway (Google API key com YouTube Data API v3 ativada).
// Opcional: defina DB_CHANNEL_ID como variável de ambiente ou altere a constante abaixo.

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Polyfill de fetch para ambientes sem fetch global (ex: Node <18)
let fetchFn = (typeof fetch !== 'undefined') ? fetch : null;
if (!fetchFn) {
  try {
    fetchFn = require('node-fetch');
  } catch (err) {
    // deixamos fetchFn null — lançaremos erro se usado sem fetch
  }
}

/**
 * Converte ISO 8601 duration (ex: PT2M34S) para segundos
 */
function isoDurationToSeconds(iso) {
  const match = iso && iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h='0', m='0', s='0'] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/**
 * Extrai o ID do YouTube a partir de uma URL ou texto contendo links.
 */
function extractYouTubeId(text) {
  if (!text) return null;
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  // fallback: try to find any 11-char id-looking substring after v=
  const m2 = text.match(/v=([A-Za-z0-9_-]{11})/);
  return m2 ? m2[1] : null;
}

/**
 * Remove duplicados por id mantendo a primeira ocorrência
 */
function uniqueById(items) {
  const map = new Map();
  for (const it of items) {
    if (!it || !it.id) continue;
    if (!map.has(it.id)) map.set(it.id, it);
  }
  return Array.from(map.values());
}

// Canal que servirá como "banco de dados" de vídeos salvos. Pode ser alterado para process.env.DB_CHANNEL_ID
const DB_CHANNEL_ID = process.env.DB_CHANNEL_ID || '1525926566373363823';

/**
 * Faz busca no YouTube: prioriza vídeos curtos (videoDuration=short).
 * Retorna array com { id, title, channelTitle, durationSec, url, isShort }
 */
async function searchTrophyVideos(game, trophyName, maxResults = 5) {
  const apiKey = process.env.YT_API_KEY;
  if (!apiKey) throw new Error('YT_API_KEY não definido');
  if (!fetchFn) throw new Error('fetch não está disponível. Instale node-fetch ou use Node 18+.');

  const fetch = fetchFn;
  const base = 'https://www.googleapis.com/youtube/v3/search';
  const videosEndpoint = 'https://www.googleapis.com/youtube/v3/videos';

  // Query: jogo + nome + palavras-chave que abrangem idiomas e shorts
  const q = `${game} ${trophyName} trophy achievement conquista troféu shorts`;

  // 1) Busca priorizando vídeos curtos (< 4min)
  const shortUrl = `${base}?key=${apiKey}&part=snippet&type=video&videoDuration=short&order=relevance&maxResults=${maxResults}&q=${encodeURIComponent(q)}`;
  const shortResp = await fetch(shortUrl).then(r => r.json());
  const shortItemsRaw = (shortResp.items || []).map(it => ({
    id: it.id.videoId,
    title: it.snippet.title,
    channelTitle: it.snippet.channelTitle,
    url: `https://youtu.be/${it.id.videoId}`
  }));

  const shortItems = uniqueById(shortItemsRaw);

  if (shortItems.length >= Math.min(maxResults, 3)) {
    // Se já temos resultados curtos suficientes, enriquecemos com durações e retornamos
    const ids = shortItems.map(i => i.id).join(',');
    const det = await fetch(`${videosEndpoint}?key=${apiKey}&part=contentDetails&id=${ids}`).then(r => r.json());
    const durMap = {};
    (det.items || []).forEach(d => { durMap[d.id] = isoDurationToSeconds(d.contentDetails.duration); });
    return shortItems.slice(0, maxResults).map(i => ({
      ...i,
      durationSec: durMap[i.id] ?? 0,
      isShort: true
    }));
  }

  // 2) Fallback: busca mais ampla (sem filtro de duração), pegar mais resultados
  // aumentamos allMax para ter mais candidatos e reduzir chance de duplicatas
  const allMax = Math.max(25, maxResults * 6);
  const allUrl = `${base}?key=${apiKey}&part=snippet&type=video&order=relevance&maxResults=${allMax}&q=${encodeURIComponent(q)}`;
  const allResp = await fetch(allUrl).then(r => r.json());
  const allItemsRaw = (allResp.items || []).map(it => ({
    id: it.id.videoId,
    title: it.snippet.title,
    channelTitle: it.snippet.channelTitle,
    url: `https://youtu.be/${it.id.videoId}`
  }));

  // Combine shortItems (if any) with allItems to keep preference for shorts but avoid duplicates
  const combined = uniqueById([...shortItems, ...allItemsRaw]);
  if (combined.length === 0) return [];

  // Obter durations dos vídeos retornados e ordenar: curtos primeiro (menor duration)
  const ids = combined.map(i => i.id).join(',');
  const vidsDet = await fetch(`${videosEndpoint}?key=${apiKey}&part=contentDetails&id=${ids}`).then(r => r.json());
  const durMap = {};
  (vidsDet.items || []).forEach(d => { durMap[d.id] = isoDurationToSeconds(d.contentDetails.duration); });

  const enriched = combined.map(i => ({
    ...i,
    durationSec: durMap[i.id] ?? 0,
    isShort: (durMap[i.id] ?? 0) < 240 // considerar 'short' < 4min
  }));

  // Ordena: isShort true primeiro (mantendo relevância aproximada), depois por duração ascendente
  enriched.sort((a, b) => {
    if (a.isShort && !b.isShort) return -1;
    if (!a.isShort && b.isShort) return 1;
    if (a.durationSec !== b.durationSec) return a.durationSec - b.durationSec;
    return 0;
  });

  return enriched.slice(0, maxResults);
}

/**
 * Busca no canal DB_CHANNEL_ID por mensagens e extrai IDs de vídeos já salvos.
 * Retorna um Set de video IDs.
 */
async function fetchSavedVideoIds(client) {
  const saved = new Set();
  if (!client) return saved;
  try {
    const channel = await client.channels.fetch(DB_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isText()) return saved;

    // Pegamos até 200 mensagens recentes (ajuste se necessário)
    const fetched = await channel.messages.fetch({ limit: 200 });
    for (const msg of fetched.values()) {
      // procurar nos embeds e no conteúdo
      if (msg.content) {
        const id = extractYouTubeId(msg.content);
        if (id) saved.add(id);
      }
      if (msg.embeds && msg.embeds.length) {
        for (const e of msg.embeds) {
          if (e.url) {
            const id = extractYouTubeId(e.url);
            if (id) saved.add(id);
          }
          if (e.description) {
            const id2 = extractYouTubeId(e.description);
            if (id2) saved.add(id2);
          }
        }
      }
    }
  } catch (err) {
    // falhar silenciosamente — retornamos o set que pode estar vazio
    console.error('Erro ao buscar DB channel messages:', err);
  }
  return saved;
}

/**
 * Salva (envia) no canal DB_CHANNEL_ID apenas os vídeos que ainda não constam lá.
 * Retorna quantidade de novos salvos.
 */
async function saveNewVideosToChannel(client, videos, existingSet) {
  if (!client) return 0;
  try {
    const channel = await client.channels.fetch(DB_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isText()) return 0;

    const toSave = videos.filter(v => !existingSet.has(v.id));
    if (toSave.length === 0) return 0;

    // Enviar uma mensagem única com a lista para não spam
    const lines = toSave.map(v => `🔖 ${v.title} — ${v.channelTitle}\n${v.url}`);
    // dividir em blocos de 10 para evitar limite de tamanho
    const chunkSize = 10;
    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunk = lines.slice(i, i + chunkSize).join('\n\n');
      await channel.send({ content: `Novos vídeos salvos:\n\n${chunk}` });
    }

    return toSave.length;
  } catch (err) {
    console.error('Erro ao salvar vídeos no canal DB:', err);
    return 0;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('conquista')
    .setDescription('Busca vídeos sobre uma conquista específica (prioriza vídeos curtos)')
    .addStringOption(opt => opt.setName('jogo').setDescription('Nome do jogo').setRequired(true))
    .addStringOption(opt => opt.setName('nome').setDescription('Nome da conquista').setRequired(true))
    .addIntegerOption(opt => opt.setName('limite').setDescription('Quantos resultados (padrão 3)').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    try {
      const game = interaction.options.getString('jogo');
      const name = interaction.options.getString('nome');
      const limit = interaction.options.getInteger('limite') ?? 3;

      // 1) Buscar vídeos (com maior pool para compensar filtragem)
      const candidates = await searchTrophyVideos(game, name, Math.max(limit, 15));
      if (!candidates || candidates.length === 0) {
        return interaction.editReply(`Não consegui encontrar vídeos para: **${game} — ${name}**.`);
      }

      // 2) Buscar IDs já salvos no canal DB
      const savedSet = await fetchSavedVideoIds(interaction.client);

      // 3) Filtrar candidatos para remover vídeos já salvos
      const uniqueCandidates = candidates.filter(v => !savedSet.has(v.id));

      // Se não houver candidatos únicos suficientes, pegamos mais vídeos (tentativa extra)
      let finalResults = uniqueCandidates.slice(0, limit);
      if (finalResults.length < limit) {
        // tentar expandir buscando mais (segundo passe)
        const more = await searchTrophyVideos(game, name, Math.max(limit * 3, 30));
        const moreFiltered = more.filter(v => !savedSet.has(v.id));
        // juntar mantendo ordem e sem duplicatas
        const combined = uniqueById([...finalResults, ...moreFiltered]);
        finalResults = combined.slice(0, limit);
      }

      if (!finalResults || finalResults.length === 0) {
        return interaction.editReply(`Todos os vídeos encontrados para **${game} — ${name}** já estão salvos no canal de controle.`);
      }

      // 4) Salvar os novos vídeos selecionados no canal DB (apenas os que ainda não estão lá)
      await saveNewVideosToChannel(interaction.client, finalResults, savedSet).catch(() => {});

      // 5) Responder ao usuário com os resultados finais
      const embed = new EmbedBuilder()
        .setTitle(`Resultados: ${game} — ${name}`)
        .setDescription('Priorizando vídeos curtos (shorts). Idioma não é filtrado. Vídeos já salvos no canal de controle foram omitidos.')
        .setColor(0x1E90FF);

      finalResults.forEach((r, idx) => {
        const mins = Math.floor((r.durationSec || 0) / 60);
        const secs = (r.durationSec || 0) % 60;
        const len = r.durationSec > 0 ? ` (${mins}m ${secs}s)` : '';
        const badge = r.isShort ? '🔹 SHORT' : '▫️';
        embed.addFields({ name: `${idx + 1}. ${r.title}`, value: `${badge} ${r.channelTitle} • [Abrir](${r.url})${len}` });
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Erro /conquista:', err);
      await interaction.editReply('Ocorreu um erro ao buscar vídeos. Verifique o console e a variável YT_API_KEY.');
    }
  }
};
