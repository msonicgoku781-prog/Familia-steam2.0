// ============================================================
// BOT STEAM FAMÍLIA - VERSÃO COMPLETA E OTIMIZADA
// ============================================================

console.log('========================================');
console.log('🚀 BOT STEAM FAMÍLIA - INICIANDO');
console.log(`📅 ${new Date().toLocaleString()}`);
console.log(`🆔 Node.js: ${process.version}`);
console.log(`📁 Diretório: ${__dirname}`);
console.log('========================================');

const DEBUG = false;

console.log('🚀 [1] Iniciando o script...');

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

console.log('🚀 [2] Dependências carregadas.');

// ============================================================
// 1. VARIÁVEIS DE AMBIENTE
// ============================================================
const {
  DISCORD_TOKEN,
  STEAM_KEY,
  STEAM_IDS,
  CHANNEL_ID,
  RANKING_CHANNEL_ID,
  ACHIEVEMENT_CHANNEL_ID,
  QUERO_CHANNEL_ID,
  RULES_CHANNEL_ID,
  DONO_ID,
  YOUTUBE_API_KEY
} = process.env;

console.log('🚀 [3] Variáveis lidas.');
console.log(`📌 DISCORD_TOKEN presente: ${DISCORD_TOKEN ? 'SIM' : 'NÃO'}`);
console.log(`📌 QUERO_CHANNEL_ID: ${QUERO_CHANNEL_ID || 'NÃO DEFINIDO'}`);
console.log(`📌 YOUTUBE_API_KEY presente: ${YOUTUBE_API_KEY ? 'SIM' : 'NÃO'}`);
console.log(`📌 ACHIEVEMENT_CHANNEL_ID: ${ACHIEVEMENT_CHANNEL_ID || 'NÃO DEFINIDO'}`);

if (!DISCORD_TOKEN || !STEAM_KEY || !STEAM_IDS || !CHANNEL_ID || !QUERO_CHANNEL_ID || !RULES_CHANNEL_ID) {
  console.error('❌ Variáveis obrigatórias ausentes. Verifique .env');
  process.exit(1);
}

if (!YOUTUBE_API_KEY) {
  console.warn('⚠️ YOUTUBE_API_KEY não definida. A busca de vídeos não funcionará.');
}

if (!ACHIEVEMENT_CHANNEL_ID) {
  console.warn('⚠️ ACHIEVEMENT_CHANNEL_ID não definida. As conquistas não serão notificadas.');
}

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

console.log('🚀 [4] Membros carregados.');

// ============================================================
// 3. CONSTANTES
// ============================================================
const RANKING_VERSION = 7;
const RANKING_VALUES = {
  '76561198127320557': 127,
  '76561197967265286': 127,
  '76561198848231901': 15,
  '76561198446717315': 17,
  '76561198110004039': 12,
  '76561198406551864': 0
};
const ACHIEVEMENT_EMOJI = '<:Trofeu:1525724119142891571>';
const MIN_INTERVALO = 3000;
const MAX_VIDEO_CACHE = 200;

console.log('🚀 [5] Constantes definidas.');

// ============================================================
// 3.1 WISHLIST LINKS (FALLBACK)
// ============================================================
const WISHLIST_LINKS_FALLBACK = {
  '76561198127320557': 'https://store.steampowered.com/wishlist/id/gardemi14/?st=9781845176545064172',
  '76561197967265286': 'https://store.steampowered.com/wishlist/id/marlon5/?st=12031400973950461745',
  '76561198446717315': 'https://store.steampowered.com/wishlist/id/WoollySkills/?st=13976153632286308648',
  '76561198110004039': 'https://store.steampowered.com/wishlist/id/venum781/?sort=discount&st=15535079369621866391',
  '76561198848231901': 'https://store.steampowered.com/wishlist/profiles/76561198848231901/?sort=dateadded&st=12664633540339000937',
  '76561198406551864': 'https://store.steampowered.com/wishlist/profiles/76561198406551864/?st=9055044468942286935'
};

console.log('🚀 [5.1] Wishlist links fallback carregados.');

// ============================================================
// 4. BANCO DE DADOS (ANEXO NO CANAL PRIVADO)
// ============================================================
let db = null;
let dbMessageId = null;
let videoCache = {};
let videoCacheMessageId = null;
const VIDEO_CACHE_FILENAME = 'video_cache.json';

// ============================================================
// CACHE DA WISHLIST (SALVO NO CANAL)
// ============================================================
let wishlistCache = {};
let wishlistCacheMessageId = null;
const WISHLIST_CACHE_FILENAME = 'wishlist_cache.json';
const WISHLIST_CACHE_DAYS = 15;
const WISHLIST_CACHE_MS = WISHLIST_CACHE_DAYS * 24 * 60 * 60 * 1000;

// ============================================================
// CACHE DE SCHEMAS DE CONQUISTAS (PERSISTENTE)
// ============================================================
let achievementSchemaCache = {};
let achievementSchemaCacheMessageId = null;
const ACHIEVEMENT_SCHEMA_FILENAME = 'achievement_schema_cache.json';

// ============================================================
// MAPA PARA BOTÕES DE VÍDEO (FALLBACK)
// ============================================================
const videoLinksMap = new Map();

// ============================================================
// SESSÕES PARA PAGINAÇÃO DO /conquista
// ============================================================
const conquestSessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of conquestSessions) {
    if (now - data.timestamp > 300000) conquestSessions.delete(key);
  }
}, 60000);

function criarDBInicial() {
  const ranking = {};
  for (const [steamId, jogos] of Object.entries(RANKING_VALUES)) {
    const member = MEMBROS[steamId];
    if (member) {
      ranking[steamId] = {
        nome: member.nome,
        jogos: jogos,
        steamId: steamId,
        discordId: member.discordId
      };
    }
  }
  return {
    ranking,
    conquistas: {},
    historicoJogos: {},
    ultimaMensagemRankingId: null,
    lancamentosNotificados: {},
    jogosSemConquistas: {},
    rankingVersion: RANKING_VERSION,
    ultimaVerificacao: {}
  };
}

// === DB ===
async function carregarDBDoCanal() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return null;
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const dbMsg = messages.find(m => m.content === 'DB_FILE' && m.attachments.size > 0);
    if (dbMsg) {
      dbMessageId = dbMsg.id;
      const attachment = dbMsg.attachments.first();
      if (attachment && attachment.url) {
        const response = await axios.get(attachment.url, { responseType: 'json' });
        return response.data;
      }
    }
  } catch (e) { /* Silencia */ }
  return null;
}

async function salvarDBNoCanal() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return false;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const dbMessages = messages.filter(m => m.content === 'DB_FILE' && m.attachments.size > 0);
    for (const [, msg] of dbMessages) {
      if (msg.id !== dbMessageId) {
        try { await msg.delete(); } catch (e) {}
      }
    }
    const jsonData = JSON.stringify(db, null, 2);
    const buffer = Buffer.from(jsonData, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: 'db.json' });
    if (dbMessageId) {
      try {
        const antiga = await channel.messages.fetch(dbMessageId);
        if (antiga) {
          await antiga.edit({ content: 'DB_FILE', files: [attachment] });
          return true;
        }
      } catch (_) { dbMessageId = null; }
    }
    const novaMsg = await channel.send({ content: 'DB_FILE', files: [attachment] });
    dbMessageId = novaMsg.id;
    return true;
  } catch (e) { console.error('❌ Erro ao salvar DB:', e); return false; }
}

async function inicializarDB() {
  const dados = await carregarDBDoCanal();
  if (dados) {
    db = dados;
    if (!db.ranking) db.ranking = {};
    if (!db.conquistas) db.conquistas = {};
    if (!db.historicoJogos) db.historicoJogos = {};
    if (!db.ultimaMensagemRankingId) db.ultimaMensagemRankingId = null;
    if (!db.lancamentosNotificados) db.lancamentosNotificados = {};
    if (!db.jogosSemConquistas) db.jogosSemConquistas = {};
    if (!db.rankingVersion) db.rankingVersion = 0;
    if (!db.ultimaVerificacao) db.ultimaVerificacao = {};
    if (db.rankingVersion < RANKING_VERSION) {
      for (const [steamId, jogos] of Object.entries(RANKING_VALUES)) {
        const member = MEMBROS[steamId];
        if (member && db.ranking[steamId]) {
          db.ranking[steamId].jogos = jogos;
        } else if (member && !db.ranking[steamId]) {
          db.ranking[steamId] = {
            nome: member.nome,
            jogos: jogos,
            steamId: steamId,
            discordId: member.discordId
          };
        }
      }
      db.rankingVersion = RANKING_VERSION;
      await salvarDBNoCanal();
    }
    console.log(`💾 DB carregado (versão ${db.rankingVersion})`);
  } else {
    db = criarDBInicial();
    await salvarDBNoCanal();
    console.log('📊 DB inicial criado.');
  }
}

// === Video Cache ===
async function carregarVideoCache() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return;
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const cacheMsg = messages.find(m => m.content === 'VIDEO_CACHE' && m.attachments.size > 0);
    if (cacheMsg) {
      videoCacheMessageId = cacheMsg.id;
      const attachment = cacheMsg.attachments.first();
      if (attachment && attachment.url) {
        const response = await axios.get(attachment.url, { responseType: 'json' });
        videoCache = response.data;
        if (Object.keys(videoCache).length > MAX_VIDEO_CACHE) {
          const keys = Object.keys(videoCache);
          const toRemove = keys.slice(0, keys.length - MAX_VIDEO_CACHE);
          for (const key of toRemove) delete videoCache[key];
        }
        console.log(`✅ Video cache carregado: ${Object.keys(videoCache).length}`);
        return;
      }
    }
    videoCache = {};
    console.log('📊 Video cache vazio');
  } catch (e) { console.error('❌ Erro ao carregar video cache:', e); videoCache = {}; }
}

async function salvarVideoCache() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return false;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const cacheMessages = messages.filter(m => m.content === 'VIDEO_CACHE' && m.attachments.size > 0);
    for (const [, msg] of cacheMessages) {
      if (msg.id !== videoCacheMessageId) {
        try { await msg.delete(); } catch (e) {}
      }
    }
    if (Object.keys(videoCache).length > MAX_VIDEO_CACHE) {
      const keys = Object.keys(videoCache);
      const toRemove = keys.slice(0, keys.length - MAX_VIDEO_CACHE);
      for (const key of toRemove) delete videoCache[key];
    }
    const jsonData = JSON.stringify(videoCache, null, 2);
    const buffer = Buffer.from(jsonData, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: VIDEO_CACHE_FILENAME });
    if (videoCacheMessageId) {
      try {
        const antiga = await channel.messages.fetch(videoCacheMessageId);
        if (antiga) {
          await antiga.edit({ content: 'VIDEO_CACHE', files: [attachment] });
          return true;
        }
      } catch (_) { videoCacheMessageId = null; }
    }
    const novaMsg = await channel.send({ content: 'VIDEO_CACHE', files: [attachment] });
    videoCacheMessageId = novaMsg.id;
    return true;
  } catch (e) { console.error('❌ Erro ao salvar video cache:', e); return false; }
}

async function getVideoFromCache(jogo, conquista) {
  const key = `${jogo}|${conquista}`.toLowerCase();
  return videoCache[key] || null;
}

async function saveVideoToCache(jogo, conquista, videoInfo) {
  const key = `${jogo}|${conquista}`.toLowerCase();
  videoCache[key] = videoInfo;
  if (Object.keys(videoCache).length > MAX_VIDEO_CACHE) {
    const keys = Object.keys(videoCache);
    const toRemove = keys.slice(0, keys.length - MAX_VIDEO_CACHE);
    for (const k of toRemove) delete videoCache[k];
  }
  salvarVideoCache().catch(e => console.error('❌ Erro ao salvar video cache:', e));
}

// === Wishlist Cache ===
async function carregarWishlistCache() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return;
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const cacheMsg = messages.find(m => m.content === 'WISHLIST_CACHE' && m.attachments.size > 0);
    if (cacheMsg) {
      wishlistCacheMessageId = cacheMsg.id;
      const attachment = cacheMsg.attachments.first();
      if (attachment && attachment.url) {
        const response = await axios.get(attachment.url, { responseType: 'json' });
        wishlistCache = response.data;
        console.log(`✅ Wishlist cache carregado: ${Object.keys(wishlistCache).length} membros`);
        return;
      }
    }
    wishlistCache = {};
    console.log('📊 Wishlist cache vazio');
  } catch (e) { console.error('❌ Erro ao carregar wishlist cache:', e); wishlistCache = {}; }
}

async function salvarWishlistCache() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return false;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const cacheMessages = messages.filter(m => m.content === 'WISHLIST_CACHE' && m.attachments.size > 0);
    for (const [, msg] of cacheMessages) {
      if (msg.id !== wishlistCacheMessageId) {
        try { await msg.delete(); } catch (e) {}
      }
    }
    const cacheCompactado = {};
    for (const [steamId, data] of Object.entries(wishlistCache)) {
      if (data && data.wishlist && data.lastUpdate) {
        cacheCompactado[steamId] = { wishlist: data.wishlist, lastUpdate: data.lastUpdate };
      }
    }
    const jsonData = JSON.stringify(cacheCompactado, null, 2);
    const buffer = Buffer.from(jsonData, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: WISHLIST_CACHE_FILENAME });
    if (wishlistCacheMessageId) {
      try {
        const antiga = await channel.messages.fetch(wishlistCacheMessageId);
        if (antiga) {
          await antiga.edit({ content: 'WISHLIST_CACHE', files: [attachment] });
          return true;
        }
      } catch (_) { wishlistCacheMessageId = null; }
    }
    const novaMsg = await channel.send({ content: 'WISHLIST_CACHE', files: [attachment] });
    wishlistCacheMessageId = novaMsg.id;
    return true;
  } catch (e) { console.error('❌ Erro ao salvar wishlist cache:', e); return false; }
}

// === Achievement Schema Cache (persistente) ===
async function carregarAchievementSchemaCache() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return;
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const cacheMsg = messages.find(m => m.content === 'ACHIEVEMENT_SCHEMA_CACHE' && m.attachments.size > 0);
    if (cacheMsg) {
      achievementSchemaCacheMessageId = cacheMsg.id;
      const attachment = cacheMsg.attachments.first();
      if (attachment && attachment.url) {
        const response = await axios.get(attachment.url, { responseType: 'json' });
        achievementSchemaCache = response.data;
        console.log(`✅ Achievement schema cache carregado: ${Object.keys(achievementSchemaCache).length} jogos`);
        return;
      }
    }
    achievementSchemaCache = {};
    console.log('📊 Achievement schema cache vazio');
  } catch (e) {
    console.error('❌ Erro ao carregar achievement schema cache:', e);
    achievementSchemaCache = {};
  }
}

async function salvarAchievementSchemaCache() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return false;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const cacheMessages = messages.filter(m => m.content === 'ACHIEVEMENT_SCHEMA_CACHE' && m.attachments.size > 0);
    for (const [, msg] of cacheMessages) {
      if (msg.id !== achievementSchemaCacheMessageId) {
        try { await msg.delete(); } catch (e) {}
      }
    }
    const jsonData = JSON.stringify(achievementSchemaCache, null, 2);
    const buffer = Buffer.from(jsonData, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: ACHIEVEMENT_SCHEMA_FILENAME });
    if (achievementSchemaCacheMessageId) {
      try {
        const antiga = await channel.messages.fetch(achievementSchemaCacheMessageId);
        if (antiga) {
          await antiga.edit({ content: 'ACHIEVEMENT_SCHEMA_CACHE', files: [attachment] });
          return true;
        }
      } catch (_) { achievementSchemaCacheMessageId = null; }
    }
    const novaMsg = await channel.send({ content: 'ACHIEVEMENT_SCHEMA_CACHE', files: [attachment] });
    achievementSchemaCacheMessageId = novaMsg.id;
    return true;
  } catch (e) {
    console.error('❌ Erro ao salvar achievement schema cache:', e);
    return false;
  }
}

// ============================================================
// FUNÇÕES DE CACHE DE CONQUISTAS (USANDO SCHEMA PERSISTENTE)
// ============================================================
const translationCache = new Map();

// Limpeza periódica de caches de tradução
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of translationCache) {
    const parts = key.split('_');
    const timestamp = parseInt(parts[parts.length - 1]);
    if (!isNaN(timestamp) && now - timestamp > 3600000) translationCache.delete(key);
  }
}, 3600000);

async function getAchievementSchema(appId) {
  if (achievementSchemaCache[appId]) {
    return achievementSchemaCache[appId];
  }

  try {
    const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/`;
    const params = { key: STEAM_KEY, appid: appId, l: 'portuguese' };
    const data = await fetchSteam(url, params, 2);
    if (data?.game?.availableGameStats?.achievements) {
      const schema = {};
      for (const ach of data.game.availableGameStats.achievements) {
        schema[ach.name] = {
          displayName: ach.displayName || ach.name,
          description: ach.description || null,
          icon: ach.icon || null
        };
      }
      achievementSchemaCache[appId] = schema;
      await salvarAchievementSchemaCache();
      return schema;
    }
  } catch (e) {
    console.error(`❌ Erro ao buscar schema para ${appId}:`, e.message);
  }
  return null;
}

async function getAchievementDisplayName(appId, apiname) {
  const schema = await getAchievementSchema(appId);
  if (schema && schema[apiname]) return schema[apiname].displayName;
  return apiname;
}

async function getAchievementDescription(appId, apiname) {
  const schema = await getAchievementSchema(appId);
  if (schema && schema[apiname]) return schema[apiname].description;
  return null;
}

async function getAchievementIcon(appId, apiname) {
  const schema = await getAchievementSchema(appId);
  if (schema && schema[apiname]) return schema[apiname].icon;
  return null;
}

console.log('🚀 [6] Funções de banco de dados e cache definidas.');

// ============================================================
// 5. FUNÇÕES DE LISTA /quero
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
  try {
    const jsonPart = msg.content.substring(msg.content.indexOf(':') + 1).trim();
    return JSON.parse(jsonPart) || [];
  } catch (_) { return []; }
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
  let comingSoon = null;
  try {
    const detalhes = await getGameDetails(appid);
    if (detalhes && detalhes.release_date) comingSoon = detalhes.release_date.coming_soon === true;
  } catch (_) {}
  let emPromocao = false;
  try {
    const preco = await getPriceOverview(appid);
    if (preco) emPromocao = preco.emPromocao && preco.desconto > 0;
  } catch (_) {}
  lista.push({ appid, nome, link, adicionado_em: new Date().toISOString(), coming_soon: comingSoon, ultimoEstadoPromocao: emPromocao });
  await saveQueroList(discordId, lista);
  return { sucesso: true };
}

async function removerQuero(discordId, appid) {
  const lista = await loadQueroList(discordId);
  const novaLista = lista.filter(j => j.appid !== appid);
  if (novaLista.length < lista.length) {
    await saveQueroList(discordId, novaLista);
    return true;
  }
  return false;
}

async function listarQuero(discordId) {
  return await loadQueroList(discordId);
}

// ============================================================
// 5.1 FUNÇÕES DE WISHLIST LINK
// ============================================================
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
  try {
    const link = msg.content.substring(msg.content.indexOf(':') + 1).trim();
    return link || null;
  } catch (_) { return null; }
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

console.log('🚀 [7] Funções /quero e wishlist carregadas.');

// ============================================================
// 6. FUNÇÕES DA STEAM API (logs reduzidos)
// ============================================================
let ultimaRequisicao = 0;

async function fetchSteam(url, params = {}, retries = 3) {
  const agora = Date.now();
  const espera = Math.max(0, MIN_INTERVALO - (agora - ultimaRequisicao));
  if (espera > 0) await new Promise(r => setTimeout(r, espera));
  ultimaRequisicao = Date.now();

  for (let i = 0; i < retries; i++) {
    try {
      const resp = await axios.get(url, {
        params: { ...params, key: STEAM_KEY },
        timeout: 10000,
        headers: { 'User-Agent': 'SteamFamilyBot/2.0' }
      });
      if (resp.status === 429) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      return resp.data;
    } catch (e) {
      if (e.response && e.response.status === 429) {
        await new Promise(r => setTimeout(r, 5000 * (i + 1)));
        continue;
      }
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

async function getOwnedGames(steamId) {
  const data = await fetchSteam(
    'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/',
    { steamid: steamId, include_appinfo: true, include_shared_games: true, format: 'json' }
  );
  return data?.response?.games || [];
}

async function getRecentlyPlayedGames(steamId, limit = 3) {
  const data = await fetchSteam(
    'https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/',
    { steamid: steamId, count: limit, format: 'json' }
  );
  return data?.response?.games || [];
}

async function getPlayerAchievements(steamId, appId) {
  const data = await fetchSteam(
    'https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/',
    { steamid: steamId, appid: appId, format: 'json' }
  );
  return data?.playerstats?.achievements || [];
}

async function getGameDetails(appId) {
  try {
    const resp = await axios.get(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&l=portuguese`,
      { timeout: 10000 }
    );
    if (resp.data && resp.data[appId]?.success) return resp.data[appId].data;
  } catch (_) {}
  return null;
}

async function searchGameOnSteam(query) {
  const data = await fetchSteam(
    'https://store.steampowered.com/api/storesearch',
    { term: query, l: 'portuguese', cc: 'BR' },
    1
  );
  if (data?.items?.length) {
    const item = data.items[0];
    return {
      appid: item.id,
      nome: item.name,
      link: `https://store.steampowered.com/app/${item.id}`,
      capa: item.tiny_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/header.jpg`
    };
  }
  return null;
}

async function getPriceOverview(appId) {
  try {
    const resp = await axios.get(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=br`,
      { timeout: 10000 }
    );
    if (resp.data && resp.data[appId]?.success) {
      const game = resp.data[appId].data;
      const price = game.price_overview;
      if (price) {
        return {
          nome: game.name,
          appid: appId,
          link: `https://store.steampowered.com/app/${appId}`,
          precoAtual: price.final_formatted,
          precoAntigo: price.initial_formatted,
          emPromocao: price.final < price.initial,
          desconto: price.discount_percent || 0
        };
      }
    }
  } catch (_) {}
  return null;
}

// ============================================================
// 6.1 WISHLIST
// ============================================================
async function getSteamWishlist(steamId) {
  try {
    const url = `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/`;
    const response = await axios.get(url, {
      params: { l: 'portuguese', v: '1' },
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!response.data || typeof response.data !== 'object' || Object.keys(response.data).length === 0) return [];
    const wishlist = [];
    for (const [appid, data] of Object.entries(response.data)) {
      if (data && data.name) {
        wishlist.push({ appid: parseInt(appid), nome: data.name, link: `https://store.steampowered.com/app/${appid}` });
      }
    }
    return wishlist;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`❌ Wishlist não encontrada (404) para ${steamId}`);
    } else if (error.response && error.response.status === 403) {
      console.log(`🔒 Wishlist privada (403) para ${steamId}`);
    } else {
      console.log(`⚠️ Erro ao acessar wishlist: ${error.message}`);
    }
    return [];
  }
}

async function resolveVanityUrl(vanityName) {
  try {
    const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/`;
    const params = { key: STEAM_KEY, vanityurl: vanityName };
    const response = await axios.get(url, { params, timeout: 10000 });
    if (response.data?.response?.success === 1) return response.data.response.steamid;
    console.log(`❌ Vanity "${vanityName}" não encontrado`);
    return null;
  } catch (error) {
    console.error(`❌ Erro ao resolver vanity URL: ${error.message}`);
    return null;
  }
}

async function getSteamWishlistFromLink(wishlistLink) {
  try {
    const profileMatch = wishlistLink.match(/wishlist\/profiles\/(\d+)/);
    if (profileMatch) return await getSteamWishlist(profileMatch[1]);
    const idMatch = wishlistLink.match(/wishlist\/id\/([^\/\?]+)/);
    if (idMatch) {
      const steamId = await resolveVanityUrl(idMatch[1]);
      if (!steamId) return [];
      return await getSteamWishlist(steamId);
    }
    console.log(`❌ Não foi possível extrair informações do link: ${wishlistLink}`);
    return [];
  } catch (error) {
    console.error(`❌ Erro ao buscar wishlist a partir do link: ${error.message}`);
    return [];
  }
}

// === Função para tradução (mantida) ===
async function traduzirTexto(texto, targetLang = 'pt') {
  if (!texto || texto.length < 3) return texto;
  const cacheKey = `${texto}_${targetLang}_${Date.now()}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
  try {
    const url = 'https://api.mymemory.translated.net/get';
    const response = await axios.get(url, {
      params: { q: texto, langpair: `en|${targetLang}`, de: 'steam-family-bot' },
      timeout: 5000
    });
    if (response.data?.responseData?.translatedText) {
      const traduzido = response.data.responseData.translatedText;
      if (!traduzido.includes('INVALID') && !traduzido.includes('ERROR')) {
        translationCache.set(cacheKey, traduzido);
        return traduzido;
      }
    }
  } catch (e) { console.error('❌ Erro ao traduzir texto:', e.message); }
  translationCache.set(cacheKey, texto);
  return texto;
}

console.log('🚀 [8] Funções da Steam API carregadas.');

// ============================================================
// 6.4 CONQUISTAS COM PORCENTAGEM (SILENCIA 400/403)
// ============================================================
async function getPlayerAchievementsWithPercent(steamId, appId) {
  try {
    const playerData = await fetchSteam(
      'https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/',
      { steamid: steamId, appid: appId, format: 'json' }
    );
    if (!playerData?.playerstats?.achievements) return null;
    
    let globalPercentMap = {};
    try {
      const globalData = await fetchSteam(
        'https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/',
        { gameid: appId, format: 'json' }
      );
      if (globalData?.achievementpercentages?.achievements) {
        for (const ach of globalData.achievementpercentages.achievements) {
          globalPercentMap[ach.name] = parseFloat(ach.percent);
        }
      }
    } catch (e) {}
    
    const achievements = playerData.playerstats.achievements.map(ach => ({
      ...ach,
      percent: globalPercentMap[ach.apiname] || 0,
      percentFormatado: globalPercentMap[ach.apiname] ? `${globalPercentMap[ach.apiname].toFixed(1)}%` : 'N/A'
    }));
    return { achievements, gameName: playerData.playerstats.gameName || `Jogo ${appId}` };
  } catch (error) {
    if (error.response && (error.response.status === 400 || error.response.status === 403)) {
      return null;
    }
    console.error(`❌ Erro ao buscar conquistas com porcentagem:`, error.message);
    return null;
  }
}

// ============================================================
// 7. COMPATIBILIDADE
// ============================================================
const JOGOS_INCOMPATIVEIS = {
  33930: "Arma 2: Operation Arrowhead",
  107410: "Arma 3",
  582660: "Black Desert",
  1097150: "Fall Guys",
  220240: "Far Cry 3",
  298110: "Far Cry 4",
  552520: "Far Cry 5",
  304390: "FOR HONOR",
  1546970: "Grand Theft Auto III – The Definitive Edition",
  12210: "Grand Theft Auto IV: The Complete Edition",
  3240220: "Grand Theft Auto V Enhanced",
  271590: "Grand Theft Auto V Legacy",
  1547000: "Grand Theft Auto: San Andreas – The Definitive Edition",
  1546990: "Grand Theft Auto: Vice City – The Definitive Edition",
  439700: "H1Z1: King of the Kill Test Server",
  269210: "Hero Siege",
  1426210: "It Takes Two",
  510190: "Lazarus",
  1392860: "Little Nightmares III",
  1328670: "Mass Effect Legendary Edition",
  204100: "Max Payne 3",
  555160: "Pavlov VR",
  2129530: "REANIMAL",
  1174180: "Red Dead Redemption 2",
  2215260: "Scott Pilgrim vs. The World: The Game – Complete Edition",
  488790: "South Park: The Fractured But Whole",
  2001120: "Split Fiction",
  1172380: "STAR WARS Jedi: Fallen Order",
  1774580: "STAR WARS Jedi: Survivor",
  1527280: "Starship Tunnel",
  470220: "UNO",
  447040: "Watch Dogs 2",
  1222700: "A Way Out"
};

async function verificarCompatibilidadeFamilia(appId) {
  if (JOGOS_INCOMPATIVEIS[appId]) {
    return { compatível: false, motivo: `Este jogo (${JOGOS_INCOMPATIVEIS[appId]}) NÃO é compatível com Family Sharing (lista conhecida)` };
  }
  try {
    const detalhes = await getGameDetails(appId);
    if (detalhes) {
      const pubs = detalhes.publishers || [];
      const devs = detalhes.developers || [];
      const all = [...pubs, ...devs].map(s => s.toLowerCase());
      if (all.some(s => s.includes('ea ') || s.includes('electronic arts') || s === 'ea' || s === 'electronic arts')) {
        return { compatível: false, motivo: 'Jogos da EA NÃO são compatíveis com Family Sharing' };
      }
      if (all.some(s => s.includes('rockstar'))) {
        return { compatível: false, motivo: 'Jogos da Rockstar Games NÃO são compatíveis com Family Sharing' };
      }
      if (all.some(s => s.includes('ubisoft'))) {
        return { compatível: false, motivo: 'Jogos da Ubisoft NÃO são compatíveis com Family Sharing' };
      }
      if (detalhes.is_free) return { compatível: false, motivo: 'Jogo gratuito não requer Family Sharing' };
      if (detalhes.exclude_from_family_sharing === true) return { compatível: false, motivo: 'Este jogo NÃO é compatível com Family Sharing' };
      if (!detalhes.price_overview) return { compatível: false, motivo: 'Jogo sem preço definido' };
      return { compatível: true, motivo: null };
    }
  } catch (e) {
    console.error(`❌ Erro ao verificar compatibilidade do jogo ${appId}:`, e.message);
  }
  return { compatível: true, motivo: null };
}

function extrairAppIdDaUrl(url) {
  const match = url.match(/store\.steampowered\.com\/app\/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

console.log('🚀 [9] Funções de compatibilidade carregadas.');

// ============================================================
// 8. RANKING
// ============================================================
function gerarRankingEmbed() {
  const rankingArray = Object.values(db.ranking || {}).sort((a, b) => b.jogos - a.jogos);
  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle('🏆 Ranking da Biblioteca Steam 2026')
    .setThumbnail('https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/1200px-Steam_icon_logo.svg.png')
    .setTimestamp();
  let desc = '';
  rankingArray.forEach((user, i) => {
    const pos = i + 1;
    const mencao = user.discordId ? `<@${user.discordId}>` : user.nome;
    desc += `${pos}º **${mencao}** — ${user.jogos} jogos\n`;
  });
  embed.setDescription(desc);
  const totalJogos = rankingArray.reduce((acc, user) => acc + user.jogos, 0);
  embed.setFooter({ text: `Total de jogos: ${totalJogos} • Atualizado ${new Date().toLocaleTimeString()}` });
  return embed;
}

async function enviarRanking() {
  try {
    const channel = client.channels.cache.get(RANKING_CHANNEL_ID);
    if (!channel) return;
    if (db.ultimaMensagemRankingId) {
      try {
        const antiga = await channel.messages.fetch(db.ultimaMensagemRankingId);
        if (antiga) await antiga.delete();
      } catch (_) {}
    }
    const embed = gerarRankingEmbed();
    const nova = await channel.send({ embeds: [embed] });
    db.ultimaMensagemRankingId = nova.id;
    await salvarDBNoCanal();
  } catch (err) {
    console.error('❌ Erro ao enviar ranking:', err);
  }
}

console.log('🚀 [10] Funções de ranking carregadas.');

// ============================================================
// 9. FUNÇÃO DE REGRAS
// ============================================================
async function enviarRegras() {
  const channel = client.channels.cache.get(RULES_CHANNEL);
  if (!channel) { console.error('❌ Canal de regras não encontrado!'); return; }
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
      '`/wishlist-refresh` – Força a atualização da sua wishlist (cache de 15 dias).\n' +
      '`/dbstatus` – Status do banco de dados (apenas dono).\n' +
      '`/regras` – Exibe esta mensagem novamente.\n' +
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
  try {
    await channel.send({ embeds: [embed] });
    console.log('📜 Mensagem de regras enviada no canal:', RULES_CHANNEL);
  } catch (err) { console.error('❌ Erro ao enviar regras:', err); }
}

// ============================================================
// 10. VERIFICAÇÃO DE CONQUISTAS
// ============================================================
async function verificarConquistas(steamId, gamesToCheck, mention, userName) {
  if (!gamesToCheck?.length) return;
  if (!ACHIEVEMENT_CHANNEL_ID) {
    console.log(`⚠️ ACHIEVEMENT_CHANNEL_ID não definido. Pulando notificação.`);
    return;
  }
  if (DEBUG) console.log(`🔍 [${userName}] Verificando ${gamesToCheck.length} jogo(s)...`);

  let channel = client.channels.cache.get(ACHIEVEMENT_CHANNEL_ID);
  if (!channel) {
    try {
      channel = await client.channels.fetch(ACHIEVEMENT_CHANNEL_ID);
      if (channel) client.channels.cache.set(channel.id, channel);
    } catch (error) {
      console.error(`❌ Falha ao buscar canal de conquistas:`, error.message);
      return;
    }
  }

  if (!db.conquistas[steamId]) db.conquistas[steamId] = {};

  for (const game of gamesToCheck) {
    const appid = game.appid;
    const gameName = game.name || `Jogo ${appid}`;
    if (DEBUG) console.log(`   🎯 ${gameName} (${appid})`);

    // Usar o schema persistente (já carregado via getAchievementSchema)
    const schema = await getAchievementSchema(appid);
    const iconMap = {};
    if (schema) {
      for (const [apiname, data] of Object.entries(schema)) {
        if (data.icon) iconMap[apiname] = data.icon;
      }
    }

    let conquistasData;
    try {
      conquistasData = await getPlayerAchievementsWithPercent(steamId, appid);
    } catch (e) {
      if (e.response && (e.response.status === 400 || e.response.status === 403)) {
        // silencioso
      } else {
        console.log(`   ⚠️ Erro ao buscar conquistas: ${e.message}`);
      }
      continue;
    }

    if (!conquistasData?.achievements || conquistasData.achievements.length === 0) {
      if (!db.jogosSemConquistas) db.jogosSemConquistas = {};
      db.jogosSemConquistas[appid] = { nome: gameName, data: new Date().toISOString(), motivo: 'sem_conquistas' };
      await salvarDBNoCanal();
      continue;
    }

    const conquistas = conquistasData.achievements;
    const desbloqueadas = conquistas.filter(c => c.achieved === 1);
    const total = desbloqueadas.length;
    const totalJogo = conquistas.length;
    if (DEBUG) console.log(`   📊 ${total}/${totalJogo} conquistas desbloqueadas`);

    if (!db.conquistas[steamId][appid]) {
      db.conquistas[steamId][appid] = { total, nomes: desbloqueadas.map(c => c.apiname), totalJogo };
      await salvarDBNoCanal();
      if (DEBUG) console.log(`   📊 Primeira verificação de ${gameName}`);
      continue;
    }

    const anterior = db.conquistas[steamId][appid];
    const totalAntigo = anterior.total || 0;
    const antigos = anterior.nomes || [];
    const novas = desbloqueadas.filter(c => !antigos.includes(c.apiname));
    if (novas.length === 0) {
      if (DEBUG) console.log(`   ℹ️ Nenhuma nova conquista`);
      continue;
    }

    console.log(`   🎉 ${userName} desbloqueou ${novas.length} nova(s) conquista(s) em ${gameName}`);

    let contador = 0;
    for (const ach of novas) {
      contador++;
      const progressoAtual = totalAntigo + contador;
      const faltam = totalJogo - progressoAtual;
      const nomeBonito = await getAchievementDisplayName(appid, ach.apiname);

      let iconUrl = null;
      const iconName = iconMap[ach.apiname];
      if (iconName) {
        iconUrl = iconName.startsWith('http') ? iconName : `https://cdn.steamstatic.com/steamcommunity/public/images/apps/${appid}/${iconName}`;
      }

      let gameImageUrl = null;
      try {
        const detalhes = await getGameDetails(appid);
        if (detalhes?.header_image) gameImageUrl = detalhes.header_image;
      } catch (e) {}
      if (!gameImageUrl) gameImageUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

      let imageToUse = iconUrl || gameImageUrl;
      if (!imageToUse || imageToUse.includes('null') || imageToUse.includes('undefined')) imageToUse = gameImageUrl;
      if (imageToUse && imageToUse.includes('http://') && imageToUse.includes('http://', imageToUse.indexOf('http://') + 7)) {
        const parts = imageToUse.split('http://');
        imageToUse = 'http://' + parts[parts.length - 1];
      }

      const percent = ach.percent || 0;
      const percentText = percent > 0 ? `${percent.toFixed(1)}% dos jogadores` : 'Dados indisponíveis';

      let rarezaEmoji = '', rarezaText = '';
      if (percent > 0 && percent <= 5) { rarezaEmoji = '💎'; rarezaText = ' (RARÍSSIMA!)'; }
      else if (percent > 5 && percent <= 15) { rarezaEmoji = '🌟'; rarezaText = ' (Rara)'; }

      const embed = new EmbedBuilder()
        .setColor(percent > 0 && percent <= 5 ? 0xFFD700 : 0x00AE86)
        .setTitle(`${ACHIEVEMENT_EMOJI} ${userName} desbloqueou uma conquista!`)
        .setDescription(`**${nomeBonito}** ${rarezaEmoji}`)
        .addFields(
          { name: '🎮 Jogo', value: gameName, inline: true },
          { name: '👤 Jogador', value: mention, inline: true },
          { name: '📊 Progresso', value: `${progressoAtual}/${totalJogo} ${faltam > 0 ? `(faltam ${faltam})` : '🎉 COMPLETO!'}`, inline: true },
          { name: '📈 Raridade', value: `${percentText}${rarezaText}`, inline: true }
        )
        .setThumbnail(imageToUse)
        .setFooter({ text: `🏆 ${userName} • ${gameName} • ${new Date().toLocaleTimeString()}`, iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      try {
        await channel.send({ embeds: [embed] });
        console.log(`   ✅ Mensagem enviada com imagem`);
      } catch (error) {
        console.error(`   ❌ Erro ao enviar mensagem:`, error.message);
      }
    }

    db.conquistas[steamId][appid] = { total, nomes: desbloqueadas.map(c => c.apiname), totalJogo };
    await salvarDBNoCanal();
  }
}

// ============================================================
// 11. VERIFICAÇÃO DE JOGOS DA LISTA /quero COMPRADOS
// ============================================================
async function verificarJogosQueroComprados(steamId, newGames, comprador) {
  try {
    if (!newGames || newGames.length === 0) return;
    for (const [sid, member] of Object.entries(MEMBROS)) {
      if (sid === steamId) continue;
      const discordId = member.discordId;
      const listaQuero = await loadQueroList(discordId);
      if (!listaQuero || listaQuero.length === 0) continue;
      for (const game of newGames) {
        const appid = game.appid;
        const nome = game.name || `App ${appid}`;
        const jogoNaLista = listaQuero.find(j => j.appid === appid);
        if (jogoNaLista) {
          console.log(`🎯 ${comprador} comprou "${nome}" que está na lista /quero de ${member.nome}`);
          let precoInfo = null, gameDetails = null;
          try {
            precoInfo = await getPriceOverview(appid);
            gameDetails = await getGameDetails(appid);
          } catch (_) {}
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`🎮 ${comprador} comprou um jogo da sua lista /quero!`)
            .setDescription(`**${nome}** foi adicionado à biblioteca da família!`)
            .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`)
            .addFields(
              { name: '🛒 Comprado por', value: comprador, inline: true },
              { name: '📌 Na sua lista desde', value: new Date(jogoNaLista.adicionado_em).toLocaleDateString('pt-BR'), inline: true }
            );
          if (precoInfo) embed.addFields({ name: '💰 Preço', value: precoInfo.precoAtual || 'N/A', inline: true });
          if (gameDetails?.release_date?.date) embed.addFields({ name: '📅 Lançamento', value: gameDetails.release_date.date, inline: true });
          embed.addFields({ name: '🔗 Link', value: `[Ver na Steam](https://store.steampowered.com/app/${appid})`, inline: false })
            .setFooter({ text: 'Steam Família - Alerta /quero' })
            .setTimestamp();
          try {
            const usuario = await client.users.fetch(discordId);
            await usuario.send({ embeds: [embed] });
            console.log(`📨 DM enviada para ${member.nome} sobre "${nome}"`);
          } catch (err) {
            console.error(`❌ Erro ao enviar DM para ${member.nome}:`, err.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ Erro em verificarJogosQueroComprados:', err);
  }
}

// ============================================================
// 12. VERIFICAÇÃO DE JOGOS DA WISHLIST (COM CACHE)
// ============================================================
async function verificarJogosWishlistComprados(steamId, newGames, comprador) {
  try {
    if (!newGames || newGames.length === 0) return;
    for (const [sid, member] of Object.entries(MEMBROS)) {
      if (sid === steamId) continue;
      const discordId = member.discordId;
      let wishlistLink = await loadWishlistLink(discordId);
      if (!wishlistLink && WISHLIST_LINKS_FALLBACK[sid]) {
        wishlistLink = WISHLIST_LINKS_FALLBACK[sid];
        if (DEBUG) console.log(`ℹ️ Usando link fallback para ${member.nome}`);
      }
      if (!wishlistLink) {
        if (DEBUG) console.log(`ℹ️ ${member.nome} não tem link de wishlist`);
        continue;
      }

      const now = Date.now();
      let wishlistData = wishlistCache[sid];
      if (!wishlistData || (now - wishlistData.lastUpdate) > WISHLIST_CACHE_MS) {
        if (DEBUG) console.log(`🔄 Atualizando wishlist de ${member.nome} (cache expirado)`);
        const wishlist = await getSteamWishlistFromLink(wishlistLink);
        wishlistCache[sid] = { wishlist: wishlist || [], lastUpdate: now };
        await salvarWishlistCache();
        console.log(`✅ Wishlist de ${member.nome} atualizada (${wishlistCache[sid].wishlist.length} jogos)`);
      } else {
        if (DEBUG) console.log(`📋 Usando wishlist em cache de ${member.nome} (${wishlistCache[sid].wishlist.length} jogos)`);
      }

      const wishlist = wishlistCache[sid].wishlist;
      if (!wishlist || wishlist.length === 0) continue;

      for (const game of newGames) {
        const appid = game.appid;
        const nome = game.name || `App ${appid}`;
        const jogoNaWishlist = wishlist.find(j => j.appid === appid);
        if (jogoNaWishlist) {
          console.log(`🎯 ${comprador} comprou "${nome}" que está na wishlist de ${member.nome}`);
          let precoInfo = null, gameDetails = null;
          try {
            precoInfo = await getPriceOverview(appid);
            gameDetails = await getGameDetails(appid);
          } catch (_) {}
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`🎮 ${comprador} comprou um jogo da sua wishlist!`)
            .setDescription(`**${nome}** foi adicionado à biblioteca da família!`)
            .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`)
            .addFields(
              { name: '🛒 Comprado por', value: comprador, inline: true },
              { name: '📌 Na sua wishlist', value: '✅ Sim', inline: true }
            );
          if (precoInfo) embed.addFields({ name: '💰 Preço', value: precoInfo.precoAtual || 'N/A', inline: true });
          if (gameDetails?.release_date?.date) embed.addFields({ name: '📅 Lançamento', value: gameDetails.release_date.date, inline: true });
          embed.addFields({ name: '🔗 Link', value: `[Ver na Steam](https://store.steampowered.com/app/${appid})`, inline: false })
            .setFooter({ text: 'Steam Família - Alerta de Wishlist' })
            .setTimestamp();
          try {
            const usuario = await client.users.fetch(discordId);
            await usuario.send({ embeds: [embed] });
            console.log(`📨 DM enviada para ${member.nome} sobre "${nome}"`);
          } catch (err) {
            console.error(`❌ Erro ao enviar DM para ${member.nome}:`, err.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ Erro em verificarJogosWishlistComprados:', err);
  }
}

// ============================================================
// 13. checkAchievements
// ============================================================
async function checkAchievements() {
  console.log(`🔍 [checkAchievements] Verificando conquistas da família...`);
  try {
    for (const steamId of STEAM_IDS_ARRAY) {
      try {
        const member = MEMBROS[steamId];
        if (!member) continue;
        const userName = member.nome, discordId = member.discordId, mention = `<@${discordId}>`;
        let limit = 12;
        if (userName === 'Gardemi') limit = 5;
        console.log(`📊 [${userName}] Buscando ${limit} jogos recentes...`);
        const recentGames = await getRecentlyPlayedGames(steamId, limit);
        if (!recentGames || recentGames.length === 0) {
          console.log(`ℹ️ ${userName} - Nenhum jogo recente.`);
          continue;
        }
        const uniqueGames = [];
        const seenAppIds = new Set();
        for (const game of recentGames) {
          if (!seenAppIds.has(game.appid)) {
            seenAppIds.add(game.appid);
            uniqueGames.push(game);
          }
        }
        const jogosParaVerificar = [];
        const agora = Date.now();
        const INTERVALO_VERIFICACAO = 5 * 60 * 1000;
        for (const game of uniqueGames) {
          const appid = game.appid, gameName = game.name || `App ${appid}`;
          if (db.jogosSemConquistas && db.jogosSemConquistas[appid]) {
            const dataMarcado = new Date(db.jogosSemConquistas[appid].data);
            const diffMin = (agora - dataMarcado) / (1000 * 60);
            if (diffMin >= 5) {
              console.log(`   🔄 ${gameName} - Reverificando (marcado há ${diffMin.toFixed(1)} min)`);
              delete db.jogosSemConquistas[appid];
              await salvarDBNoCanal();
            } else {
              continue;
            }
          }
          const ultimaVerificacao = db.ultimaVerificacao?.[steamId]?.[appid] || 0;
          if (agora - ultimaVerificacao > INTERVALO_VERIFICACAO) {
            jogosParaVerificar.push(game);
          }
        }
        if (jogosParaVerificar.length === 0) continue;
        await verificarConquistas(steamId, jogosParaVerificar, mention, userName);
        if (!db.ultimaVerificacao) db.ultimaVerificacao = {};
        if (!db.ultimaVerificacao[steamId]) db.ultimaVerificacao[steamId] = {};
        for (const game of jogosParaVerificar) {
          db.ultimaVerificacao[steamId][game.appid] = Date.now();
        }
        await salvarDBNoCanal();
      } catch (err) {
        console.error(`❌ Erro ao verificar conquistas de ${steamId}:`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Erro em checkAchievements:', err);
  }
}

// ============================================================
// 14. checkNewGames
// ============================================================
async function checkNewGames() {
  try {
    const channelNotificacoes = client.channels.cache.get(CHANNEL_ID);
    if (!channelNotificacoes) return;
    for (const steamId of STEAM_IDS_ARRAY) {
      try {
        const allGames = await getOwnedGames(steamId);
        if (!allGames.length) continue;
        const member = MEMBROS[steamId];
        if (!member) continue;
        const userName = member.nome, discordId = member.discordId;
        if (!db.historicoJogos[steamId]) {
          db.historicoJogos[steamId] = allGames.map(g => g.appid);
          await salvarDBNoCanal();
          continue;
        }
        const oldIds = db.historicoJogos[steamId] || [];
        const newGames = allGames.filter(g => !oldIds.includes(g.appid));
        if (newGames.length === 0) continue;
        await verificarJogosQueroComprados(steamId, newGames, userName);
        await verificarJogosWishlistComprados(steamId, newGames, userName);
        for (const game of newGames) {
          const appid = game.appid, nome = game.name || `App ${appid}`, link = `https://store.steampowered.com/app/${appid}`;
          const compat = await verificarCompatibilidadeFamilia(appid);
          if (!compat.compatível) continue;
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`🛒 NOVO JOGO NA FAMÍLIA!`)
            .setDescription(`**${userName}** agora tem acesso a **${nome}**!\n\n✅ **Compatível com Família Steam!**`)
            .addFields({ name: '🔗 Link', value: `[Ver na Steam](${link})`, inline: false })
            .setTimestamp();
          const detalhes = await getGameDetails(appid);
          if (detalhes?.header_image) embed.setImage(detalhes.header_image);
          await channelNotificacoes.send({ content: `@everyone 🎉 **${userName}** comprou um novo jogo!`, embeds: [embed] });
          if (db.ranking[steamId]) {
            db.ranking[steamId].jogos += 1;
            await salvarDBNoCanal();
            await enviarRanking();
          }
        }
        db.historicoJogos[steamId] = allGames.map(g => g.appid);
        await salvarDBNoCanal();
      } catch (err) {
        console.error(`❌ Erro em ${steamId}:`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Erro em checkNewGames:', err);
  }
}

// ============================================================
// 15. LANÇAMENTOS E PROMOÇÕES
// ============================================================
async function verificarLancamentosQuero() {
  try {
    const channel = client.channels.cache.get(QUERO_CHANNEL);
    if (!channel) return;
    const messages = await channel.messages.fetch({ limit: 100 });
    const queroMessages = messages.filter(m => m.content.startsWith('QUERO_'));
    for (const [, msg] of queroMessages) {
      const discordId = msg.content.split(':')[0].replace('QUERO_', '');
      const lista = await loadQueroList(discordId);
      if (!lista.length) continue;
      let usuario;
      try { usuario = await client.users.fetch(discordId); } catch (_) { continue; }
      for (const jogo of lista) {
        const chave = `${discordId}_${jogo.appid}`;
        if (db.lancamentosNotificados?.[chave]) continue;
        if (jogo.coming_soon === false) continue;
        const detalhes = await getGameDetails(jogo.appid);
        if (!detalhes) continue;
        const isComingSoon = detalhes.release_date?.coming_soon;
        const hasPrice = !!detalhes.price_overview;
        const isAvailable = (isComingSoon === false) && hasPrice;
        if (jogo.coming_soon === true && isAvailable) {
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`🎮 ${jogo.nome} FOI LANÇADO!`)
            .setURL(jogo.link)
            .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${jogo.appid}/header.jpg`)
            .addFields(
              { name: '💰 Preço', value: detalhes.price_overview?.final_formatted || 'Ver na loja', inline: true },
              { name: '🔗 Link', value: `[Comprar na Steam](${jogo.link})`, inline: false }
            )
            .setFooter({ text: 'Steam Família - Lançamentos /quero' })
            .setTimestamp();
          try {
            await usuario.send({ embeds: [embed] });
            if (!db.lancamentosNotificados) db.lancamentosNotificados = {};
            db.lancamentosNotificados[chave] = Date.now();
            jogo.coming_soon = false;
            await saveQueroList(discordId, lista);
          } catch (err) {
            console.error(`❌ Erro ao enviar DM para ${usuario.username}:`, err.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ Erro em verificarLancamentosQuero:', err);
  }
}

async function verificarPromocoesQuero() {
  try {
    const channel = client.channels.cache.get(QUERO_CHANNEL);
    if (!channel) return;
    const messages = await channel.messages.fetch({ limit: 100 });
    const queroMessages = messages.filter(m => m.content.startsWith('QUERO_'));
    for (const [, msg] of queroMessages) {
      const discordId = msg.content.split(':')[0].replace('QUERO_', '');
      const lista = await loadQueroList(discordId);
      if (!lista.length) continue;
      let usuario;
      try { usuario = await client.users.fetch(discordId); } catch (_) { continue; }
      for (const jogo of lista) {
        const preco = await getPriceOverview(jogo.appid);
        if (!preco) continue;
        const estaEmPromocao = preco.emPromocao && preco.desconto > 0;
        const estadoAnterior = jogo.ultimoEstadoPromocao;
        if (estaEmPromocao && (estadoAnterior === false || estadoAnterior === null)) {
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`🎉 ${jogo.nome} está em promoção!`)
            .setURL(jogo.link)
            .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${jogo.appid}/header.jpg`)
            .addFields(
              { name: '💰 Preço antigo', value: `~~${preco.precoAntigo}~~`, inline: true },
              { name: '💰 Preço atual', value: `**${preco.precoAtual}**`, inline: true },
              { name: '📉 Desconto', value: `**${preco.desconto}% OFF**`, inline: true },
              { name: '🔗 Link', value: `[Comprar na Steam](${preco.link})`, inline: false }
            )
            .setFooter({ text: 'Steam Família - Promoções /quero' })
            .setTimestamp();
          try {
            await usuario.send({ embeds: [embed] });
          } catch (err) {
            console.error(`❌ Erro ao enviar DM para ${usuario.username}:`, err.message);
          }
          jogo.ultimoEstadoPromocao = true;
          await saveQueroList(discordId, lista);
        } else if (!estaEmPromocao && estadoAnterior === true) {
          jogo.ultimoEstadoPromocao = false;
          await saveQueroList(discordId, lista);
        } else if (estadoAnterior === null) {
          jogo.ultimoEstadoPromocao = estaEmPromocao;
          await saveQueroList(discordId, lista);
        }
      }
    }
  } catch (err) {
    console.error('❌ Erro em verificarPromocoesQuero:', err);
  }
}

console.log('🚀 [15] Tarefas periódicas carregadas.');

// ============================================================
// 16. BUSCA DE VÍDEOS (MELHORADA)
// ============================================================
async function buscarVideoYouTube(nomeJogo, nomeConquista) {
  const cached = await getVideoFromCache(nomeJogo, nomeConquista);
  if (cached) return cached;
  
  if (!YOUTUBE_API_KEY) {
    console.warn('⚠️ YOUTUBE_API_KEY não definida.');
    return null;
  }

  try {
    const jogoLimpo = nomeJogo.replace(/[^\w\s]/gi, '').trim();
    const conquistaLimpa = nomeConquista.replace(/[^\w\s]/gi, '').trim();
    const termoBusca = `${conquistaLimpa} ${jogoLimpo} guia conquista`;
    
    console.log(`🔍 Buscando vídeo: "${termoBusca}"`);

    const searchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        type: 'video',
        maxResults: 5,
        q: termoBusca,
        key: YOUTUBE_API_KEY,
        order: 'relevance',
        relevanceLanguage: 'pt'
      },
      timeout: 8000
    });

    if (!searchResponse.data.items?.length) {
      const termoAlternativo = `${conquistaLimpa} ${jogoLimpo} trophy`;
      console.log(`🔍 Tentando busca alternativa: "${termoAlternativo}"`);
      const altResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          part: 'snippet',
          type: 'video',
          maxResults: 3,
          q: termoAlternativo,
          key: YOUTUBE_API_KEY,
          order: 'relevance'
        },
        timeout: 8000
      });
      if (!altResponse.data.items?.length) return null;
      searchResponse.data = altResponse.data;
    }

    const video = searchResponse.data.items.find(item => {
      const title = item.snippet.title.toLowerCase();
      return title.includes('guia') || title.includes('conquista') || title.includes('trophy') || title.includes('walkthrough');
    }) || searchResponse.data.items[0];

    const videoInfo = {
      id: video.id.videoId,
      titulo: video.snippet.title,
      canal: video.snippet.channelTitle,
      link: `https://www.youtube.com/watch?v=${video.id.videoId}`,
      views: 0
    };

    try {
      const statsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: { part: 'statistics', id: video.id.videoId, key: YOUTUBE_API_KEY },
        timeout: 3000
      });
      if (statsResponse?.data?.items?.length > 0 && statsResponse.data.items[0].statistics) {
        videoInfo.views = parseInt(statsResponse.data.items[0].statistics.viewCount) || 0;
      }
    } catch (e) {}

    await saveVideoToCache(nomeJogo, nomeConquista, videoInfo);
    return videoInfo;
  } catch (error) {
    console.error(`❌ ERRO NA BUSCA: ${error.message}`);
    return null;
  }
}

console.log('🚀 [16] Função de busca de vídeos carregada.');

// ============================================================
// 17. CLIENT DISCORD
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

console.log('🚀 [17] Cliente Discord criado.');

client.on('debug', (info) => {
  if (DEBUG && !info.includes('heartbeat')) console.log(`🐛 [DEBUG] ${info}`);
});
client.on('warn', (info) => console.warn(`⚠️ [WARN] ${info}`));
client.on('error', (error) => console.error('❌ [ERROR]', error));
client.on('disconnect', (event) => {
  console.log(`🔌 Desconectado: ${event.reason || 'Motivo desconhecido'}`);
});
client.on('reconnecting', () => {
  console.log('🔄 Tentando reconectar...');
});

// ============================================================
// 18. CARREGAR MAPEAMENTO DE CONQUISTAS (MEGA MAN X)
// ============================================================
let conquestMappings = null;
let conquestMappingsLoaded = false;

async function carregarMapeamentoConquistas() {
  if (conquestMappingsLoaded && conquestMappings) return conquestMappings;
  const channelId = '1525926566373363823';
  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    console.error('❌ Canal #lista-quero não encontrado!');
    try {
      const fetched = await client.channels.fetch(channelId);
      if (fetched) return await carregarMapeamentoDoCanal(fetched);
    } catch (e) {
      console.error('❌ Falha ao buscar canal:', e.message);
    }
    return null;
  }
  return await carregarMapeamentoDoCanal(channel);
}

async function carregarMapeamentoDoCanal(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const msg = messages.find(m => 
      m.attachments.size > 0 && 
      m.attachments.some(a => a.name === 'megaman_x_achievements.json')
    );
    if (!msg) {
      console.warn('⚠️ Nenhuma mensagem com o arquivo megaman_x_achievements.json encontrada.');
      return null;
    }
    const attachment = msg.attachments.find(a => a.name === 'megaman_x_achievements.json');
    const response = await axios.get(attachment.url, { responseType: 'json' });
    conquestMappings = response.data;
    conquestMappingsLoaded = true;
    console.log(`✅ Mapeamento carregado: ${Object.keys(response.data).length} conquistas`);
    return response.data;
  } catch (e) {
    console.error('❌ Erro ao carregar mapeamento:', e.message);
    return null;
  }
}

// ============================================================
// 19. AUTOCOMPLETE
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isAutocomplete()) return;
  if (interaction.commandName !== 'conquista') return;

  try {
    const focusedValue = interaction.options.getFocused();
    const userId = interaction.user.id;
    let steamId = null;
    for (const [sid, member] of Object.entries(MEMBROS)) {
      if (member.discordId === userId) {
        steamId = sid;
        break;
      }
    }
    if (!steamId) {
      await interaction.respond([]);
      return;
    }
    const recentGames = await getRecentlyPlayedGames(steamId, 8);
    if (!recentGames || recentGames.length === 0) {
      await interaction.respond([]);
      return;
    }
    if (!focusedValue || focusedValue.trim() === '') {
      const suggestions = recentGames.map(game => ({ name: game.name, value: game.name }));
      await interaction.respond(suggestions.slice(0, 25));
      return;
    }
    const lowerFocused = focusedValue.toLowerCase();
    const suggestions = recentGames
      .filter(game => game.name && game.name.toLowerCase().includes(lowerFocused))
      .map(game => ({ name: game.name, value: game.name }));
    await interaction.respond(suggestions.slice(0, 25));
  } catch (error) {
    console.error('❌ Erro no autocomplete:', error);
    await interaction.respond([]).catch(() => {});
  }
});

// ============================================================
// 20. EVENTO clientReady
// ============================================================
let botIniciado = false;
const flagFile = path.join(__dirname, 'bot_started.flag');

client.once('clientReady', async () => {
  console.log('✅ clientReady DISPARADO!');
  console.log(`✅ Bot online como ${client.user.tag}`);
  console.log(`📋 Banco de dados armazenado como anexo no canal: <#${QUERO_CHANNEL}>`);
  console.log(`📢 ACHIEVEMENT_CHANNEL_ID configurado: ${ACHIEVEMENT_CHANNEL_ID || 'NÃO DEFINIDO'}`);
  console.log(`📊 Modo DEBUG: ${DEBUG ? 'ATIVADO' : 'DESATIVADO'}`);

  try {
    await inicializarDB();
    await carregarVideoCache();
    await carregarWishlistCache();
    await carregarAchievementSchemaCache(); // NOVO
    console.log(`📊 Video cache: ${Object.keys(videoCache).length}`);
    console.log(`📊 Wishlist cache: ${Object.keys(wishlistCache).length}`);
    console.log(`📊 Achievement schema cache: ${Object.keys(achievementSchemaCache).length} jogos`);

    if (db.rankingVersion < RANKING_VERSION) {
      for (const [steamId, jogos] of Object.entries(RANKING_VALUES)) {
        const member = MEMBROS[steamId];
        if (member && db.ranking[steamId]) {
          db.ranking[steamId].jogos = jogos;
        } else if (member && !db.ranking[steamId]) {
          db.ranking[steamId] = {
            nome: member.nome,
            jogos: jogos,
            steamId: steamId,
            discordId: member.discordId
          };
        }
      }
      db.rankingVersion = RANKING_VERSION;
      await salvarDBNoCanal();
      await enviarRanking();
    }

    conquestMappings = await carregarMapeamentoConquistas();

    console.log('🔄 Registrando comandos...');
    try {
      const commands = [
        { name: 'tem', description: 'Verifica se um jogo está na biblioteca da família', options: [{ name: 'jogo', description: 'Nome do jogo ou link da Steam', type: 3, required: true }] },
        { name: 'ranking', description: 'Mostra o ranking da biblioteca da família' },
        { name: 'quero', description: 'Adiciona um jogo à sua lista de desejos', options: [{ name: 'jogo', description: 'Nome do jogo ou link da Steam', type: 3, required: true }] },
        { name: 'quero-listar', description: 'Lista os jogos da sua lista /quero' },
        { name: 'quero-remover', description: 'Remove um jogo da sua lista /quero', options: [{ name: 'jogo', description: 'Nome do jogo para remover', type: 3, required: true }] },
        { name: 'wishlist-link', description: 'Registra o link da sua wishlist para receber notificações', options: [{ name: 'link', description: 'Link da sua wishlist (ex: https://store.steampowered.com/wishlist/id/seu_nome/)', type: 3, required: true }] },
        { name: 'wishlist-refresh', description: 'Força a atualização da sua wishlist (cache de 15 dias)' },
        { name: 'dbstatus', description: '[DONO] Status do banco de dados' },
        { name: 'regras', description: 'Mostra as regras e comandos do servidor' },
        {
          name: 'conquista',
          description: 'Mostra todas as conquistas de um jogo com vídeos guia',
          options: [
            {
              name: 'jogo',
              description: 'Nome do jogo para buscar conquistas',
              type: 3,
              required: true,
              autocomplete: true
            }
          ]
        }
      ];
      const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log('✅ Comandos registrados:', commands.map(c => c.name).join(', '));
    } catch (err) {
      console.error('❌ Erro ao registrar comandos:', err);
    }

    if (ACHIEVEMENT_CHANNEL_ID) {
      console.log(`🔍 [INICIO] Verificando canal de conquistas: ${ACHIEVEMENT_CHANNEL_ID}`);
      let testChannel = client.channels.cache.get(ACHIEVEMENT_CHANNEL_ID);
      if (!testChannel) {
        console.log(`⚠️ Canal ${ACHIEVEMENT_CHANNEL_ID} não encontrado no cache. Tentando fetch...`);
        try {
          testChannel = await client.channels.fetch(ACHIEVEMENT_CHANNEL_ID);
          if (testChannel) {
            console.log(`✅ Canal de conquistas encontrado via fetch: ${testChannel.name} (${testChannel.id})`);
            client.channels.cache.set(testChannel.id, testChannel);
          }
        } catch (error) {
          console.error(`❌ Canal de conquistas NÃO encontrado: ${error.message}`);
          console.log(`⚠️ As notificações de conquistas NÃO funcionarão!`);
        }
      } else {
        console.log(`✅ Canal de conquistas encontrado no cache: ${testChannel.name} (${testChannel.id})`);
      }
    } else {
      console.log(`⚠️ ACHIEVEMENT_CHANNEL_ID não definido. As notificações de conquistas NÃO funcionarão.`);
    }

    setInterval(checkAchievements, 600000);
    setInterval(checkNewGames, 600000);
    setInterval(verificarLancamentosQuero, 10 * 60 * 1000);
    setInterval(verificarPromocoesQuero, 10 * 60 * 1000);
    console.log('🔄 Monitorando conquistas, novos jogos, lançamentos e promoções a cada 10 minutos.');

    try {
      if (!fs.existsSync(flagFile)) {
        fs.writeFileSync(flagFile, Date.now().toString());
        if (DONO_ID) {
          try {
            const dono = await client.users.fetch(DONO_ID);
            await dono.send('🚀 Bot Steam Família está online! (12 jogos)')
              .catch(e => console.log(`⚠️ Não foi possível enviar DM para o dono: ${e.message}`));
            console.log('✅ Mensagem de inicialização enviada ao dono.');
          } catch (error) {
            console.log(`⚠️ Não foi possível enviar mensagem ao dono: ${error.message}`);
          }
        }
      } else {
        console.log('ℹ️ Mensagem de inicialização já foi enviada anteriormente.');
      }
    } catch (error) {
      console.log(`⚠️ Erro ao verificar flag: ${error.message}`);
    }

  } catch (err) {
    console.error('❌ ERRO FATAL NO clientReady:', err);
  }
});

// ============================================================
// 21. COMANDO /dbstatus
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'dbstatus') {
    if (interaction.user.id !== DONO_ID) {
      await interaction.reply({ content: '❌ Apenas o dono pode usar este comando.', flags: MessageFlags.Ephemeral });
      return;
    }
    const status = {
      database: {
        tamanho: JSON.stringify(db).length,
        ranking: Object.keys(db.ranking || {}).length,
        conquistas: Object.keys(db.conquistas || {}).length,
        historico: Object.keys(db.historicoJogos || {}).length,
        version: db.rankingVersion
      },
      cache: {
        videos: Object.keys(videoCache).length,
        traducoes: translationCache.size,
        wishlist: Object.keys(wishlistCache).length,
        schemas: Object.keys(achievementSchemaCache).length // NOVO
      },
      membros: Object.keys(MEMBROS).length,
      steamIds: STEAM_IDS_ARRAY.length,
      canais: {
        notificacoes: CHANNEL_ID ? '✅' : '❌',
        ranking: RANKING_CHANNEL_ID ? '✅' : '❌',
        conquistas: ACHIEVEMENT_CHANNEL_ID ? '✅' : '❌',
        quero: QUERO_CHANNEL_ID ? '✅' : '❌',
        regras: RULES_CHANNEL_ID ? '✅' : '❌'
      }
    };
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle('📊 Status do Banco de Dados')
      .addFields(
        { name: '📦 Tamanho', value: `${(status.database.tamanho / 1024).toFixed(2)} KB`, inline: true },
        { name: '🏆 Ranking', value: `${status.database.ranking} membros`, inline: true },
        { name: '🎯 Conquistas', value: `${status.database.conquistas} registros`, inline: true },
        { name: '🎮 Histórico', value: `${status.database.historico} membros`, inline: true },
        { name: '📚 Versão', value: `${status.database.version}`, inline: true },
        { name: '🎬 Vídeos cache', value: `${status.cache.videos}`, inline: true },
        { name: '🌐 Traduções', value: `${status.cache.traducoes}`, inline: true },
        { name: '📋 Wishlist cache', value: `${status.cache.wishlist}`, inline: true },
        { name: '📘 Schemas cache', value: `${status.cache.schemas}`, inline: true },
        { name: '👥 Membros', value: `${status.membros}`, inline: true },
        { name: '🔄 Steam IDs', value: `${status.steamIds}`, inline: true }
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
});

// ============================================================
// 22. COMANDO /wishlist-link
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'wishlist-link') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const link = interaction.options.getString('link').trim();
      const discordId = interaction.user.id;
      if (!link.includes('steampowered.com/wishlist/')) {
        await interaction.editReply('❌ O link não parece ser um link válido da wishlist da Steam.');
        return;
      }
      const saved = await saveWishlistLink(discordId, link);
      if (saved) {
        await interaction.editReply('✅ Link da wishlist salvo com sucesso!');
        console.log(`📌 ${interaction.user.tag} registrou wishlist: ${link}`);
      } else {
        await interaction.editReply('❌ Erro ao salvar o link. Tente novamente.');
      }
    } catch (error) {
      console.error('❌ Erro no /wishlist-link:', error);
      await interaction.editReply('❌ Ocorreu um erro ao salvar o link.');
    }
  }
});

// ============================================================
// 23. COMANDO /wishlist-refresh
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'wishlist-refresh') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const discordId = interaction.user.id;
      let steamId = null;
      for (const [sid, member] of Object.entries(MEMBROS)) {
        if (member.discordId === discordId) {
          steamId = sid;
          break;
        }
      }
      if (!steamId) {
        await interaction.editReply('❌ Você não está mapeado como membro da família.');
        return;
      }
      delete wishlistCache[steamId];
      await salvarWishlistCache();
      await interaction.editReply('🔄 Cache da sua wishlist removido. Na próxima verificação, a lista será atualizada.');
      console.log(`📌 ${interaction.user.tag} forçou atualização da wishlist.`);
    } catch (error) {
      console.error('❌ Erro no /wishlist-refresh:', error);
      await interaction.editReply('❌ Ocorreu um erro.');
    }
  }
});

// ============================================================
// 24. COMANDO /quero
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'quero') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const jogoInput = interaction.options.getString('jogo').trim();
      const discordId = interaction.user.id;
      console.log(`📌 /quero - ${interaction.user.tag}: "${jogoInput}"`);
      let jogoInfo = await searchGameOnSteam(jogoInput);
      if (!jogoInfo) {
        const appidMatch = jogoInput.match(/^\d+$/);
        if (appidMatch) {
          const detalhes = await getGameDetails(parseInt(appidMatch[0]));
          if (detalhes) {
            jogoInfo = {
              appid: parseInt(appidMatch[0]),
              nome: detalhes.name,
              link: `https://store.steampowered.com/app/${appidMatch[0]}`,
              capa: detalhes.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appidMatch[0]}/header.jpg`
            };
          }
        }
      }
      if (!jogoInfo) {
        await interaction.editReply(`❌ Não encontrei o jogo **${jogoInput}** na Steam.`);
        return;
      }
      const appid = jogoInfo.appid, nome = jogoInfo.nome, link = jogoInfo.link;
      const lista = await loadQueroList(discordId);
      if (lista.some(j => j.appid === appid)) {
        await interaction.editReply(`❌ **${nome}** já está na sua lista /quero!`);
        return;
      }
      let jogoNaFamilia = false, dono = null;
      for (const sid of STEAM_IDS_ARRAY) {
        if ((db.historicoJogos[sid] || []).includes(appid)) {
          jogoNaFamilia = true;
          dono = MEMBROS[sid]?.nome || sid;
          break;
        }
      }
      if (jogoNaFamilia) {
        await interaction.editReply(`⚠️ **${nome}** já está na biblioteca da família (dono: ${dono}).\n🔗 ${link}`);
        return;
      }
      const compat = await verificarCompatibilidadeFamilia(appid);
      if (!compat.compatível) {
        await interaction.editReply(`⚠️ **${nome}** não é compatível com Family Sharing.\nMotivo: ${compat.motivo}`);
        return;
      }
      let estaEmPromocao = false, precoInfo = null;
      try {
        precoInfo = await getPriceOverview(appid);
        if (precoInfo) estaEmPromocao = precoInfo.emPromocao && precoInfo.desconto > 0;
      } catch (_) {}
      let comingSoon = false;
      try {
        const detalhes = await getGameDetails(appid);
        if (detalhes && detalhes.release_date) comingSoon = detalhes.release_date.coming_soon === true;
      } catch (_) {}
      const resultado = await adicionarQuero(discordId, appid, nome, link);
      if (resultado.sucesso) {
        if (estaEmPromocao && precoInfo) {
          try {
            const embed = new EmbedBuilder()
              .setColor(0x00FF00)
              .setTitle(`🎉 ${nome} está em promoção!`)
              .setURL(link)
              .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`)
              .addFields(
                { name: '💰 Preço antigo', value: `~~${precoInfo.precoAntigo}~~`, inline: true },
                { name: '💰 Preço atual', value: `**${precoInfo.precoAtual}**`, inline: true },
                { name: '📉 Desconto', value: `**${precoInfo.desconto}% OFF**`, inline: true },
                { name: '🔗 Link', value: `[Comprar na Steam](${link})`, inline: false }
              )
              .setFooter({ text: 'Steam Família - Promoção /quero' })
              .setTimestamp();
            const usuario = await client.users.fetch(discordId);
            await usuario.send({ embeds: [embed] });
            console.log(`📨 Notificação de promoção enviada para ${interaction.user.tag}`);
          } catch (err) {
            console.error(`❌ Erro ao enviar notificação de promoção:`, err.message);
          }
        }
        let mensagem = `✅ **${nome}** foi adicionado à sua lista /quero!`;
        if (comingSoon) mensagem += ` 📅 (Lançamento futuro)`;
        if (estaEmPromocao && precoInfo) {
          mensagem += `\n\n🎉 **EM PROMOÇÃO AGORA!** (Notificação enviada por DM)`;
          mensagem += `\n💰 De: ~~${precoInfo.precoAntigo}~~`;
          mensagem += `\n💰 Por: **${precoInfo.precoAtual}**`;
          mensagem += `\n📉 Desconto: **${precoInfo.desconto}% OFF**`;
        }
        mensagem += `\n🔗 ${link}`;
        await interaction.editReply({ content: mensagem });
        console.log(`✅ /quero - ${interaction.user.tag} adicionou: ${nome}`);
      } else {
        await interaction.editReply(`❌ Erro ao adicionar **${nome}** à lista.`);
      }
    } catch (error) {
      console.error('❌ Erro no /quero:', error);
      await interaction.editReply('❌ Ocorreu um erro ao processar o comando. Tente novamente.');
    }
  }
});

// ============================================================
// 25. COMANDO /quero-listar
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'quero-listar') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const discordId = interaction.user.id;
      const lista = await loadQueroList(discordId);
      if (!lista || lista.length === 0) {
        await interaction.editReply('📭 Sua lista `/quero` está vazia! Use `/quero [jogo]` para adicionar jogos.');
        return;
      }
      const maxDisplay = 25;
      let listaFormatada = '';
      const totalJogos = lista.length;
      const listaOrdenada = [...lista].sort((a, b) => new Date(b.adicionado_em) - new Date(a.adicionado_em));
      const jogosParaMostrar = listaOrdenada.slice(0, maxDisplay);
      for (let i = 0; i < jogosParaMostrar.length; i++) {
        const jogo = jogosParaMostrar[i];
        const status = jogo.coming_soon ? '📅 (Em breve)' : '✅ Disponível';
        listaFormatada += `${i+1}. **${jogo.nome}** ${status}\n`;
      }
      let mensagem = `📋 **Sua lista /quero** (${totalJogos} jogos)\n\n${listaFormatada}`;
      if (totalJogos > maxDisplay) mensagem += `\n... e mais ${totalJogos - maxDisplay} jogos.`;
      if (mensagem.length > 1900) {
        const buffer = Buffer.from(mensagem, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: 'lista_quero.txt' });
        await interaction.editReply({ content: `📋 Sua lista /quero tem ${totalJogos} jogos.`, files: [attachment] });
      } else {
        await interaction.editReply({ content: mensagem });
      }
    } catch (error) {
      console.error('❌ Erro no /quero-listar:', error);
      await interaction.editReply('❌ Ocorreu um erro ao listar sua lista. Tente novamente.');
    }
  }
});

// ============================================================
// 26. COMANDO /quero-remover
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'quero-remover') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const jogoInput = interaction.options.getString('jogo').trim();
      const discordId = interaction.user.id;
      let jogoInfo = await searchGameOnSteam(jogoInput);
      if (!jogoInfo) {
        const appidMatch = jogoInput.match(/^\d+$/);
        if (appidMatch) {
          const detalhes = await getGameDetails(parseInt(appidMatch[0]));
          if (detalhes) {
            jogoInfo = {
              appid: parseInt(appidMatch[0]),
              nome: detalhes.name,
              link: `https://store.steampowered.com/app/${appidMatch[0]}`
            };
          }
        }
      }
      if (!jogoInfo) {
        await interaction.editReply(`❌ Não encontrei o jogo **${jogoInput}** na Steam.`);
        return;
      }
      const removido = await removerQuero(discordId, jogoInfo.appid);
      if (removido) {
        await interaction.editReply(`✅ **${jogoInfo.nome}** foi removido da sua lista /quero!`);
        console.log(`✅ /quero-remover - ${interaction.user.tag} removeu: ${jogoInfo.nome}`);
      } else {
        await interaction.editReply(`❌ **${jogoInfo.nome}** não está na sua lista /quero.`);
      }
    } catch (error) {
      console.error('❌ Erro no /quero-remover:', error);
      await interaction.editReply('❌ Ocorreu um erro ao remover o jogo. Tente novamente.');
    }
  }
});

// ============================================================
// 27. COMANDO /tem (CORRIGIDO COM FILTRO DE COMPATIBILIDADE)
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'tem') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const jogoInput = interaction.options.getString('jogo').trim();
      let jogoInfo = await searchGameOnSteam(jogoInput);
      if (!jogoInfo) {
        const appidMatch = jogoInput.match(/^\d+$/);
        if (appidMatch) {
          const detalhes = await getGameDetails(parseInt(appidMatch[0]));
          if (detalhes) {
            jogoInfo = {
              appid: parseInt(appidMatch[0]),
              nome: detalhes.name,
              link: `https://store.steampowered.com/app/${appidMatch[0]}`,
              capa: detalhes.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appidMatch[0]}/header.jpg`
            };
          }
        }
      }
      if (!jogoInfo) {
        await interaction.editReply(`❌ Não encontrei o jogo **${jogoInput}** na Steam.`);
        return;
      }
      const appid = jogoInfo.appid, nome = jogoInfo.nome, link = jogoInfo.link;
      let encontrado = false, donos = [];
      for (const sid of STEAM_IDS_ARRAY) {
        if ((db.historicoJogos[sid] || []).includes(appid)) {
          encontrado = true;
          const member = MEMBROS[sid];
          if (member) donos.push(member.nome);
        }
      }
      if (encontrado) {
        const compat = await verificarCompatibilidadeFamilia(appid);
        let mensagem = `✅ **${nome}** está na biblioteca da família!\n👥 Dono(s): ${donos.join(', ')}\n🔗 ${link}`;
        if (!compat.compatível) {
          mensagem = `⚠️ **${nome}** está na biblioteca, mas **NÃO é compatível com Family Sharing**!\nMotivo: ${compat.motivo}\n👥 Dono(s): ${donos.join(', ')}\n🔗 ${link}`;
        }
        await interaction.editReply({ content: mensagem });
      } else {
        await interaction.editReply(`❌ **${nome}** NÃO está na biblioteca da família.`);
      }
    } catch (error) {
      console.error('❌ Erro no /tem:', error);
      await interaction.editReply('❌ Ocorreu um erro ao verificar o jogo. Tente novamente.');
    }
  }
});

// ============================================================
// 28. COMANDO /conquista (COM PAGINAÇÃO E SELECT MENU)
// ============================================================

// Cache de sessões (expira em 10 minutos)
const conquestSessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of conquestSessions) {
    if (now - data.timestamp > 600000) conquestSessions.delete(key);
  }
}, 60000);

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'conquista') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const nomeJogo = interaction.options.getString('jogo').trim();
    const userId = interaction.user.id;

    // Descobrir qual Steam ID pertence ao usuário
    let steamId = null;
    for (const [sid, member] of Object.entries(MEMBROS)) {
      if (member.discordId === userId) {
        steamId = sid;
        break;
      }
    }
    if (!steamId) {
      await interaction.editReply('❌ Você não está mapeado como membro da família.');
      return;
    }

    // Buscar jogos recentes para encontrar o appid
    const recentGames = await getRecentlyPlayedGames(steamId, 20);
    if (!recentGames || recentGames.length === 0) {
      await interaction.editReply('❌ Não encontrei jogos recentes seus.');
      return;
    }

    const lowerNome = nomeJogo.toLowerCase();
    let gameFound = recentGames.find(g => g.name.toLowerCase().includes(lowerNome));
    if (!gameFound) {
      const searchResult = await searchGameOnSteam(nomeJogo);
      if (searchResult) {
        let found = false;
        for (const sid of STEAM_IDS_ARRAY) {
          if ((db.historicoJogos[sid] || []).includes(searchResult.appid)) {
            found = true;
            break;
          }
        }
        if (!found) {
          await interaction.editReply(`❌ O jogo **${searchResult.nome}** não está na biblioteca da família.`);
          return;
        }
        gameFound = { appid: searchResult.appid, name: searchResult.nome };
      } else {
        await interaction.editReply(`❌ Não encontrei o jogo **${nomeJogo}** na Steam ou na família.`);
        return;
      }
    }

    const appid = gameFound.appid;
    const nomeJogoFinal = gameFound.name;

    // Buscar conquistas com porcentagem
    const conquistasData = await getPlayerAchievementsWithPercent(steamId, appid);
    if (!conquistasData || !conquistasData.achievements || conquistasData.achievements.length === 0) {
      await interaction.editReply(`ℹ️ **${nomeJogoFinal}** não possui conquistas ou elas são privadas.`);
      return;
    }

    const allAchievements = conquistasData.achievements;
    const desbloqueadas = allAchievements.filter(a => a.achieved === 1);
    const totalDesbloq = desbloqueadas.length;
    const totalJogo = allAchievements.length;

    // Ordenar: primeiro desbloqueadas, depois bloqueadas
    const sorted = [...allAchievements].sort((a, b) => {
      if (a.achieved === 1 && b.achieved === 0) return -1;
      if (a.achieved === 0 && b.achieved === 1) return 1;
      return 0;
    });

    // Gerar páginas com 6 conquistas cada
    const ITEMS_PER_PAGE = 6;
    const pages = [];
    for (let i = 0; i < sorted.length; i += ITEMS_PER_PAGE) {
      pages.push(sorted.slice(i, i + ITEMS_PER_PAGE));
    }

    // Criar sessão com ID fixo baseado no usuário e jogo (para persistência)
    const sessionId = `${userId}_${appid}`;
    conquestSessions.set(sessionId, {
      appid,
      gameName: nomeJogoFinal,
      allAchievements: sorted,
      pages,
      totalPages: pages.length,
      timestamp: Date.now()
    });

    // Enviar primeira página
    await sendConquestPage(interaction, sessionId, 0);

  } catch (error) {
    console.error('❌ Erro no /conquista:', error);
    await interaction.editReply('❌ Ocorreu um erro ao buscar conquistas. Tente novamente mais tarde.');
  }
});

// Função auxiliar para enviar uma página (usada também para navegação)
async function sendConquestPage(interaction, sessionId, pageIndex) {
  const session = conquestSessions.get(sessionId);
  if (!session) {
    // Se a sessão expirou, recria com os dados atuais? Não temos os dados, então avisa.
    if (interaction.deferred) {
      await interaction.editReply({ content: '❌ Sessão expirada. Use /conquista novamente.', components: [] });
    } else {
      await interaction.reply({ content: '❌ Sessão expirada. Use /conquista novamente.', flags: MessageFlags.Ephemeral });
    }
    return;
  }

  const { appid, gameName, pages, totalPages } = session;
  const pageAchievements = pages[pageIndex] || [];
  const totalJogo = session.allAchievements.length;
  const desbloqueadas = session.allAchievements.filter(a => a.achieved === 1).length;

  // Montar descrição do embed
  let desc = `🎮 **${gameName}**\n📊 ${desbloqueadas}/${totalJogo} conquistas desbloqueadas\n\n`;
  for (const ach of pageAchievements) {
    const nomeAch = await getAchievementDisplayName(appid, ach.apiname);
    const status = ach.achieved === 1 ? '✅' : '🔒';
    const percent = ach.percentFormatado || 'N/A';
    desc += `${status} **${nomeAch}** (${percent})\n`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle(`🏆 Conquistas de ${gameName}`)
    .setDescription(desc)
    .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`)
    .setTimestamp()
    .setFooter({ 
      text: `Página ${pageIndex + 1} de ${totalPages} • ${interaction.user.username}`,
      iconURL: interaction.user.displayAvatarURL()
    });

  // Criar select menu com as conquistas da página
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`conq_select_${sessionId}_${pageIndex}`)
    .setPlaceholder('🔍 Clique para ver detalhes de uma conquista')
    .setMinValues(1)
    .setMaxValues(1);

  for (const ach of pageAchievements) {
    const nomeAch = await getAchievementDisplayName(appid, ach.apiname);
    const label = `${ach.achieved === 1 ? '✅' : '🔒'} ${nomeAch.substring(0, 50)}`;
    selectMenu.addOptions({
      label: label,
      value: ach.apiname,
      description: ach.percentFormatado || 'N/A'
    });
  }

  const row1 = new ActionRowBuilder().addComponents(selectMenu);

  // Botões de navegação
  const row2 = new ActionRowBuilder();
  if (pageIndex > 0) {
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`conq_nav_${sessionId}_${pageIndex - 1}`)
        .setLabel('◀ Anterior')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (pageIndex < totalPages - 1) {
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`conq_nav_${sessionId}_${pageIndex + 1}`)
        .setLabel('Próxima ▶')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  const components = [row1];
  if (row2.components.length > 0) components.push(row2);

  // Verificar se a interação já foi respondida ou é um follow-up
  try {
    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed], components });
    } else if (interaction.replied) {
      await interaction.followUp({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    console.error('❌ Erro ao enviar página:', error);
  }
}

// ============================================================
// 29. HANDLERS DE BOTÕES E SELECT MENU PARA /conquista
// ============================================================

// Handler para navegação entre páginas
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('conq_nav_')) return;

  await interaction.deferUpdate();

  try {
    const parts = interaction.customId.split('_');
    const sessionId = parts[2];
    const newPage = parseInt(parts[3]);

    const session = conquestSessions.get(sessionId);
    if (!session) {
      await interaction.editReply({ content: '❌ Sessão expirada. Use /conquista novamente.', components: [] });
      return;
    }

    // Atualizar a mensagem com a nova página
    await sendConquestPage(interaction, sessionId, newPage);
  } catch (error) {
    console.error('❌ Erro ao navegar páginas:', error);
    await interaction.editReply({ content: '❌ Erro ao navegar.', components: [] });
  }
});

// Handler para seleção de uma conquista (exibe detalhes + botão de vídeo)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (!interaction.customId.startsWith('conq_select_')) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const parts = interaction.customId.split('_');
    const sessionId = parts[2];
    const pageIndex = parseInt(parts[3]);
    const apiname = interaction.values[0];

    const session = conquestSessions.get(sessionId);
    if (!session) {
      await interaction.editReply('❌ Sessão expirada. Use /conquista novamente.');
      return;
    }

    const { appid, gameName, allAchievements } = session;
    const ach = allAchievements.find(a => a.apiname === apiname);
    if (!ach) {
      await interaction.editReply('❌ Conquista não encontrada.');
      return;
    }

    // Buscar descrição e ícone do schema
    const descricao = await getAchievementDescription(appid, apiname);
    const nomeBonito = await getAchievementDisplayName(appid, apiname);
    const iconUrl = await getAchievementIcon(appid, apiname);

    const embed = new EmbedBuilder()
      .setColor(ach.achieved === 1 ? 0x00FF00 : 0xFF0000)
      .setTitle(`${ach.achieved === 1 ? '✅' : '🔒'} ${nomeBonito}`)
      .setDescription(descricao || 'Sem descrição disponível.')
      .addFields(
        { name: '🎮 Jogo', value: gameName, inline: true },
        { name: '📊 Status', value: ach.achieved === 1 ? 'Desbloqueada' : 'Bloqueada', inline: true },
        { name: '📈 Raridade', value: ach.percentFormatado || 'N/A', inline: true }
      )
      .setTimestamp();

    if (iconUrl) {
      embed.setThumbnail(iconUrl.startsWith('http') ? iconUrl : `https://cdn.steamstatic.com/steamcommunity/public/images/apps/${appid}/${iconUrl}`);
    } else {
      embed.setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`);
    }

    // Botão para vídeo guia (se desbloqueada)
    const row = new ActionRowBuilder();
    if (ach.achieved === 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`conq_video_${sessionId}_${apiname}`)
          .setLabel('🎬 Vídeo Guia')
          .setStyle(ButtonStyle.Primary)
      );
    }

    await interaction.editReply({ embeds: [embed], components: row.components.length > 0 ? [row] : [] });
  } catch (error) {
    console.error('❌ Erro ao mostrar detalhes da conquista:', error);
    await interaction.editReply('❌ Erro ao carregar detalhes.');
  }
});

// Handler para botão de vídeo guia (quando clicado no detalhe)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('conq_video_')) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const parts = interaction.customId.split('_');
    const sessionId = parts[2];
    const apiname = parts[3];

    const session = conquestSessions.get(sessionId);
    if (!session) {
      await interaction.editReply('❌ Sessão expirada. Use /conquista novamente.');
      return;
    }

    const { appid, gameName, allAchievements } = session;
    const ach = allAchievements.find(a => a.apiname === apiname);
    if (!ach) {
      await interaction.editReply('❌ Conquista não encontrada.');
      return;
    }

    const nomeBonito = await getAchievementDisplayName(appid, apiname);
    const videoInfo = await buscarVideoYouTube(gameName, nomeBonito);

    if (videoInfo) {
      await interaction.editReply(`🎬 **Vídeo guia para "${nomeBonito}":**\n${videoInfo.link}`);
    } else {
      await interaction.editReply(`❌ Não encontrei vídeo guia para "${nomeBonito}".`);
    }
  } catch (error) {
    console.error('❌ Erro ao buscar vídeo:', error);
    await interaction.editReply('❌ Erro ao buscar vídeo guia.');
  }
});

// ============================================================
// 29. HANDLERS DE BOTÕES E SELECT MENU PARA /conquista
// ============================================================

// Handler para navegação entre páginas
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('conq_nav_')) return;

  await interaction.deferUpdate();

  try {
    const parts = interaction.customId.split('_');
    const sessionId = parts[2];
    const newPage = parseInt(parts[3]);

    // Verifica se a sessão existe; se não, avisa e limpa os componentes
    if (!conquestSessions.has(sessionId)) {
      await interaction.editReply({ 
        content: '❌ Sessão expirada. Use /conquista novamente.', 
        components: [] 
      });
      return;
    }

    // Atualizar a mensagem com a nova página
    await sendConquestPage(interaction, sessionId, newPage);
  } catch (error) {
    console.error('❌ Erro ao navegar páginas:', error);
    await interaction.editReply({ content: '❌ Erro ao navegar.', components: [] });
  }
});

// Handler para seleção de uma conquista (exibe detalhes + botão de vídeo)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (!interaction.customId.startsWith('conq_select_')) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const parts = interaction.customId.split('_');
    const sessionId = parts[2];
    const pageIndex = parseInt(parts[3]);
    const apiname = interaction.values[0];

    const session = conquestSessions.get(sessionId);
    if (!session) {
      await interaction.editReply('❌ Sessão expirada. Use /conquista novamente.');
      return;
    }

    const { appid, gameName, allAchievements } = session;
    const ach = allAchievements.find(a => a.apiname === apiname);
    if (!ach) {
      await interaction.editReply('❌ Conquista não encontrada.');
      return;
    }

    // Buscar descrição e ícone do schema
    const descricao = await getAchievementDescription(appid, apiname);
    const nomeBonito = await getAchievementDisplayName(appid, apiname);
    const iconUrl = await getAchievementIcon(appid, apiname);

    const embed = new EmbedBuilder()
      .setColor(ach.achieved === 1 ? 0x00FF00 : 0xFF0000)
      .setTitle(`${ach.achieved === 1 ? '✅' : '🔒'} ${nomeBonito}`)
      .setDescription(descricao || 'Sem descrição disponível.')
      .addFields(
        { name: '🎮 Jogo', value: gameName, inline: true },
        { name: '📊 Status', value: ach.achieved === 1 ? 'Desbloqueada' : 'Bloqueada', inline: true },
        { name: '📈 Raridade', value: ach.percentFormatado || 'N/A', inline: true }
      )
      .setTimestamp();

    if (iconUrl) {
      embed.setThumbnail(iconUrl.startsWith('http') ? iconUrl : `https://cdn.steamstatic.com/steamcommunity/public/images/apps/${appid}/${iconUrl}`);
    } else {
      embed.setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`);
    }

    // Botão para vídeo guia (se desbloqueada)
    const row = new ActionRowBuilder();
    if (ach.achieved === 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`conq_video_${sessionId}_${apiname}`)
          .setLabel('🎬 Vídeo Guia')
          .setStyle(ButtonStyle.Primary)
      );
    }

    await interaction.editReply({ embeds: [embed], components: row.components.length > 0 ? [row] : [] });
  } catch (error) {
    console.error('❌ Erro ao mostrar detalhes da conquista:', error);
    await interaction.editReply('❌ Erro ao carregar detalhes.');
  }
});

// Handler para botão de vídeo guia (quando clicado no detalhe)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('conq_video_')) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const parts = interaction.customId.split('_');
    const sessionId = parts[2];
    const apiname = parts[3];

    const session = conquestSessions.get(sessionId);
    if (!session) {
      await interaction.editReply('❌ Sessão expirada. Use /conquista novamente.');
      return;
    }

    const { appid, gameName, allAchievements } = session;
    const ach = allAchievements.find(a => a.apiname === apiname);
    if (!ach) {
      await interaction.editReply('❌ Conquista não encontrada.');
      return;
    }

    const nomeBonito = await getAchievementDisplayName(appid, apiname);
    const videoInfo = await buscarVideoYouTube(gameName, nomeBonito);

    if (videoInfo) {
      await interaction.editReply(`🎬 **Vídeo guia para "${nomeBonito}":**\n${videoInfo.link}`);
    } else {
      await interaction.editReply(`❌ Não encontrei vídeo guia para "${nomeBonito}".`);
    }
  } catch (error) {
    console.error('❌ Erro ao buscar vídeo:', error);
    await interaction.editReply('❌ Erro ao buscar vídeo guia.');
  }
});

// ============================================================
// 32. HEALTH CHECK
// ============================================================
if (process.env.PORT) {
  try {
    const express = require('express');
    const app = express();
    app.get('/health', (req, res) => {
      res.status(200).json({ status: 'online', uptime: process.uptime(), timestamp: new Date().toISOString() });
    });
    app.listen(process.env.PORT, () => {
      console.log(`🌐 Health check disponível na porta ${process.env.PORT}`);
    });
  } catch (e) {
    console.log('ℹ️ Express não disponível para health check');
  }
}

// ============================================================
// 33. LOGIN
// ============================================================
console.log('🔑 Tentando login...');
client.login(DISCORD_TOKEN)
  .then(() => console.log('✅ Login chamado com sucesso'))
  .catch(err => {
    console.error('❌ Erro ao fazer login:', err.message);
    process.exit(1);
  });

process.on('SIGTERM', () => { process.exit(0); });
process.on('SIGINT', () => { process.exit(0); });
