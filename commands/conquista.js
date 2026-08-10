// Requisitos: node 18+ (fetch builtin) ou instalar node-fetch.
// Defina YT_API_KEY no Railway (Google API key com YouTube Data API v3 ativada).

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
  const shortItems = (shortResp.items || []).map(it => ({
    id: it.id.videoId,
    title: it.snippet.title,
    channelTitle: it.snippet.channelTitle,
    url: `https://youtu.be/${it.id.videoId}`
  }));

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
  const allMax = Math.max(10, maxResults * 3);
  const allUrl = `${base}?key=${apiKey}&part=snippet&type=video&order=relevance&maxResults=${allMax}&q=${encodeURIComponent(q)}`;
  const allResp = await fetch(allUrl).then(r => r.json());
  const allItems = (allResp.items || []).map(it => ({
    id: it.id.videoId,
    title: it.snippet.title,
    channelTitle: it.snippet.channelTitle,
    url: `https://youtu.be/${it.id.videoId}`
  }));

  if (allItems.length === 0) return [];

  // Obter durations dos vídeos retornados e ordenar: curtos primeiro (menor duration)
  const ids = allItems.map(i => i.id).join(',');
  const vidsDet = await fetch(`${videosEndpoint}?key=${apiKey}&part=contentDetails&id=${ids}`).then(r => r.json());
  const durMap = {};
  (vidsDet.items || []).forEach(d => { durMap[d.id] = isoDurationToSeconds(d.contentDetails.duration); });

  const enriched = allItems.map(i => ({
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

      const results = await searchTrophyVideos(game, name, limit);
      if (!results || results.length === 0) {
        return interaction.editReply(`Não consegui encontrar vídeos para: **${game} — ${name}**.`);
      }

      const embed = new EmbedBuilder()
        .setTitle(`Resultados: ${game} — ${name}`)
        .setDescription('Priorizando vídeos curtos (shorts). Idioma não é filtrado.')
        .setColor(0x1E90FF);

      results.forEach((r, idx) => {
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
