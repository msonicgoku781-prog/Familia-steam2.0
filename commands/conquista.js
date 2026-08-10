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
 * Extrai o ID do YouTube a partir de uma URL ou texto contendo links e thumbnails.
 */
function extractYouTubeId(text) {
  if (!text) return null;
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i,
    /(?:https?:\/\/)?i\.ytimg\.com\/vi\/([A-Za-z0-9_-]{11})/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }

  // fallback: attempt to find a 11-char id after v=
  const m2 = text.match(/v=([A-Za-z0-9_-]{11})/);
  if (m2) return m2[1];

  // last resort: find any 11-char token (may produce false positives)
  const m3 = text.match(/([A-Za-z0-9_-]{11})/);
  return m3 ? m3[1] : null;
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
  const shortUrl = `${base}?key=${apiKey}&part=snippet&type=video&videoDuration=short&order=relevance&maxResults=${Math.min(maxResults, 50)}&q=${encodeURIComponent(q)}`;
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
  const allMax = Math.max(50, maxResults * 6);
  const allUrl = `${base}?key=${apiKey}&part=snippet&type=video&order=relevance&maxResults=${Math.min(allMax,50)}&q=${encodeURIComponent(q)}`;
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
 * Paginação até maxMessages (padrão 1000). Retorna um Set de video IDs.
 */
async function fetchSavedVideoIds(client, maxMessages = 1000) {
  const saved = new Set();
  if (!client) return saved;
  try {
    const channel = await client.channels.fetch(DB_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isText()) return saved;

    let lastId = null;
    let fetchedTotal = 0;
    while (fetchedTotal < maxMessages) {
      const limit = Math.min(100, maxMessages - fetchedTotal);
      const options = { limit };
      if (lastId) options.before = lastId;
      const fetched = await channel.messages.fetch(options);
      if (!fetched || fetched.size === 0) break;
      for (const msg of fetched.values()) {
        fetchedTotal++;
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
            if (e.thumbnail && e.thumbnail.url) {
              const id2 = extractYouTubeId(e.thumbnail.url);
              if (id2) saved.add(id2);
            }
            if (e.description) {
              const id3 = extractYouTubeId(e.description);
              if (id3) saved.add(id3);
            }
          }
        }
        lastId = msg.id;
      }
      if (fetched.size < limit) break; // sem mais mensagens
    }
  } catch (err) {
    console.error('Erro ao buscar DB channel messages:', err);
  }
  return saved;
}

/**
 * Salva (envia) no canal DB_CHANNEL_ID apenas os vídeos que ainda não constam lá.
 * Retorna quantidade de novos salvos. Atualiza existingSet conforme salva para evitar condições de corrida.
 * Agora faz um re-check de mensagens recentes antes de enviar cada chunk para evitar duplicatas por race.
 */
async function saveNewVideosToChannel(client, videos, existingSet) {
  if (!client) return 0;
  try {
    const channel = await client.channels.fetch(DB_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isText()) return 0;

    const toSave = videos.filter(v => !existingSet.has(v.id));
    if (toSave.length === 0) return 0;

    // Enviar em blocos para evitar limite de tamanho; mas atualizamos existingSet conforme enviamos
    const chunkSize = 10;
    let savedCount = 0;
    for (let i = 0; i < toSave.length; i += chunkSize) {
      // Antes de enviar, re-check nas mensagens mais recentes para detectar se outro processo já salvou algum vídeo
      try {
        const recent = await channel.messages.fetch({ limit: 200 });
        for (const msg of recent.values()) {
          if (msg.content) {
            const id = extractYouTubeId(msg.content);
            if (id) existingSet.add(id);
          }
          if (msg.embeds && msg.embeds.length) {
            for (const e of msg.embeds) {
              if (e.url) {
                const id = extractYouTubeId(e.url);
                if (id) existingSet.add(id);
              }
              if (e.thumbnail && e.thumbnail.url) {
                const id2 = extractYouTubeId(e.thumbnail.url);
                if (id2) existingSet.add(id2);
              }
              if (e.description) {
                const id3 = extractYouTubeId(e.description);
                if (id3) existingSet.add(id3);
              }
            }
          }
        }
      } catch (err) {
        // se falhar, continuamos com o envio baseado no existingSet que temos
        console.error('Re-check failed before sending chunk:', err);
      }

      // recompute chunk after re-check to remove already-saved videos
      const chunk = toSave.slice(i, i + chunkSize).filter(v => !existingSet.has(v.id));
      if (chunk.length === 0) continue; // nada novo para enviar neste bloco

      const lines = chunk.map(v => `🔖 ${v.title} — ${v.channelTitle}\n${v.url}\nID: ${v.id}`);
      await channel.send({ content: `Novos vídeos salvos:\n\n${lines.join('\n\n')}` });
      // Atualizar existingSet imediatamente
      for (const v of chunk) existingSet.add(v.id);
      savedCount += chunk.length;
    }

    return savedCount;
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

      // 1) Buscar um pool maior de candidatos
      const candidates = await searchTrophyVideos(game, name, Math.max(limit, 30));
      if (!candidates || candidates.length === 0) {
        return interaction.editReply(`Não consegui encontrar vídeos para: **${game} — ${name}**.`);
      }

      // 2) Buscar IDs já salvos no canal DB (paginar até 1000 mensagens)
      const savedSet = await fetchSavedVideoIds(interaction.client, 1000);

      // 3) Filtrar candidatos para remover vídeos já salvos
      let uniqueCandidates = candidates.filter(v => !savedSet.has(v.id));

      // Se não houver candidatos únicos suficientes, pegamos mais vídeos (tentativa extra)
      if (uniqueCandidates.length < limit) {
        const more = await searchTrophyVideos(game, name, Math.max(limit * 4, 60));
        const moreFiltered = more.filter(v => !savedSet.has(v.id));
        uniqueCandidates = uniqueById([...uniqueCandidates, ...moreFiltered]);
      }

      const finalResults = uniqueCandidates.slice(0, limit);

      if (!finalResults || finalResults.length === 0) {
        return interaction.editReply(`Todos os vídeos encontrados para **${game} — ${name}** já estão salvos no canal de controle.`);
      }

      // 4) Salvar os novos vídeos selecionados no canal DB (apenas os que ainda não estão lá). Atualiza savedSet internamente.
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
