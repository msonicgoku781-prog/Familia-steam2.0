// ============================================================
// BOT STEAM FAMÍLIA - VERSÃO COMPLETA (12 JOGOS)
// ============================================================

console.log('========================================');
console.log('🚀 BOT STEAM FAMÍLIA - INICIANDO');
console.log(`📅 ${new Date().toLocaleString()}`);
console.log(`🆔 Node.js: ${process.version}`);
console.log('========================================');

// 🔥 SUPRIME AVISOS EXPERIMENTAIS
process.env.NODE_NO_WARNINGS = '1';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

// ============================================================
// 1. VARIÁVEIS DE AMBIENTE
// ============================================================
const {
  DISCORD_TOKEN, STEAM_KEY, STEAM_IDS, CHANNEL_ID, RANKING_CHANNEL_ID,
  ACHIEVEMENT_CHANNEL_ID, QUERO_CHANNEL_ID, RULES_CHANNEL_ID, DONO_ID, YOUTUBE_API_KEY
} = process.env;

if (!DISCORD_TOKEN || !STEAM_KEY || !STEAM_IDS || !CHANNEL_ID || !QUERO_CHANNEL_ID || !RULES_CHANNEL_ID) {
  console.error('❌ Variáveis obrigatórias ausentes.');
  process.exit(1);
}
if (!YOUTUBE_API_KEY) console.warn('⚠️ YOUTUBE_API_KEY não definida. Busca de vídeos não funcionará.');
if (!ACHIEVEMENT_CHANNEL_ID) console.warn('⚠️ ACHIEVEMENT_CHANNEL_ID não definida. Conquistas não serão notificadas.');

const STEAM_IDS_ARRAY = STEAM_IDS.split(',').map(id => id.trim());
const QUERO_CHANNEL = QUERO_CHANNEL_ID;
const RULES_CHANNEL = RULES_CHANNEL_ID;

// ============================================================
// 2. MAPEAMENTO DOS MEMBROS
// ============================================================
const MEMBROS = {
  '76561198127320557': { nome: 'Gardemi', discordId: '663789211152941065' },
  '76561197967265286': { nome: 'Marlon', discordId: '1022183877114069083' },
  '76561198446717315': { nome: 'WoollySkills', discordId: '479817686218702849' },
  '76561198110004039': { nome: 'Venum', discordId: '336204841972137995' },
  '76561198848231901': { nome: 'Mosk', discordId: '499311499504910344' },
  '76561198406551864': { nome: 'DollynhoMococa', discordId: '340610951193690113' }
};

// ============================================================
// 3. CONSTANTES
// ============================================================
const RANKING_VERSION = 7;
const RANKING_VALUES = {
  '76561198127320557': 127, '76561197967265286': 127, '76561198848231901': 15,
  '76561198446717315': 17, '76561198110004039': 12, '76561198406551864': 0
};
const ACHIEVEMENT_EMOJI = '<:Trofeu:1525724119142891571>';
const WISHLIST_LINKS_FALLBACK = {
  '76561198127320557': 'https://store.steampowered.com/wishlist/id/gardemi14/?st=9781845176545064172',
  '76561197967265286': 'https://store.steampowered.com/wishlist/id/marlon5/?st=12031400973950461745',
  '76561198446717315': 'https://store.steampowered.com/wishlist/id/WoollySkills/?st=13976153632286308648',
  '76561198110004039': 'https://store.steampowered.com/wishlist/id/venum781/?sort=discount&st=15535079369621866391',
  '76561198848231901': 'https://store.steampowered.com/wishlist/profiles/76561198848231901/?sort=dateadded&st=12664633540339000937',
  '76561198406551864': 'https://store.steampowered.com/wishlist/profiles/76561198406551864/?st=9055044468942286935'
};

// ============================================================
// 4. BANCO DE DADOS E CACHE (ARMAZENADOS COMO ANEXOS)
// ============================================================
let db = null, dbMessageId = null, videoCache = {}, videoCacheMessageId = null;
const VIDEO_CACHE_FILENAME = 'video_cache.json';
let globalVideoLinksMap = new Map();

function criarDBInicial() {
  const ranking = {};
  for (const [steamId, jogos] of Object.entries(RANKING_VALUES)) {
    const member = MEMBROS[steamId];
    if (member) ranking[steamId] = { nome: member.nome, jogos, steamId, discordId: member.discordId };
  }
  return {
    ranking,
    conquistas: {},
    historicoJogos: {},
    ultimaMensagemRankingId: null,
    lancamentosNotificados: {},
    jogosSemConquistas: {},
    rankingVersion: RANKING_VERSION,
    ultimaVerificacao: {},
    jogosAnunciados: [],
    regrasEnviadas: false
  };
}

async function carregarDBDoCanal() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return null;
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const dbMsg = messages.find(m => m.content === 'DB_FILE' && m.attachments.size > 0);
    if (dbMsg) {
      dbMessageId = dbMsg.id;
      const response = await axios.get(dbMsg.attachments.first().url, { responseType: 'json' });
      return response.data;
    }
  } catch (e) { console.error('❌ Erro ao carregar banco:', e); }
  return null;
}

async function salvarDBNoCanal() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return false;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const dbMessages = messages.filter(m => m.content === 'DB_FILE' && m.attachments.size > 0);
    const attach = new AttachmentBuilder(Buffer.from(JSON.stringify(db, null, 2), 'utf-8'), { name: 'db.json' });

    if (dbMessages.size === 0) {
      const msg = await channel.send({ content: 'DB_FILE', files: [attach] });
      dbMessageId = msg.id;
    } else if (dbMessages.size > 1) {
      for (const [, msg] of dbMessages) await msg.delete().catch(() => {});
      const msg = await channel.send({ content: 'DB_FILE', files: [attach] });
      dbMessageId = msg.id;
    } else {
      const existing = dbMessages.first();
      if (dbMessageId && dbMessageId === existing.id) {
        await existing.edit({ content: 'DB_FILE', files: [attach] });
      } else {
        await existing.delete().catch(() => {});
        const msg = await channel.send({ content: 'DB_FILE', files: [attach] });
        dbMessageId = msg.id;
      }
    }
    return true;
  } catch (e) { console.error('❌ Erro ao salvar banco:', e); return false; }
}

async function inicializarDB() {
  const dados = await carregarDBDoCanal();
  if (dados) {
    db = dados;
    for (const k of ['ranking', 'conquistas', 'historicoJogos', 'lancamentosNotificados', 'jogosSemConquistas', 'ultimaVerificacao'])
      if (!db[k]) db[k] = {};
    if (!db.jogosAnunciados) db.jogosAnunciados = [];
    if (!db.regrasEnviadas) db.regrasEnviadas = false;
    if (!db.ultimaMensagemRankingId) db.ultimaMensagemRankingId = null;
    if (!db.rankingVersion) db.rankingVersion = 0;
    if (db.rankingVersion < RANKING_VERSION) {
      for (const [steamId, jogos] of Object.entries(RANKING_VALUES)) {
        const member = MEMBROS[steamId];
        if (member && db.ranking[steamId]) db.ranking[steamId].jogos = jogos;
        else if (member) db.ranking[steamId] = { nome: member.nome, jogos, steamId, discordId: member.discordId };
      }
      db.rankingVersion = RANKING_VERSION;
      await salvarDBNoCanal();
    }
  } else {
    db = criarDBInicial();
    await salvarDBNoCanal();
  }
}

// --- CACHE DE VÍDEOS ---
async function carregarVideoCache() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return;
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const cacheMsg = messages.find(m => m.content === 'VIDEO_CACHE' && m.attachments.size > 0);
    if (cacheMsg) {
      videoCacheMessageId = cacheMsg.id;
      const response = await axios.get(cacheMsg.attachments.first().url, { responseType: 'json' });
      videoCache = response.data;
    }
    videoCache = videoCache || {};
  } catch (e) { videoCache = {}; console.error('❌ Erro ao carregar cache de vídeos:', e); }
}

async function salvarVideoCache() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return false;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const cacheMessages = messages.filter(m => m.content === 'VIDEO_CACHE' && m.attachments.size > 0);
    for (const [, msg] of cacheMessages) if (msg.id !== videoCacheMessageId) await msg.delete().catch(() => {});
    const attach = new AttachmentBuilder(Buffer.from(JSON.stringify(videoCache, null, 2), 'utf-8'), { name: VIDEO_CACHE_FILENAME });
    if (videoCacheMessageId) {
      const antiga = await channel.messages.fetch(videoCacheMessageId).catch(() => null);
      if (antiga) { await antiga.edit({ content: 'VIDEO_CACHE', files: [attach] }); return true; }
      videoCacheMessageId = null;
    }
    const nova = await channel.send({ content: 'VIDEO_CACHE', files: [attach] });
    videoCacheMessageId = nova.id;
    return true;
  } catch (e) { console.error('❌ Erro ao salvar cache de vídeos:', e); return false; }
}

async function getVideoFromCache(jogo, conquista) {
  const key = `${jogo}|${conquista}`.toLowerCase();
  return videoCache[key] || null;
}
async function saveVideoToCache(jogo, conquista, info) {
  const key = `${jogo}|${conquista}`.toLowerCase();
  videoCache[key] = info;
  salvarVideoCache().catch(e => console.error('❌ Erro ao salvar cache:', e));
}

// ============================================================
// 5. FUNÇÕES DE LISTA /quero E WISHLIST
// ============================================================
async function getQueroMessage(discordId) {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return null;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    return messages.find(m => m.content.startsWith(`QUERO_${discordId}:`)) || null;
  } catch (_) { return null; }
}
async function loadQueroList(discordId) {
  const msg = await getQueroMessage(discordId);
  if (!msg) return [];
  try { return JSON.parse(msg.content.substring(msg.content.indexOf(':') + 1).trim()) || []; } catch (_) { return []; }
}
async function saveQueroList(discordId, list) {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return false;
  const content = `QUERO_${discordId}: ${JSON.stringify(list)}`;
  try {
    const msg = await getQueroMessage(discordId);
    if (msg) await msg.edit(content);
    else await channel.send(content);
    return true;
  } catch (_) { return false; }
}
async function adicionarQuero(discordId, appid, nome, link) {
  const lista = await loadQueroList(discordId);
  if (lista.some(j => j.appid === appid)) return { sucesso: false, motivo: 'ja_na_lista' };
  for (const sid of STEAM_IDS_ARRAY) {
    if ((db.historicoJogos[sid] || []).includes(appid)) {
      const dono = MEMBROS[sid]?.nome || sid;
      return { sucesso: false, motivo: 'ja_na_familia', dono };
    }
  }
  let comingSoon = null, emPromocao = false;
  try { const d = await getGameDetails(appid); if (d && d.release_date) comingSoon = d.release_date.coming_soon === true; } catch (_) {}
  try { const p = await getPriceOverview(appid); if (p) emPromocao = p.emPromocao && p.desconto > 0; } catch (_) {}
  lista.push({ appid, nome, link, adicionado_em: new Date().toISOString(), coming_soon: comingSoon, ultimoEstadoPromocao: emPromocao });
  await saveQueroList(discordId, lista);
  return { sucesso: true };
}
async function removerQuero(discordId, appid) {
  const lista = await loadQueroList(discordId);
  const nova = lista.filter(j => j.appid !== appid);
  if (nova.length < lista.length) { await saveQueroList(discordId, nova); return true; }
  return false;
}

// --- WISHLIST LINK ---
async function getWishlistLinkMessage(discordId) {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return null;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    return messages.find(m => m.content.startsWith(`WISHLIST_LINK_${discordId}:`)) || null;
  } catch (_) { return null; }
}
async function loadWishlistLink(discordId) {
  const msg = await getWishlistLinkMessage(discordId);
  if (!msg) return null;
  try { return msg.content.substring(msg.content.indexOf(':') + 1).trim() || null; } catch (_) { return null; }
}
async function saveWishlistLink(discordId, link) {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return false;
  const content = `WISHLIST_LINK_${discordId}: ${link}`;
  try {
    const msg = await getWishlistLinkMessage(discordId);
    if (msg) await msg.edit(content);
    else await channel.send(content);
    return true;
  } catch (_) { return false; }
}

// ============================================================
// 6. FUNÇÕES DA STEAM API
// ============================================================
let ultimaRequisicao = 0;
const MIN_INTERVALO = 1500;
async function fetchSteam(url, params = {}, retries = 3) {
  const agora = Date.now();
  const espera = Math.max(0, MIN_INTERVALO - (agora - ultimaRequisicao));
  if (espera > 0) await new Promise(r => setTimeout(r, espera));
  ultimaRequisicao = Date.now();
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await axios.get(url, { params: { ...params, key: STEAM_KEY }, timeout: 10000, headers: { 'User-Agent': 'SteamFamilyBot/2.0' } });
      if (resp.status === 429) { await new Promise(r => setTimeout(r, 2000 * (i + 1))); continue; }
      return resp.data;
    } catch (e) {
      if (e.response?.status === 429) { await new Promise(r => setTimeout(r, 5000 * (i + 1))); continue; }
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
}
async function getOwnedGames(steamId) { const d = await fetchSteam('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/', { steamid: steamId, include_appinfo: true, include_shared_games: true, format: 'json' }); return d?.response?.games || []; }
async function getRecentlyPlayedGames(steamId, limit = 3) { const d = await fetchSteam('https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/', { steamid: steamId, count: limit, format: 'json' }); return d?.response?.games || []; }
async function getPlayerAchievements(steamId, appId) { const d = await fetchSteam('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/', { steamid: steamId, appid: appId, format: 'json' }); return d?.playerstats?.achievements || []; }
async function getGameDetails(appId) {
  try { const r = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=portuguese`, { timeout: 10000 }); return r.data?.[appId]?.success ? r.data[appId].data : null; } catch (_) { return null; }
}
async function searchGameOnSteam(query) {
  const data = await fetchSteam('https://store.steampowered.com/api/storesearch', { term: query, l: 'portuguese', cc: 'BR' }, 1);
  if (data?.items?.length) {
    const item = data.items[0];
    return { appid: item.id, nome: item.name, link: `https://store.steampowered.com/app/${item.id}`, capa: item.tiny_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/header.jpg` };
  }
  return null;
}
async function getPriceOverview(appId) {
  try {
    const r = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=br`, { timeout: 10000 });
    if (r.data?.[appId]?.success) {
      const price = r.data[appId].data.price_overview;
      if (price) return { nome: r.data[appId].data.name, appid: appId, link: `https://store.steampowered.com/app/${appId}`, precoAtual: price.final_formatted, precoAntigo: price.initial_formatted, emPromocao: price.final < price.initial, desconto: price.discount_percent || 0 };
    }
  } catch (_) {}
  return null;
}
async function getCurrentGame(steamId) {
  try {
    const data = await fetchSteam('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId }, 2);
    const player = data?.response?.players?.[0];
    if (player?.gameid) return { appid: parseInt(player.gameid), name: player.gameextrainfo || `Jogo ${player.gameid}` };
  } catch (e) {}
  return null;
}

// --- WISHLIST ---
async function getSteamWishlist(steamId) {
  try {
    const url = `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/`;
    const resp = await axios.get(url, { params: { l: 'portuguese', v: '1' }, timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!resp.data || typeof resp.data !== 'object' || !Object.keys(resp.data).length) return [];
    return Object.entries(resp.data).filter(([_, d]) => d && d.name).map(([appid, d]) => ({ appid: parseInt(appid), nome: d.name, link: `https://store.steampowered.com/app/${appid}` }));
  } catch (e) { return []; }
}
async function resolveVanityUrl(vanityName) {
  try {
    const r = await axios.get('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/', { params: { key: STEAM_KEY, vanityurl: vanityName }, timeout: 10000 });
    return r.data?.response?.success === 1 ? r.data.response.steamid : null;
  } catch (_) { return null; }
}
async function getSteamWishlistFromLink(link) {
  const profileMatch = link.match(/wishlist\/profiles\/(\d+)/);
  if (profileMatch) return await getSteamWishlist(profileMatch[1]);
  const idMatch = link.match(/wishlist\/id\/([^\/\?]+)/);
  if (idMatch) {
    const steamId = await resolveVanityUrl(idMatch[1]);
    if (steamId) return await getSteamWishlist(steamId);
  }
  return [];
}

// --- CONQUISTAS COM PORCENTAGEM ---
async function getPlayerAchievementsWithPercent(steamId, appId) {
  try {
    const playerData = await fetchSteam('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/', { steamid: steamId, appid: appId, format: 'json' });
    if (!playerData?.playerstats?.achievements) return null;
    let global = {};
    try {
      const g = await fetchSteam('https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: appId, format: 'json' });
      if (g?.achievementpercentages?.achievements) for (const a of g.achievementpercentages.achievements) global[a.name] = parseFloat(a.percent);
    } catch (_) {}
    const achievements = playerData.playerstats.achievements.map(a => ({ ...a, percent: global[a.apiname] || 0 }));
    return { achievements, gameName: playerData.playerstats.gameName || `Jogo ${appId}` };
  } catch (e) { return null; }
}

// --- CACHES DE NOMES E TRADUÇÃO ---
const achievementNameCache = {}, achievementDescriptionCache = {};
async function getAchievementDisplayName(appId, apiname) {
  const key = `${appId}_${apiname}`;
  if (achievementNameCache[key]) return achievementNameCache[key];
  try {
    const data = await fetchSteam('https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/', { key: STEAM_KEY, appid: appId, l: 'portuguese' }, 2);
    const ach = data?.game?.availableGameStats?.achievements?.find(a => a.name === apiname);
    if (ach?.displayName) { achievementNameCache[key] = ach.displayName; return ach.displayName; }
  } catch (_) {}
  achievementNameCache[key] = apiname;
  return apiname;
}
async function getAchievementDescription(appId, apiname) {
  const key = `${appId}_${apiname}`;
  if (achievementDescriptionCache[key]) return achievementDescriptionCache[key];
  try {
    const data = await fetchSteam('https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/', { key: STEAM_KEY, appid: appId, l: 'portuguese' }, 2);
    const ach = data?.game?.availableGameStats?.achievements?.find(a => a.name === apiname);
    if (ach?.description) { achievementDescriptionCache[key] = ach.description; return ach.description; }
  } catch (_) {}
  return null;
}
const translationCache = new Map();
async function traduzirTexto(texto) {
  if (!texto || texto.length < 3) return texto;
  const key = texto;
  if (translationCache.has(key)) return translationCache.get(key);
  try {
    const r = await axios.get('https://api.mymemory.translated.net/get', { params: { q: texto, langpair: 'en|pt', de: 'steam-family-bot' }, timeout: 5000 });
    if (r.data?.responseData?.translatedText && !r.data.responseData.translatedText.includes('INVALID')) {
      translationCache.set(key, r.data.responseData.translatedText);
      return r.data.responseData.translatedText;
    }
  } catch (_) {}
  translationCache.set(key, texto);
  return texto;
}

// ============================================================
// 7. COMPATIBILIDADE (mantida para outros comandos, mas não usada no /conquista)
// ============================================================
const JOGOS_INCOMPATIVEIS = {
  33930: "Arma 2: Operation Arrowhead", 107410: "Arma 3", 582660: "Black Desert", 1097150: "Fall Guys",
  220240: "Far Cry 3", 298110: "Far Cry 4", 552520: "Far Cry 5", 304390: "FOR HONOR",
  1546970: "Grand Theft Auto III – The Definitive Edition", 12210: "Grand Theft Auto IV: The Complete Edition",
  3240220: "Grand Theft Auto V Enhanced", 271590: "Grand Theft Auto V Legacy", 1547000: "Grand Theft Auto: San Andreas – The Definitive Edition",
  1546990: "Grand Theft Auto: Vice City – The Definitive Edition", 439700: "H1Z1: King of the Kill Test Server",
  269210: "Hero Siege", 1426210: "It Takes Two", 510190: "Lazarus", 1392860: "Little Nightmares III",
  1328670: "Mass Effect Legendary Edition", 204100: "Max Payne 3", 555160: "Pavlov VR", 2129530: "REANIMAL",
  1174180: "Red Dead Redemption 2", 2215260: "Scott Pilgrim vs. The World: The Game – Complete Edition",
  488790: "South Park: The Fractured But Whole", 2001120: "Split Fiction", 1172380: "STAR WARS Jedi: Fallen Order",
  1774580: "STAR WARS Jedi: Survivor", 1527280: "Starship Tunnel", 470220: "UNO", 447040: "Watch Dogs 2", 1222700: "A Way Out"
};
async function verificarCompatibilidadeFamilia(appId) {
  if (JOGOS_INCOMPATIVEIS[appId]) return { compatível: false, motivo: `Este jogo (${JOGOS_INCOMPATIVEIS[appId]}) NÃO é compatível com Family Sharing.` };
  try {
    const d = await getGameDetails(appId);
    if (d) {
      const all = [...(d.publishers || []), ...(d.developers || [])].map(s => s.toLowerCase());
      if (all.some(s => s.includes('ea ') || s.includes('electronic arts') || s === 'ea')) return { compatível: false, motivo: 'Jogos da EA NÃO são compatíveis.' };
      if (all.some(s => s.includes('rockstar'))) return { compatível: false, motivo: 'Jogos da Rockstar NÃO são compatíveis.' };
      if (all.some(s => s.includes('ubisoft'))) return { compatível: false, motivo: 'Jogos da Ubisoft NÃO são compatíveis.' };
      if (d.is_free) return { compatível: false, motivo: 'Jogo gratuito não requer Family Sharing.' };
      if (d.exclude_from_family_sharing) return { compatível: false, motivo: 'Este jogo NÃO é compatível com Family Sharing.' };
      if (!d.price_overview) return { compatível: false, motivo: 'Jogo sem preço definido.' };
      return { compatível: true };
    }
  } catch (_) {}
  return { compatível: true };
}

// ============================================================
// 8. RANKING E REGRAS (COM IMAGEM COMO ANEXO - TOPO)
// ============================================================
function gerarRankingEmbed() {
  const rankingArray = Object.values(db.ranking || {}).sort((a, b) => b.jogos - a.jogos);
  const embed = new EmbedBuilder().setColor(0x00AE86).setTitle('🏆 Ranking da Biblioteca Steam 2026').setThumbnail('https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/1200px-Steam_icon_logo.svg.png').setTimestamp();
  let desc = '';
  rankingArray.forEach((user, i) => {
    const mencao = user.discordId ? `<@${user.discordId}>` : user.nome;
    desc += `${i+1}º **${mencao}** — ${user.jogos} jogos\n`;
  });
  embed.setDescription(desc);
  const total = rankingArray.reduce((acc, u) => acc + u.jogos, 0);
  embed.setFooter({ text: `Total: ${total} jogos • Atualizado ${new Date().toLocaleTimeString()}` });
  return embed;
}
async function enviarRanking() {
  const channel = client.channels.cache.get(RANKING_CHANNEL_ID);
  if (!channel) return;
  if (db.ultimaMensagemRankingId) {
    try { const old = await channel.messages.fetch(db.ultimaMensagemRankingId); if (old) await old.delete(); } catch (_) {}
  }
  const nova = await channel.send({ embeds: [gerarRankingEmbed()] });
  db.ultimaMensagemRankingId = nova.id;
  await salvarDBNoCanal();
}

async function enviarRegras() {
  const channel = client.channels.cache.get(RULES_CHANNEL);
  if (!channel) return;

  let imageBuffer = null;
  const imageUrl = 'https://cdn.discordapp.com/attachments/1015679704197509171/1537013046436962455/image.png?ex=6a7d7e72&is=6a7c2cf2&hm=f1c1c80c0f2f6aa0d18592b7bf86616a42e61ef0c758eeb2daafdd67b7343f8f&';
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
    imageBuffer = Buffer.from(response.data);
  } catch (e) {
    console.error('❌ Erro ao baixar imagem das regras:', e.message);
  }

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle('📜 REGRAS DO SERVIDOR')
    .setThumbnail('https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/1200px-Steam_icon_logo.svg.png')
    .setDescription(
      '**Bem-vindo à Família Steam!** 🎮\n\n' +
      '**📌 REGRAS GERAIS**\n' +
      '1️⃣ **Respeito acima de tudo** – Nada de ofensas, discurso de ódio ou assédio.\n' +
      '2️⃣ **Sem spam ou flood** – Evite enviar mensagens repetitivas ou conteúdo irrelevante.\n' +
      '3️⃣ **Conteúdo apropriado** – Nada de NSFW, gore ou material impróprio.\n' +
      '4️⃣ **Divulgação proibida** – Não divulgue outros servidores, produtos ou serviços sem permissão.\n' +
      '5️⃣ **Use os canais certos** – Cada canal tem um propósito. Respeite as categorias.\n' +
      '6️⃣ **Seja ativo e participe** – A família cresce com a interação de todos!\n\n' +
      '**🤖 COMANDOS DISPONÍVEIS**\n' +
      '`/tem [jogo]` – Verifica se um jogo está na biblioteca da família.\n' +
      '`/ranking` – Mostra o ranking de jogos da família.\n' +
      '`/quero [jogo]` – Adiciona um jogo à sua lista de desejos.\n' +
      '`/quero-listar` – Lista os jogos da sua lista /quero.\n' +
      '`/quero-remover [jogo]` – Remove um jogo da sua lista /quero.\n' +
      '`/wishlist-link` – Registra o link da sua wishlist para receber notificações.\n' +
      '`/dbstatus` – Status do banco de dados (apenas dono).\n' +
      '`/conquista jogo:"nome"` – Mostra todas as conquistas de um jogo com vídeos guia.\n\n' +
      '**🔔 NOTIFICAÇÕES**\n' +
      '• 🆕 Novos jogos compatíveis são anunciados com `@everyone`.\n' +
      '• 🏆 Conquistas são monitoradas e notificadas no canal de conquistas.\n' +
      '• 📢 Lançamentos e promoções de jogos da sua lista `/quero` são enviados por DM.\n' +
      '• 🎯 Quando alguém comprar um jogo da sua **wishlist da Steam**, você recebe uma DM!\n\n' +
      '**📌 CANAIS IMPORTANTES**\n' +
      `• 📢 **Notificações:** <#${CHANNEL_ID}>\n` +
      `• 🏆 **Conquistas:** <#${ACHIEVEMENT_CHANNEL_ID}>\n` +
      `• 📋 **Ranking:** <#${RANKING_CHANNEL_ID}>\n` +
      `• 📜 **Regras:** <#${RULES_CHANNEL}>\n\n` +
      '**✅ REGRAS SUJEITAS A MUDANÇAS** – A administração pode atualizar as regras a qualquer momento.\n' +
      '**Divirta-se e bem-vindo à família!** 🚀'
    )
    .setTimestamp()
    .setFooter({ text: 'Steam Família - Regras e Comandos', iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/1200px-Steam_icon_logo.svg.png' });

  const files = [];
  if (imageBuffer) {
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'regras_banner.png' });
    files.push(attachment);
  }

  await channel.send({ files, embeds: [embed] });
}

async function verificarEEnviarRegras() {
  const channel = client.channels.cache.get(RULES_CHANNEL);
  if (!channel) return;

  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const regrasMsg = messages.find(m =>
      m.author.id === client.user.id &&
      m.embeds.length > 0 &&
      m.embeds[0].title === '📜 REGRAS DO SERVIDOR'
    );

    if (regrasMsg) {
      console.log('📜 Mensagem de regras já existe no canal. Nada a fazer.');
      return;
    }

    await enviarRegras();
    console.log('📜 Mensagem de regras enviada (não havia mensagem no canal).');
    db.regrasEnviadas = true;
    await salvarDBNoCanal();
  } catch (error) {
    console.error('❌ Erro ao verificar/enviar regras:', error);
  }
}

// ============================================================
// 9. VERIFICAÇÃO DE CONQUISTAS (COM LOCK PARA EVITAR DUPLICATAS)
// ============================================================
let isCheckingAchievements = false;

async function verificarConquistas(steamId, gamesToCheck, mention, userName) {
  if (!gamesToCheck?.length || !ACHIEVEMENT_CHANNEL_ID) return;
  let channel = client.channels.cache.get(ACHIEVEMENT_CHANNEL_ID);
  if (!channel) { try { channel = await client.channels.fetch(ACHIEVEMENT_CHANNEL_ID); client.channels.cache.set(channel.id, channel); } catch (e) { return; } }
  if (!db.conquistas[steamId]) db.conquistas[steamId] = {};
  for (const game of gamesToCheck) {
    const appid = game.appid, gameName = game.name || `Jogo ${appid}`;
    let iconMap = {};
    try {
      const schema = await fetchSteam('https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/', { key: STEAM_KEY, appid, l: 'portuguese' }, 2);
      if (schema?.game?.availableGameStats?.achievements)
        for (const a of schema.game.availableGameStats.achievements) if (a.icon) iconMap[a.name] = a.icon;
    } catch (_) {}
    let conquistasData;
    try { conquistasData = await getPlayerAchievementsWithPercent(steamId, appid); } catch (e) {
      if (e.response?.status === 400) { if (!db.jogosSemConquistas) db.jogosSemConquistas = {}; db.jogosSemConquistas[appid] = { nome: gameName, data: new Date().toISOString(), motivo: 'sem_conquistas' }; await salvarDBNoCanal(); continue; }
      continue;
    }
    if (!conquistasData?.achievements?.length) { if (!db.jogosSemConquistas) db.jogosSemConquistas = {}; db.jogosSemConquistas[appid] = { nome: gameName, data: new Date().toISOString(), motivo: 'sem_conquistas' }; await salvarDBNoCanal(); continue; }
    const desbloqueadas = conquistasData.achievements.filter(c => c.achieved === 1);
    const total = desbloqueadas.length, totalJogo = conquistasData.achievements.length;
    if (!db.conquistas[steamId][appid]) {
      db.conquistas[steamId][appid] = { total, nomes: desbloqueadas.map(c => c.apiname), totalJogo };
      await salvarDBNoCanal();
      continue;
    }
    const anterior = db.conquistas[steamId][appid];
    const totalAntigo = anterior.total || 0, antigos = anterior.nomes || [];
    const novas = desbloqueadas.filter(c => !antigos.includes(c.apiname));
    if (!novas.length) continue;
    let contador = 0;
    for (const ach of novas) {
      contador++;
      const progressoAtual = totalAntigo + contador, faltam = totalJogo - progressoAtual;
      const nomeBonito = await getAchievementDisplayName(appid, ach.apiname);
      let iconUrl = null;
      const iconName = iconMap[ach.apiname];
      if (iconName) iconUrl = iconName.startsWith('http') ? iconName : `https://cdn.steamstatic.com/steamcommunity/public/images/apps/${appid}/${iconName}`;
      let gameImageUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
      try { const d = await getGameDetails(appid); if (d?.header_image) gameImageUrl = d.header_image; } catch (_) {}
      let imageToUse = iconUrl || gameImageUrl;
      if (!imageToUse || imageToUse.includes('null') || imageToUse.includes('undefined')) imageToUse = gameImageUrl;
      const percent = ach.percent || 0, percentText = percent > 0 ? `${percent.toFixed(1)}% dos jogadores` : 'Dados indisponíveis';
      let rarezaEmoji = '', rarezaText = '';
      if (percent > 0 && percent <= 5) { rarezaEmoji = '💎'; rarezaText = ' (RARÍSSIMA!)'; }
      else if (percent > 5 && percent <= 15) { rarezaEmoji = '🌟'; rarezaText = ' (Rara)'; }
      const embed = new EmbedBuilder().setColor(percent > 0 && percent <= 5 ? 0xFFD700 : 0x00AE86)
        .setTitle(`${ACHIEVEMENT_EMOJI} ${userName} desbloqueou uma conquista!`)
        .setDescription(`**${nomeBonito}** ${rarezaEmoji}`)
        .addFields(
          { name: '🎮 Jogo', value: gameName, inline: true },
          { name: '👤 Jogador', value: mention, inline: true },
          { name: '📊 Progresso', value: `${progressoAtual}/${totalJogo} ${faltam > 0 ? `(faltam ${faltam})` : '🎉 COMPLETO!'}`, inline: true },
          { name: '📈 Raridade', value: `${percentText}${rarezaText}`, inline: true }
        ).setThumbnail(imageToUse).setFooter({ text: `🏆 ${userName} • ${gameName} • ${new Date().toLocaleTimeString()}`, iconURL: client.user.displayAvatarURL() }).setTimestamp();
      try { await channel.send({ embeds: [embed] }); } catch (_) {}
    }
    db.conquistas[steamId][appid] = { total, nomes: desbloqueadas.map(c => c.apiname), totalJogo };
    await salvarDBNoCanal();
  }
}

// ============================================================
// 10. VERIFICAÇÕES PERIÓDICAS
// ============================================================
let isCheckingNewGames = false;
let isCheckingAchievementsLock = false;

async function checkAchievements() {
  if (isCheckingAchievementsLock) return;
  isCheckingAchievementsLock = true;
  try {
    for (const steamId of STEAM_IDS_ARRAY) {
      const member = MEMBROS[steamId];
      if (!member) continue;
      const limit = member.nome === 'Gardemi' ? 6 : 12;
      const recentGames = await getRecentlyPlayedGames(steamId, limit);
      if (!recentGames?.length) continue;
      const unique = [], seen = new Set();
      for (const g of recentGames) if (!seen.has(g.appid)) { seen.add(g.appid); unique.push(g); }
      const agora = Date.now(), INTERVALO = 5 * 60 * 1000;
      const toCheck = [];
      for (const game of unique) {
        const appid = game.appid;
        if (db.jogosSemConquistas?.[appid]) {
          const diffMin = (Date.now() - new Date(db.jogosSemConquistas[appid].data).getTime()) / 60000;
          if (diffMin >= 5) { delete db.jogosSemConquistas[appid]; await salvarDBNoCanal(); }
          else continue;
        }
        const ultima = db.ultimaVerificacao?.[steamId]?.[appid] || 0;
        if (agora - ultima > INTERVALO) toCheck.push(game);
      }
      if (!toCheck.length) continue;
      await verificarConquistas(steamId, toCheck, `<@${member.discordId}>`, member.nome);
      if (!db.ultimaVerificacao) db.ultimaVerificacao = {};
      if (!db.ultimaVerificacao[steamId]) db.ultimaVerificacao[steamId] = {};
      for (const g of toCheck) db.ultimaVerificacao[steamId][g.appid] = Date.now();
      await salvarDBNoCanal();
    }
  } catch (e) {
    console.error('❌ Erro em checkAchievements:', e);
  } finally {
    isCheckingAchievementsLock = false;
  }
}

async function checkNewGames() {
  if (isCheckingNewGames) return;
  isCheckingNewGames = true;
  try {
    const channelNotif = client.channels.cache.get(CHANNEL_ID);
    if (!channelNotif) return;
    for (const steamId of STEAM_IDS_ARRAY) {
      const allGames = await getOwnedGames(steamId);
      if (!allGames.length) continue;
      const member = MEMBROS[steamId];
      if (!member) continue;
      if (!db.historicoJogos[steamId]) {
        db.historicoJogos[steamId] = allGames.map(g => g.appid);
        await salvarDBNoCanal();
        continue;
      }
      const oldIds = db.historicoJogos[steamId] || [];
      const newGames = allGames.filter(g => !oldIds.includes(g.appid));
      if (!newGames.length) continue;

      const updatedIds = [...oldIds, ...newGames.map(g => g.appid)];
      db.historicoJogos[steamId] = updatedIds;
      await salvarDBNoCanal();

      await verificarJogosQueroComprados(steamId, newGames, member.nome);
      await verificarJogosWishlistComprados(steamId, newGames, member.nome);

      for (const game of newGames) {
        const appid = game.appid;
        const chave = `${steamId}|${appid}`;
        if (db.jogosAnunciados.includes(chave)) continue;

        const compat = await verificarCompatibilidadeFamilia(appid);
        if (!compat.compatível) continue;

        db.jogosAnunciados.push(chave);
        await salvarDBNoCanal();

        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('🛒 NOVO JOGO NA FAMÍLIA!')
          .setDescription(`**${member.nome}** agora tem acesso a **${game.name}**!\n\n✅ **Compatível com Família Steam!**`)
          .addFields({ name: '🔗 Link', value: `[Ver na Steam](https://store.steampowered.com/app/${appid})`, inline: false })
          .setTimestamp();
        const d = await getGameDetails(appid);
        if (d?.header_image) embed.setImage(d.header_image);
        await channelNotif.send({ content: `@everyone 🎉 **${member.nome}** comprou um novo jogo!`, embeds: [embed] });

        if (db.ranking[steamId]) {
          db.ranking[steamId].jogos += 1;
          await salvarDBNoCanal();
          await enviarRanking();
        }
      }
    }
  } catch (e) {
    console.error('❌ Erro em checkNewGames:', e);
  } finally {
    isCheckingNewGames = false;
  }
}

// --- VERIFICAÇÕES DE /quero (LANÇAMENTOS E PROMOÇÕES) ---
async function verificarLancamentosQuero() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return;
  const messages = await channel.messages.fetch({ limit: 100 });
  const queroMsgs = messages.filter(m => m.content.startsWith('QUERO_'));
  for (const [, msg] of queroMsgs) {
    const discordId = msg.content.split(':')[0].replace('QUERO_', '');
    const lista = await loadQueroList(discordId);
    if (!lista.length) continue;
    let usuario; try { usuario = await client.users.fetch(discordId); } catch (_) { continue; }
    for (const jogo of lista) {
      const chave = `${discordId}_${jogo.appid}`;
      if (db.lancamentosNotificados?.[chave] || jogo.coming_soon === false) continue;
      const detalhes = await getGameDetails(jogo.appid);
      if (!detalhes) continue;
      if (detalhes.release_date?.coming_soon === false && detalhes.price_overview) {
        const embed = new EmbedBuilder().setColor(0x00FF00).setTitle(`🎮 ${jogo.nome} FOI LANÇADO!`).setURL(jogo.link)
          .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${jogo.appid}/header.jpg`)
          .addFields({ name: '💰 Preço', value: detalhes.price_overview.final_formatted || 'Ver na loja', inline: true },
            { name: '🔗 Link', value: `[Comprar na Steam](${jogo.link})`, inline: false })
          .setFooter({ text: 'Steam Família - Lançamentos /quero' }).setTimestamp();
        try { await usuario.send({ embeds: [embed] }); if (!db.lancamentosNotificados) db.lancamentosNotificados = {}; db.lancamentosNotificados[chave] = Date.now(); jogo.coming_soon = false; await saveQueroList(discordId, lista); } catch (_) {}
      }
    }
  }
}
async function verificarPromocoesQuero() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return;
  const messages = await channel.messages.fetch({ limit: 100 });
  const queroMsgs = messages.filter(m => m.content.startsWith('QUERO_'));
  for (const [, msg] of queroMsgs) {
    const discordId = msg.content.split(':')[0].replace('QUERO_', '');
    const lista = await loadQueroList(discordId);
    if (!lista.length) continue;
    let usuario; try { usuario = await client.users.fetch(discordId); } catch (_) { continue; }
    for (const jogo of lista) {
      const preco = await getPriceOverview(jogo.appid);
      if (!preco) continue;
      const emPromocao = preco.emPromocao && preco.desconto > 0;
      const anterior = jogo.ultimoEstadoPromocao;
      if (emPromocao && (anterior === false || anterior === null)) {
        const embed = new EmbedBuilder().setColor(0x00FF00).setTitle(`🎉 ${jogo.nome} está em promoção!`).setURL(jogo.link)
          .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${jogo.appid}/header.jpg`)
          .addFields(
            { name: '💰 Preço antigo', value: `~~${preco.precoAntigo}~~`, inline: true },
            { name: '💰 Preço atual', value: `**${preco.precoAtual}**`, inline: true },
            { name: '📉 Desconto', value: `**${preco.desconto}% OFF**`, inline: true },
            { name: '🔗 Link', value: `[Comprar na Steam](${preco.link})`, inline: false }
          ).setFooter({ text: 'Steam Família - Promoções /quero' }).setTimestamp();
        try { await usuario.send({ embeds: [embed] }); } catch (_) {}
        jogo.ultimoEstadoPromocao = true;
        await saveQueroList(discordId, lista);
      } else if (!emPromocao && anterior === true) {
        jogo.ultimoEstadoPromocao = false;
        await saveQueroList(discordId, lista);
      } else if (anterior === null) {
        jogo.ultimoEstadoPromocao = emPromocao;
        await saveQueroList(discordId, lista);
      }
    }
  }
}

// --- VERIFICAÇÕES DE COMPRAS (LISTA /quero E WISHLIST) ---
async function verificarJogosQueroComprados(steamId, newGames, comprador) {
  if (!newGames?.length) return;
  for (const [sid, member] of Object.entries(MEMBROS)) {
    if (sid === steamId) continue;
    const lista = await loadQueroList(member.discordId);
    if (!lista.length) continue;
    for (const game of newGames) {
      const jogo = lista.find(j => j.appid === game.appid);
      if (jogo) {
        const embed = new EmbedBuilder().setColor(0x00FF00).setTitle(`🎮 ${comprador} comprou um jogo da sua lista /quero!`)
          .setDescription(`**${game.name || `App ${game.appid}`}** foi adicionado à biblioteca da família!`)
          .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`)
          .addFields(
            { name: '🛒 Comprado por', value: comprador, inline: true },
            { name: '📌 Na sua lista desde', value: new Date(jogo.adicionado_em).toLocaleDateString('pt-BR'), inline: true }
          ).setFooter({ text: 'Steam Família - Alerta /quero' }).setTimestamp();
        try {
          const usuario = await client.users.fetch(member.discordId);
          await usuario.send({ embeds: [embed] });
        } catch (_) {}
      }
    }
  }
}
async function verificarJogosWishlistComprados(steamId, newGames, comprador) {
  if (!newGames?.length) return;
  for (const [sid, member] of Object.entries(MEMBROS)) {
    if (sid === steamId) continue;
    let link = await loadWishlistLink(member.discordId);
    if (!link && WISHLIST_LINKS_FALLBACK[sid]) link = WISHLIST_LINKS_FALLBACK[sid];
    if (!link) continue;
    const wishlist = await getSteamWishlistFromLink(link);
    if (!wishlist.length) continue;
    for (const game of newGames) {
      if (wishlist.find(j => j.appid === game.appid)) {
        const embed = new EmbedBuilder().setColor(0x00FF00).setTitle(`🎮 ${comprador} comprou um jogo da sua wishlist!`)
          .setDescription(`**${game.name || `App ${game.appid}`}** foi adicionado à biblioteca da família!`)
          .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`)
          .addFields(
            { name: '🛒 Comprado por', value: comprador, inline: true },
            { name: '📌 Na sua wishlist', value: '✅ Sim', inline: true }
          ).setFooter({ text: 'Steam Família - Alerta de Wishlist' }).setTimestamp();
        try {
          const usuario = await client.users.fetch(member.discordId);
          await usuario.send({ embeds: [embed] });
        } catch (_) {}
      }
    }
  }
}

// ============================================================
// 11. BUSCA DE VÍDEOS NO YOUTUBE
// ============================================================
async function buscarVideoYouTube(nomeJogo, nomeConquista) {
  const cached = await getVideoFromCache(nomeJogo, nomeConquista);
  if (cached) return cached;
  if (!YOUTUBE_API_KEY) return null;
  try {
    const termo = `${nomeConquista.replace(/[^\w\s]/gi, '').trim()} ${nomeJogo.replace(/[^\w\s]/gi, '').trim()} trophy`;
    const search = await Promise.race([
      axios.get('https://www.googleapis.com/youtube/v3/search', { params: { part: 'snippet', type: 'video', maxResults: 5, q: termo, key: YOUTUBE_API_KEY, order: 'relevance' }, timeout: 5000 }),
      new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 5000))
    ]);
    if (!search.data.items?.length) return null;
    const video = search.data.items[0];
    const info = { id: video.id.videoId, titulo: video.snippet.title, canal: video.snippet.channelTitle, link: `https://www.youtube.com/watch?v=${video.id.videoId}`, views: 0 };
    try {
      const stats = await Promise.race([
        axios.get('https://www.googleapis.com/youtube/v3/videos', { params: { part: 'statistics', id: video.id.videoId, key: YOUTUBE_API_KEY }, timeout: 2000 }),
        new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 2000))
      ]);
      if (stats?.data?.items?.[0]?.statistics) info.views = parseInt(stats.data.items[0].statistics.viewCount) || 0;
    } catch (_) {}
    await saveVideoToCache(nomeJogo, nomeConquista, info);
    return info;
  } catch (_) { return null; }
}

// ============================================================
// 12. CLIENT DISCORD
// ============================================================
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.on('error', (e) => console.error('❌ [ERROR]', e));

// ============================================================
// 13. READY (USANDO clientReady PARA EVITAR DEPRECATION)
// ============================================================
client.once('clientReady', async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
  await inicializarDB();
  await carregarVideoCache();
  if (db.rankingVersion < RANKING_VERSION) {
    for (const [steamId, jogos] of Object.entries(RANKING_VALUES)) {
      const member = MEMBROS[steamId];
      if (member && db.ranking[steamId]) db.ranking[steamId].jogos = jogos;
      else if (member) db.ranking[steamId] = { nome: member.nome, jogos, steamId, discordId: member.discordId };
    }
    db.rankingVersion = RANKING_VERSION;
    await salvarDBNoCanal();
    await enviarRanking();
  }
  try {
    const commands = [
      { name: 'tem', description: 'Verifica se um jogo está na biblioteca da família', options: [{ name: 'jogo', description: 'Nome do jogo ou link da Steam', type: 3, required: true }] },
      { name: 'ranking', description: 'Mostra o ranking da biblioteca da família' },
      { name: 'quero', description: 'Adiciona um jogo à sua lista de desejos', options: [{ name: 'jogo', description: 'Nome do jogo ou link da Steam', type: 3, required: true }] },
      { name: 'quero-listar', description: 'Lista os jogos da sua lista /quero' },
      { name: 'quero-remover', description: 'Remove um jogo da sua lista /quero', options: [{ name: 'jogo', description: 'Nome do jogo para remover', type: 3, required: true }] },
      { name: 'wishlist-link', description: 'Registra o link da sua wishlist para receber notificações', options: [{ name: 'link', description: 'Link da sua wishlist', type: 3, required: true }] },
      { name: 'dbstatus', description: '[DONO] Status do banco de dados' },
      { name: 'conquista', description: 'Mostra todas as conquistas de um jogo com vídeos guia', options: [{ name: 'jogo', description: 'Nome do jogo para buscar conquistas', type: 3, required: true }] }
    ];
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Comandos registrados.');
  } catch (err) { console.error('❌ Erro ao registrar comandos:', err); }

  await verificarEEnviarRegras();

  setInterval(checkAchievements, 30000);
  setInterval(checkNewGames, 300000);
  setInterval(verificarLancamentosQuero, 5 * 60 * 1000);
  setInterval(verificarPromocoesQuero, 5 * 60 * 1000);

  if (DONO_ID) {
    try { const dono = await client.users.fetch(DONO_ID); await dono.send('🚀 Bot Steam Família online!'); } catch (_) {}
  }
});

// ============================================================
// 14. COMANDOS SLASH
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // --- /dbstatus ---
  if (interaction.commandName === 'dbstatus') {
    if (interaction.user.id !== DONO_ID) { await interaction.reply({ content: '❌ Apenas o dono.', flags: MessageFlags.Ephemeral }); return; }
    const status = {
      database: {
        tamanho: JSON.stringify(db).length,
        ranking: Object.keys(db.ranking || {}).length,
        conquistas: Object.keys(db.conquistas || {}).length,
        historico: Object.keys(db.historicoJogos || {}).length,
        version: db.rankingVersion,
        jogosAnunciados: db.jogosAnunciados?.length || 0
      },
      cache: { videos: Object.keys(videoCache).length, traducoes: translationCache.size },
      membros: Object.keys(MEMBROS).length,
      steamIds: STEAM_IDS_ARRAY.length
    };
    const embed = new EmbedBuilder().setColor(0x00AE86).setTitle('📊 Status do Banco de Dados')
      .addFields(
        { name: '📦 Tamanho', value: `${(status.database.tamanho/1024).toFixed(2)} KB`, inline: true },
        { name: '🏆 Ranking', value: `${status.database.ranking} membros`, inline: true },
        { name: '🎯 Conquistas', value: `${status.database.conquistas} registros`, inline: true },
        { name: '🎮 Histórico', value: `${status.database.historico} membros`, inline: true },
        { name: '📚 Versão', value: `${status.database.version}`, inline: true },
        { name: '📢 Anúncios únicos', value: `${status.database.jogosAnunciados}`, inline: true },
        { name: '🎬 Vídeos cache', value: `${status.cache.videos}`, inline: true },
        { name: '🌐 Traduções', value: `${status.cache.traducoes}`, inline: true },
        { name: '👥 Membros', value: `${status.membros}`, inline: true },
        { name: '🔄 Steam IDs', value: `${status.steamIds}`, inline: true }
      ).setTimestamp();
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // --- /wishlist-link ---
  if (interaction.commandName === 'wishlist-link') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const link = interaction.options.getString('link').trim();
    if (!link.includes('steampowered.com/wishlist/')) { await interaction.editReply('❌ Link inválido.'); return; }
    const saved = await saveWishlistLink(interaction.user.id, link);
    await interaction.editReply(saved ? '✅ Link salvo!' : '❌ Erro ao salvar.');
    return;
  }

  // --- /quero ---
  if (interaction.commandName === 'quero') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const jogoInput = interaction.options.getString('jogo').trim();
    let jogoInfo = await searchGameOnSteam(jogoInput);
    if (!jogoInfo) {
      const match = jogoInput.match(/^\d+$/);
      if (match) { const d = await getGameDetails(parseInt(match[0])); if (d) jogoInfo = { appid: parseInt(match[0]), nome: d.name, link: `https://store.steampowered.com/app/${match[0]}`, capa: d.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${match[0]}/header.jpg` }; }
    }
    if (!jogoInfo) { await interaction.editReply(`❌ Não encontrei o jogo **${jogoInput}**.`); return; }
    const { appid, nome, link } = jogoInfo;
    const lista = await loadQueroList(interaction.user.id);
    if (lista.some(j => j.appid === appid)) { await interaction.editReply(`❌ **${nome}** já está na sua lista.`); return; }
    let naFamilia = false, dono = null;
    for (const sid of STEAM_IDS_ARRAY) if ((db.historicoJogos[sid] || []).includes(appid)) { naFamilia = true; dono = MEMBROS[sid]?.nome || sid; break; }
    if (naFamilia) { await interaction.editReply(`⚠️ **${nome}** já está na família (dono: ${dono}).`); return; }
    const compat = await verificarCompatibilidadeFamilia(appid);
    if (!compat.compatível) { await interaction.editReply(`⚠️ **${nome}** não é compatível.\nMotivo: ${compat.motivo}`); return; }
    const preco = await getPriceOverview(appid);
    const emPromocao = preco?.emPromocao && preco.desconto > 0;
    const comingSoon = (await getGameDetails(appid))?.release_date?.coming_soon || false;
    const result = await adicionarQuero(interaction.user.id, appid, nome, link);
    if (result.sucesso) {
      if (emPromocao && preco) {
        const embed = new EmbedBuilder().setColor(0x00FF00).setTitle(`🎉 ${nome} está em promoção!`).setURL(link)
          .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`)
          .addFields(
            { name: '💰 Preço antigo', value: `~~${preco.precoAntigo}~~`, inline: true },
            { name: '💰 Preço atual', value: `**${preco.precoAtual}**`, inline: true },
            { name: '📉 Desconto', value: `**${preco.desconto}% OFF**`, inline: true },
            { name: '🔗 Link', value: `[Comprar na Steam](${link})`, inline: false }
          ).setFooter({ text: 'Steam Família - Promoção /quero' }).setTimestamp();
        try { const u = await client.users.fetch(interaction.user.id); await u.send({ embeds: [embed] }); } catch (_) {}
      }
      let msg = `✅ **${nome}** adicionado à lista /quero!${comingSoon ? ' 📅 (Lançamento futuro)' : ''}`;
      if (emPromocao && preco) msg += `\n\n🎉 EM PROMOÇÃO! DM enviada.`;
      await interaction.editReply({ content: msg, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.editReply(`❌ Erro ao adicionar **${nome}**.`);
    }
    return;
  }

  // --- /quero-listar ---
  if (interaction.commandName === 'quero-listar') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const lista = await loadQueroList(interaction.user.id);
    if (!lista.length) { await interaction.editReply('📭 Sua lista está vazia.'); return; }
    const max = 25;
    let txt = `📋 **Sua lista /quero** (${lista.length} jogos)\n\n`;
    for (let i = 0; i < Math.min(lista.length, max); i++) {
      const j = lista[i];
      txt += `${i+1}. **${j.nome}** ${j.coming_soon ? '📅 (Em breve)' : '✅ Disponível'}\n`;
    }
    if (lista.length > max) txt += `\n... e mais ${lista.length - max} jogos.`;
    if (txt.length > 1900) {
      const attach = new AttachmentBuilder(Buffer.from(txt, 'utf-8'), { name: 'lista_quero.txt' });
      await interaction.editReply({ content: `📋 Sua lista tem ${lista.length} jogos.`, files: [attach], flags: MessageFlags.Ephemeral });
    } else {
      await interaction.editReply({ content: txt, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // --- /quero-remover ---
  if (interaction.commandName === 'quero-remover') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const jogoInput = interaction.options.getString('jogo').trim();
    let info = await searchGameOnSteam(jogoInput);
    if (!info) { const m = jogoInput.match(/^\d+$/); if (m) { const d = await getGameDetails(parseInt(m[0])); if (d) info = { appid: parseInt(m[0]), nome: d.name }; } }
    if (!info) { await interaction.editReply(`❌ Não encontrei o jogo **${jogoInput}**.`); return; }
    const removido = await removerQuero(interaction.user.id, info.appid);
    await interaction.editReply(removido ? `✅ **${info.nome}** removido!` : `❌ **${info.nome}** não está na sua lista.`);
    return;
  }

  // --- /tem ---
  if (interaction.commandName === 'tem') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const jogoInput = interaction.options.getString('jogo').trim();
    let info = await searchGameOnSteam(jogoInput);
    if (!info) {
      const m = jogoInput.match(/^\d+$/);
      if (m) { const d = await getGameDetails(parseInt(m[0])); if (d) info = { appid: parseInt(m[0]), nome: d.name, link: `https://store.steampowered.com/app/${m[0]}` }; }
    }
    if (!info) { await interaction.editReply(`❌ Não encontrei **${jogoInput}**.`); return; }

    const compat = await verificarCompatibilidadeFamilia(info.appid);
    if (!compat.compatível) {
      await interaction.editReply(`⚠️ **${info.nome}** NÃO é compatível com Family Sharing.\nMotivo: ${compat.motivo}\n🔗 ${info.link}`);
      return;
    }

    let donos = [];
    for (const sid of STEAM_IDS_ARRAY) {
      if ((db.historicoJogos[sid] || []).includes(info.appid)) {
        const m = MEMBROS[sid];
        if (m) donos.push(m.nome);
      }
    }
    if (donos.length) {
      await interaction.editReply(`✅ **${info.nome}** está na família!\n👥 Dono(s): ${donos.join(', ')}\n🔗 ${info.link}`);
    } else {
      await interaction.editReply(`❌ **${info.nome}** NÃO está na família.\n🔗 ${info.link}`);
    }
    return;
  }

  // --- /conquista (SEM VERIFICAÇÃO DE COMPATIBILIDADE) ---
  if (interaction.commandName === 'conquista') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const nomeJogo = interaction.options.getString('jogo').trim();
    const jogoInfo = await searchGameOnSteam(nomeJogo);
    if (!jogoInfo) { await interaction.editReply(`❌ Não encontrei **${nomeJogo}**.`); return; }
    const appid = jogoInfo.appid;
    let userSteamId = null;
    for (const [sid, m] of Object.entries(MEMBROS)) if (m.discordId === interaction.user.id) { userSteamId = sid; break; }
    if (!userSteamId) { await interaction.editReply('❌ Você não é membro da família.'); return; }
    
    // Verificar se o jogo está na família (apenas para exibição, não bloqueia)
    let donos = [];
    for (const [sid, jogos] of Object.entries(db.historicoJogos || {})) if (jogos.includes(appid)) { const m = MEMBROS[sid]; if (m) donos.push(m); }
    if (!donos.length) {
      for (const sid of STEAM_IDS_ARRAY) {
        const owned = await getOwnedGames(sid);
        if (owned.some(g => g.appid === appid)) { const m = MEMBROS[sid]; if (m) donos.push(m); }
      }
    }
    if (!donos.length) { await interaction.editReply(`❌ Nenhum membro possui **${jogoInfo.nome}**.`); return; }

    // 🔥 REMOVIDA A VERIFICAÇÃO DE COMPATIBILIDADE
    // const compat = await verificarCompatibilidadeFamilia(appid);
    // if (!compat.compatível) { ... return; }

    let schema;
    try { schema = await fetchSteam('https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/', { key: STEAM_KEY, appid, l: 'portuguese' }, 2); } catch (_) { await interaction.editReply('❌ Erro ao buscar conquistas.'); return; }
    if (!schema?.game?.availableGameStats?.achievements) { await interaction.editReply(`❌ O jogo **${jogoInfo.nome}** não possui conquistas.`); return; }
    let userAch = [];
    try { userAch = await getPlayerAchievements(userSteamId, appid); if (userAch) userAch = userAch.filter(c => c.achieved === 1).map(c => c.apiname); } catch (_) { userAch = []; }
    const conquistasSchema = schema.game.availableGameStats.achievements;
    const conquistasList = conquistasSchema.map(a => ({
      name: a.name, displayName: a.displayName || a.name, description: a.description || 'Sem descrição', icon: a.icon || null, icongray: a.icongray || null,
      desbloqueada: userAch.includes(a.name), status: userAch.includes(a.name) ? '✅ Desbloqueada' : '🔒 Não desbloqueada'
    })).sort((a, b) => (a.desbloqueada === b.desbloqueada) ? a.displayName.localeCompare(b.displayName) : a.desbloqueada ? 1 : -1);

    const total = conquistasList.length, desbloq = conquistasList.filter(c => c.desbloqueada).length, faltam = total - desbloq;
    const usuarioTemJogo = donos.some(d => d.steamId === userSteamId);
    const nomesDonos = donos.map(d => d.nome).join(', ');
    const mensagemAcesso = usuarioTemJogo ? `🎮 Você possui **${jogoInfo.nome}**` : `🎮 **${jogoInfo.nome}** está disponível via Family Sharing (dono: ${nomesDonos})`;

    const ITEMS_PER_PAGE = 10;
    let currentPage = 0;
    globalVideoLinksMap = new Map();

    async function generateAchievementEmbed(ach, index) {
      let imageUrl = ach.icon ? (ach.icon.startsWith('http') ? ach.icon : `https://cdn.steamstatic.com/steamcommunity/public/images/apps/${appid}/${ach.icon}`) : null;
      if (!imageUrl || imageUrl.includes('null')) imageUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
      let desc = ach.description;
      if (desc && desc.length > 3 && !/[áàâãéêíóôõúç]/i.test(desc)) { const t = await traduzirTexto(desc); if (t && !t.includes('INVALID')) desc = t; }
      const embed = new EmbedBuilder().setColor(ach.desbloqueada ? 0x00FF00 : 0xFF4444).setTitle(`🏆 ${ach.displayName}`).setDescription(desc)
        .addFields({ name: '🎮 Jogo', value: jogoInfo.nome, inline: true }, { name: '📊 Status', value: ach.status, inline: true }, { name: '📈 Progresso', value: `${index+1}/${total}`, inline: true })
        .setThumbnail(imageUrl).setFooter({ text: `🎯 ${desbloq}/${total} desbloqueadas • Faltam ${faltam}` }).setTimestamp();
      const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('back_to_list_conq').setLabel('🔙 Voltar à lista').setStyle(ButtonStyle.Secondary));
      if (YOUTUBE_API_KEY) {
        const vidId = `video_${ach.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        globalVideoLinksMap.set(vidId, { jogo: jogoInfo.nome, conquista: ach.displayName, appid, achName: ach.name });
        buttons.addComponents(new ButtonBuilder().setCustomId(vidId).setLabel('🎬 Buscar vídeo guia').setStyle(ButtonStyle.Primary));
      }
      return { embed, buttons };
    }

    function generateSelectMenu(page) {
      const start = page * ITEMS_PER_PAGE, end = Math.min(start + ITEMS_PER_PAGE, total);
      const opts = conquistasList.slice(start, end).map((ach, idx) => ({
        label: `${ach.desbloqueada ? '✅' : '🔒'} ${ach.displayName}`.substring(0, 100),
        description: ach.description ? ach.description.substring(0, 100) : 'Sem descrição',
        value: String(start + idx)
      }));
      return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('conquista_select').setPlaceholder(`Escolha uma conquista (${page+1}/${Math.ceil(total/ITEMS_PER_PAGE)})`).addOptions(opts));
    }
    function generatePaginationButtons(page) {
      const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev_page_conq').setLabel('◀️ Anterior').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('next_page_conq').setLabel('Próxima ▶️').setStyle(ButtonStyle.Primary).setDisabled(page === totalPages - 1)
      );
    }

    const descResumo = `${mensagemAcesso}\n\n${desbloq === 0 && userAch.length === 0 ?
      `**📊 Todas as Conquistas do Jogo**\n\n🔒 **Não desbloqueadas:** ${total}/${total}\n📊 **Progresso:** 0%\n\n📌 **Legenda:** 🔒 Conquista não desbloqueada\n\nSelecione uma conquista no menu abaixo para ver os detalhes.\n\n💡 **Dica:** Clique em "🎬 Buscar vídeo guia" para encontrar um vídeo da conquista.` :
      `**📊 Suas Conquistas**\n\n✅ **Desbloqueadas:** ${desbloq}/${total}\n🔒 **Faltantes:** ${faltam}/${total}\n📊 **Progresso:** ${Math.round((desbloq/total)*100)}%\n\n📌 **Legenda:** ✅ Desbloqueada | 🔒 Não desbloqueada\n\nSelecione uma conquista no menu abaixo para ver os detalhes.\n\n💡 **Dica:** Clique em "🎬 Buscar vídeo guia" para encontrar um vídeo da conquista.`}`;

    const embedResumo = new EmbedBuilder().setColor(0x00AE86).setTitle(`🎮 ${jogoInfo.nome}`)
      .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`)
      .setDescription(descResumo)
      .setFooter({ text: `Total: ${total} conquistas • Página 1/${Math.ceil(total/ITEMS_PER_PAGE)}` }).setTimestamp();

    const reply = await interaction.editReply({ embeds: [embedResumo], components: [generateSelectMenu(0), generatePaginationButtons(0)] });

    const filter = i => i.user.id === interaction.user.id;
    const collector = reply.createMessageComponentCollector({ filter, time: 180000 });

    collector.on('collect', async (i) => {
      if (!i.isRepliable()) return;
      if (i.customId.startsWith('video_')) {
        try {
          await i.deferUpdate();
          const data = globalVideoLinksMap.get(i.customId);
          if (!data) return;
          const video = await buscarVideoYouTube(data.jogo, data.conquista);
          if (video) {
            await i.followUp({ content: `🎬 **Vídeo guia para "${data.conquista}":**\n${video.link}`, flags: MessageFlags.Ephemeral });
          } else {
            await i.followUp({ content: `❌ Nenhum vídeo encontrado para "${data.conquista}".`, flags: MessageFlags.Ephemeral });
          }
        } catch (error) {
          console.error('❌ Erro no botão de vídeo:', error);
        }
        return;
      }
      if (i.customId === 'conquista_select') {
        try {
          await i.deferUpdate();
          const idx = parseInt(i.values[0]);
          const ach = conquistasList[idx];
          if (!ach) return;
          const { embed, buttons } = await generateAchievementEmbed(ach, idx);
          await i.editReply({ embeds: [embed], components: [buttons] });
        } catch (error) {
          console.error('❌ Erro no select:', error);
        }
        return;
      }
      if (i.customId === 'back_to_list_conq') {
        try {
          await i.deferUpdate();
          const desc = `${mensagemAcesso}\n\n${desbloq === 0 && userAch.length === 0 ?
            `**📊 Todas as Conquistas do Jogo**\n\n🔒 **Não desbloqueadas:** ${total}/${total}\n📊 **Progresso:** 0%\n\n📌 **Legenda:** 🔒 Conquista não desbloqueada\n\nSelecione uma conquista no menu abaixo para ver os detalhes.\n\n💡 **Dica:** Clique em "🎬 Buscar vídeo guia" para encontrar um vídeo da conquista.` :
            `**📊 Suas Conquistas**\n\n✅ **Desbloqueadas:** ${desbloq}/${total}\n🔒 **Faltantes:** ${faltam}/${total}\n📊 **Progresso:** ${Math.round((desbloq/total)*100)}%\n\n📌 **Legenda:** ✅ Desbloqueada | 🔒 Não desbloqueada\n\nSelecione uma conquista no menu abaixo para ver os detalhes.\n\n💡 **Dica:** Clique em "🎬 Buscar vídeo guia" para encontrar um vídeo da conquista.`}`;
          const embed = new EmbedBuilder().setColor(0x00AE86).setTitle(`🎮 ${jogoInfo.nome}`)
            .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`)
            .setDescription(desc)
            .setFooter({ text: `Total: ${total} conquistas • Página ${currentPage+1}/${Math.ceil(total/ITEMS_PER_PAGE)}` }).setTimestamp();
          await i.editReply({ embeds: [embed], components: [generateSelectMenu(currentPage), generatePaginationButtons(currentPage)] });
        } catch (error) {
          console.error('❌ Erro ao voltar:', error);
        }
        return;
      }
      if (i.customId === 'prev_page_conq' || i.customId === 'next_page_conq') {
        try {
          await i.deferUpdate();
          const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
          if (i.customId === 'prev_page_conq' && currentPage > 0) currentPage--;
          if (i.customId === 'next_page_conq' && currentPage < totalPages - 1) currentPage++;
          const desc = `${mensagemAcesso}\n\n${desbloq === 0 && userAch.length === 0 ?
            `**📊 Todas as Conquistas do Jogo**\n\n🔒 **Não desbloqueadas:** ${total}/${total}\n📊 **Progresso:** 0%\n\n📌 **Legenda:** 🔒 Conquista não desbloqueada\n\nSelecione uma conquista no menu abaixo para ver os detalhes.\n\n💡 **Dica:** Clique em "🎬 Buscar vídeo guia" para encontrar um vídeo da conquista.` :
            `**📊 Suas Conquistas**\n\n✅ **Desbloqueadas:** ${desbloq}/${total}\n🔒 **Faltantes:** ${faltam}/${total}\n📊 **Progresso:** ${Math.round((desbloq/total)*100)}%\n\n📌 **Legenda:** ✅ Desbloqueada | 🔒 Não desbloqueada\n\nSelecione uma conquista no menu abaixo para ver os detalhes.\n\n💡 **Dica:** Clique em "🎬 Buscar vídeo guia" para encontrar um vídeo da conquista.`}`;
          const embed = new EmbedBuilder().setColor(0x00AE86).setTitle(`🎮 ${jogoInfo.nome}`)
            .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`)
            .setDescription(desc)
            .setFooter({ text: `Total: ${total} conquistas • Página ${currentPage+1}/${Math.ceil(total/ITEMS_PER_PAGE)}` }).setTimestamp();
          await i.editReply({ embeds: [embed], components: [generateSelectMenu(currentPage), generatePaginationButtons(currentPage)] });
        } catch (error) {
          console.error('❌ Erro na paginação:', error);
        }
        return;
      }
    });
    collector.on('end', async () => { try { await reply.edit({ components: [] }); } catch (_) {} });
  }
});

// ============================================================
// 15. COMANDOS DE TEXTO (DONO) E RESPOSTAS AUTOMÁTICAS EM DM
// ============================================================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // --- RESPOSTAS AUTOMÁTICAS EM DM ---
  if (!message.guild) {
    console.log(`📩 DM recebida de ${message.author.tag}: "${message.content}"`);

    try {
      const content = message.content.toLowerCase().trim();

      const patterns = [
        /^(a gente tem|tem o jogo|possui o|temos o|vc tem|você tem|alguém tem|tem o|tem) (.+)/i,
        /^(a gente tem|tem o jogo|possui o|temos o|vc tem|você tem|alguém tem|tem o) (.+)\?/i,
        /^(.+)\?$/i
      ];

      let jogoNome = null;
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          jogoNome = match[2] || match[1];
          break;
        }
      }

      if (!jogoNome) {
        console.log(`ℹ️ Nenhum nome de jogo identificado em "${message.content}"`);
        return;
      }

      jogoNome = jogoNome.trim();
      console.log(`🔍 Buscando jogo: "${jogoNome}"`);

      let jogoInfo = await searchGameOnSteam(jogoNome);
      if (!jogoInfo) {
        const appidMatch = jogoNome.match(/^\d+$/);
        if (appidMatch) {
          const details = await getGameDetails(parseInt(appidMatch[0]));
          if (details) {
            jogoInfo = {
              appid: parseInt(appidMatch[0]),
              nome: details.name,
              link: `https://store.steampowered.com/app/${appidMatch[0]}`,
              capa: details.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appidMatch[0]}/header.jpg`
            };
          }
        }
      }

      if (!jogoInfo) {
        await message.reply(`❌ Não encontrei o jogo **${jogoNome}** na Steam. Tente com o nome exato ou link da loja.`);
        return;
      }

      const appid = jogoInfo.appid;
      const nome = jogoInfo.nome;
      const link = jogoInfo.link;

      const compat = await verificarCompatibilidadeFamilia(appid);
      if (!compat.compatível) {
        await message.reply(`⚠️ **${nome}** não é compatível com Family Sharing.\nMotivo: ${compat.motivo}`);
        return;
      }

      let donos = [];
      for (const sid of STEAM_IDS_ARRAY) {
        if ((db.historicoJogos[sid] || []).includes(appid)) {
          const member = MEMBROS[sid];
          if (member) donos.push(member.nome);
        }
      }

      if (donos.length > 0) {
        await message.reply(`✅ **${nome}** está na biblioteca da família!\n👥 Dono(s): ${donos.join(', ')}\n🔗 ${link}`);
      } else {
        await message.reply(`❌ **${nome}** NÃO está na biblioteca da família.`);
      }
    } catch (error) {
      console.error(`❌ Erro ao processar DM:`, error);
      await message.reply('❌ Ocorreu um erro ao processar sua mensagem. Tente novamente mais tarde.');
    }
    return;
  }

  // --- COMANDOS DE TEXTO DO DONO ---
  if (message.author.id !== DONO_ID) return;

  if (message.content === '!resetconquistas') {
    const qtd = Object.keys(db.jogosSemConquistas || {}).length;
    db.jogosSemConquistas = {};
    await salvarDBNoCanal();
    await message.reply(`✅ Resetado! ${qtd} jogos serão reverificados.`);
  }

  if (message.content === '!resetranking') {
    await message.reply('⚠️ Tem certeza? Digite `!confirmar` em 30s.');
    const collector = message.channel.createMessageCollector({ filter: m => m.author.id === DONO_ID && m.content === '!confirmar', max: 1, time: 30000 });
    collector.on('collect', async () => {
      for (const sid of STEAM_IDS_ARRAY) if (db.ranking[sid]) db.ranking[sid].jogos = 0;
      db.rankingVersion = RANKING_VERSION;
      await salvarDBNoCanal();
      await enviarRanking();
      await message.reply('✅ Ranking resetado.');
    });
    collector.on('end', collected => { if (!collected.size) message.reply('⏰ Cancelado.'); });
  }
});

// ============================================================
// 16. HEALTH CHECK E LOGIN
// ============================================================
if (process.env.PORT) {
  try {
    const express = require('express');
    const app = express();
    app.get('/health', (req, res) => res.status(200).json({ status: 'online', uptime: process.uptime(), timestamp: new Date().toISOString() }));
    app.listen(process.env.PORT, () => console.log(`🌐 Health check na porta ${process.env.PORT}`));
  } catch (_) {}
}

console.log('🔑 Tentando login...');
client.login(DISCORD_TOKEN).catch(err => { console.error('❌ Erro ao login:', err.message); process.exit(1); });
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
