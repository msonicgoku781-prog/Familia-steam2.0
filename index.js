// ============================================================
// BOT STEAM FAMÍLIA - VERSÃO COMPLETA (12 JOGOS)
// ============================================================

console.log('========================================');
console.log('🚀 BOT STEAM FAMÍLIA - INICIANDO');
console.log(`📅 ${new Date().toLocaleString()}`);
console.log(`🆔 Node.js: ${process.version}`);
console.log(`📁 Diretório: ${__dirname}`);
console.log('========================================');

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

console.log('🚀 [5] Constantes definidas.');

// ============================================================
// 4. BANCO DE DADOS (ANEXO NO CANAL PRIVADO)
// ============================================================
let db = null;
let dbMessageId = null;
let videoCache = {};
let videoCacheMessageId = null;
const VIDEO_CACHE_FILENAME = 'video_cache.json';

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

async function carregarDBDoCanal() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) {
    console.error('❌ Canal QUERO_CHANNEL não encontrado!');
    return null;
  }
  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const dbMsg = messages.find(m => m.content === 'DB_FILE' && m.attachments.size > 0);
    if (dbMsg) {
      dbMessageId = dbMsg.id;
      const attachment = dbMsg.attachments.first();
      if (attachment && attachment.url) {
        const response = await axios.get(attachment.url, { responseType: 'json' });
        console.log('✅ Banco de dados carregado do anexo do canal.');
        return response.data;
      }
    }
  } catch (e) {
    console.error('❌ Erro ao carregar banco do anexo:', e);
  }
  return null;
}

async function salvarDBNoCanal() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) {
    console.error('❌ Canal QUERO_CHANNEL não encontrado!');
    return false;
  }
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const dbMessages = messages.filter(m => m.content === 'DB_FILE' && m.attachments.size > 0);
    
    for (const [, msg] of dbMessages) {
      if (msg.id !== dbMessageId) {
        try {
          await msg.delete();
          console.log(`🗑️ Mensagem DB_FILE antiga deletada: ${msg.id}`);
        } catch (e) {
          console.log(`⚠️ Não foi possível deletar mensagem ${msg.id}: ${e.message}`);
        }
      }
    }

    if (dbMessageId) {
      try {
        const antiga = await channel.messages.fetch(dbMessageId);
        if (antiga) {
          const jsonData = JSON.stringify(db, null, 2);
          const buffer = Buffer.from(jsonData, 'utf-8');
          const attachment = new AttachmentBuilder(buffer, { name: 'db.json' });
          await antiga.edit({
            content: 'DB_FILE',
            files: [attachment]
          });
          console.log('✅ Banco de dados atualizado (mensagem editada)');
          return true;
        }
      } catch (_) {
        dbMessageId = null;
      }
    }

    const jsonData = JSON.stringify(db, null, 2);
    const buffer = Buffer.from(jsonData, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: 'db.json' });
    const novaMsg = await channel.send({
      content: 'DB_FILE',
      files: [attachment]
    });
    dbMessageId = novaMsg.id;
    console.log('✅ Banco de dados salvo (nova mensagem criada)');
    return true;
  } catch (e) {
    console.error('❌ Erro ao salvar banco no anexo:', e);
    return false;
  }
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
    console.log(`💾 Banco de dados carregado do anexo (versão ${db.rankingVersion})`);
  } else {
    db = criarDBInicial();
    await salvarDBNoCanal();
    console.log('📊 Banco de dados inicial criado como anexo no canal.');
  }
}

// ============================================================
// 4.1 CACHE DE VÍDEOS
// ============================================================
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
        console.log(`✅ Cache de vídeos carregado: ${Object.keys(videoCache).length} vídeos`);
        return;
      }
    }
    videoCache = {};
    console.log('📊 Cache de vídeos inicializado (vazio)');
  } catch (e) {
    console.error('❌ Erro ao carregar cache de vídeos:', e);
    videoCache = {};
  }
}

async function salvarVideoCache() {
  const channel = client.channels.cache.get(QUERO_CHANNEL);
  if (!channel) return false;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const cacheMessages = messages.filter(m => m.content === 'VIDEO_CACHE' && m.attachments.size > 0);
    
    for (const [, msg] of cacheMessages) {
      if (msg.id !== videoCacheMessageId) {
        try {
          await msg.delete();
          console.log(`🗑️ Mensagem VIDEO_CACHE antiga deletada: ${msg.id}`);
        } catch (e) {
          console.log(`⚠️ Não foi possível deletar mensagem ${msg.id}: ${e.message}`);
        }
      }
    }

    if (videoCacheMessageId) {
      try {
        const antiga = await channel.messages.fetch(videoCacheMessageId);
        if (antiga) {
          const jsonData = JSON.stringify(videoCache, null, 2);
          const buffer = Buffer.from(jsonData, 'utf-8');
          const attachment = new AttachmentBuilder(buffer, { name: VIDEO_CACHE_FILENAME });
          await antiga.edit({
            content: 'VIDEO_CACHE',
            files: [attachment]
          });
          console.log(`✅ Cache de vídeos atualizado (mensagem editada)`);
          return true;
        }
      } catch (_) {
        videoCacheMessageId = null;
      }
    }

    const jsonData = JSON.stringify(videoCache, null, 2);
    const buffer = Buffer.from(jsonData, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: VIDEO_CACHE_FILENAME });
    const novaMsg = await channel.send({
      content: 'VIDEO_CACHE',
      files: [attachment]
    });
    videoCacheMessageId = novaMsg.id;
    console.log(`✅ Cache de vídeos salvo (nova mensagem criada)`);
    return true;
  } catch (e) {
    console.error('❌ Erro ao salvar cache de vídeos:', e);
    return false;
  }
}

async function getVideoFromCache(jogo, conquista) {
  const key = `${jogo}|${conquista}`.toLowerCase();
  if (videoCache[key]) {
    console.log(`✅ [CACHE] Vídeo encontrado para "${conquista}"`);
    return videoCache[key];
  }
  return null;
}

async function saveVideoToCache(jogo, conquista, videoInfo) {
  const key = `${jogo}|${conquista}`.toLowerCase();
  videoCache[key] = videoInfo;
  salvarVideoCache().catch(e => console.error('❌ Erro ao salvar cache:', e));
  console.log(`✅ [CACHE] Vídeo salvo no cache para "${conquista}"`);
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
    const list = JSON.parse(jsonPart);
    return Array.isArray(list) ? list : [];
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
  lista.push({ appid, nome, link, adicionado_em: new Date().toISOString(), coming_soon: comingSoon, ultimoEstadoPromocao: null });
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

console.log('🚀 [7] Funções /quero carregadas.');

// ============================================================
// 6. FUNÇÕES DA STEAM API
// ============================================================
let ultimaRequisicao = 0;
const MIN_INTERVALO = 1500;

async function fetchSteam(url, params = {}, retries = 3) {
  const inicio = Date.now();
  console.log(`⏱️ [fetchSteam] Iniciando: ${url.split('?')[0].split('/').pop()}`);
  
  const agora = Date.now();
  const espera = Math.max(0, MIN_INTERVALO - (agora - ultimaRequisicao));
  if (espera > 0) {
    console.log(`⏱️ [fetchSteam] Aguardando ${espera}ms antes da requisição`);
    await new Promise(r => setTimeout(r, espera));
  }
  ultimaRequisicao = Date.now();

  for (let i = 0; i < retries; i++) {
    try {
      const resp = await axios.get(url, {
        params: { ...params, key: STEAM_KEY },
        timeout: 10000,
        headers: { 'User-Agent': 'SteamFamilyBot/2.0' }
      });
      const duracao = Date.now() - inicio;
      console.log(`⏱️ [fetchSteam] Concluído em ${duracao}ms`);
      if (resp.status === 429) {
        console.log(`⏱️ [fetchSteam] Rate limit (429), aguardando...`);
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      return resp.data;
    } catch (e) {
      if (e.response && e.response.status === 429) {
        console.log(`⏱️ [fetchSteam] Rate limit detectado, tentativa ${i+1}`);
        await new Promise(r => setTimeout(r, 5000 * (i + 1)));
        continue;
      }
      console.log(`⏱️ [fetchSteam] Tentativa ${i+1} falhou: ${e.message}`);
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
    if (resp.data && resp.data[appId]?.success) {
      return resp.data[appId].data;
    }
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

async function getCurrentGame(steamId) {
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/`;
    const params = { key: STEAM_KEY, steamids: steamId };
    const data = await fetchSteam(url, params, 2);
    if (data?.response?.players?.length) {
      const player = data.response.players[0];
      if (player.gameid) {
        return {
          appid: parseInt(player.gameid),
          name: player.gameextrainfo || `Jogo ${player.gameid}`
        };
      }
    }
  } catch (e) {
    console.error(`❌ Erro ao buscar jogo atual de ${steamId}:`, e.message);
  }
  return null;
}

const achievementNameCache = {};

async function getAchievementDisplayName(appId, apiname) {
  const cacheKey = `${appId}_${apiname}`;
  if (achievementNameCache[cacheKey]) return achievementNameCache[cacheKey];
  try {
    const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/`;
    const params = { key: STEAM_KEY, appid: appId, l: 'portuguese' };
    const data = await fetchSteam(url, params, 2);
    if (data?.game?.availableGameStats?.achievements) {
      const ach = data.game.availableGameStats.achievements.find(a => a.name === apiname);
      if (ach && ach.displayName) {
        achievementNameCache[cacheKey] = ach.displayName;
        return ach.displayName;
      }
    }
  } catch (_) {}
  achievementNameCache[cacheKey] = apiname;
  return apiname;
}

const achievementDescriptionCache = {};

async function getAchievementDescription(appId, apiname) {
  const cacheKey = `${appId}_${apiname}`;
  if (achievementDescriptionCache[cacheKey]) return achievementDescriptionCache[cacheKey];
  try {
    const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/`;
    const params = { key: STEAM_KEY, appid: appId, l: 'portuguese' };
    const data = await fetchSteam(url, params, 2);
    if (data?.game?.availableGameStats?.achievements) {
      const ach = data.game.availableGameStats.achievements.find(a => a.name === apiname);
      if (ach && ach.description) {
        achievementDescriptionCache[cacheKey] = ach.description;
        return ach.description;
      }
    }
  } catch (e) {
    console.error(`❌ Erro ao buscar descrição da conquista ${apiname} para o jogo ${appId}:`, e.message);
  }
  return null;
}

const translationCache = new Map();

async function traduzirTexto(texto, targetLang = 'pt') {
  if (!texto || texto.length < 3) return texto;
  const cacheKey = `${texto}_${targetLang}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
  try {
    const url = 'https://api.mymemory.translated.net/get';
    const response = await axios.get(url, {
      params: {
        q: texto,
        langpair: `en|${targetLang}`,
        de: 'steam-family-bot'
      },
      timeout: 5000
    });
    if (response.data && response.data.responseData && response.data.responseData.translatedText) {
      const traduzido = response.data.responseData.translatedText;
      if (!traduzido.includes('INVALID') && !traduzido.includes('ERROR')) {
        translationCache.set(cacheKey, traduzido);
        return traduzido;
      }
    }
  } catch (e) {
    console.error('❌ Erro ao traduzir texto:', e.message);
  }
  translationCache.set(cacheKey, texto);
  return texto;
}

console.log('🚀 [8] Funções da Steam API carregadas.');

// ============================================================
// 6.1 FUNÇÃO PARA BUSCAR CONQUISTAS COM PORCENTAGEM
// ============================================================
async function getPlayerAchievementsWithPercent(steamId, appId) {
  try {
    const playerData = await fetchSteam(
      'https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/',
      { steamid: steamId, appid: appId, format: 'json' }
    );
    
    if (!playerData?.playerstats?.achievements) {
      return null;
    }

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
    } catch (e) {
      console.log(`ℹ️ Não foi possível buscar porcentagens globais para ${appId}`);
    }

    const achievements = playerData.playerstats.achievements.map(ach => {
      const percent = globalPercentMap[ach.apiname] || 0;
      return {
        ...ach,
        percent: percent,
        percentFormatado: percent > 0 ? `${percent.toFixed(1)}%` : 'N/A'
      };
    });

    return {
      achievements: achievements,
      gameName: playerData.playerstats.gameName || `Jogo ${appId}`
    };
  } catch (error) {
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
        return { compatível: false, motivo: 'Jogos da Electronic Arts (EA) NÃO são compatíveis com Family Sharing' };
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
  if (!channel) {
    console.error('❌ Canal de regras não encontrado!');
    return;
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
      '`/dbstatus` – Status do banco de dados (apenas dono).\n' +
      '`/regras` – Exibe esta mensagem novamente.\n' +
      '`/conquista jogo:"nome"` – Mostra todas as conquistas de um jogo com vídeos guia.\n\n' +
      '**🔔 NOTIFICAÇÕES**\n' +
      '• 🆕 Novos jogos compatíveis são anunciados com `@everyone`.\n' +
      '• 🏆 Conquistas são monitoradas e notificadas no canal de conquistas.\n' +
      '• 📢 Lançamentos e promoções de jogos da sua lista `/quero` são enviados por DM.\n\n' +
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
  } catch (err) {
    console.error('❌ Erro ao enviar regras:', err);
  }
}

// ============================================================
// 10. VERIFICAÇÃO DE CONQUISTAS (VERSÃO ATUALIZADA)
// ============================================================
async function verificarConquistas(steamId, gamesToCheck, mention, userName) {
  if (!gamesToCheck?.length) {
    console.log(`ℹ️ ${userName} - Nenhum jogo para verificar conquistas.`);
    return;
  }
  
  if (!ACHIEVEMENT_CHANNEL_ID) {
    console.log(`⚠️ ACHIEVEMENT_CHANNEL_ID não definido. Pulando notificação.`);
    return;
  }
  
  console.log(`🔍 [VERIFICAR] Procurando canal de conquistas: ${ACHIEVEMENT_CHANNEL_ID}`);
  let channel = client.channels.cache.get(ACHIEVEMENT_CHANNEL_ID);
  
  if (!channel) {
    console.log(`⚠️ Canal ${ACHIEVEMENT_CHANNEL_ID} não encontrado no cache. Tentando buscar via fetch...`);
    try {
      channel = await client.channels.fetch(ACHIEVEMENT_CHANNEL_ID);
      if (channel) {
        console.log(`✅ Canal encontrado via fetch: ${channel.name} (${channel.id})`);
        client.channels.cache.set(channel.id, channel);
      }
    } catch (error) {
      console.error(`❌ Falha ao buscar canal ${ACHIEVEMENT_CHANNEL_ID}:`, error.message);
      console.log(`⚠️ Canal de conquistas não encontrado! As notificações não serão enviadas.`);
      return;
    }
  } else {
    console.log(`✅ Canal encontrado no cache: ${channel.name} (${channel.id})`);
  }

  if (!db.conquistas[steamId]) db.conquistas[steamId] = {};

  for (const game of gamesToCheck) {
    const appid = game.appid;
    const gameName = game.name || `Jogo ${appid}`;

    console.log(`🔍 Verificando conquistas de "${gameName}" (${appid}) para ${userName}`);

    let schemaData = null;
    try {
      const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/`;
      const params = { key: STEAM_KEY, appid: appid, l: 'portuguese' };
      schemaData = await fetchSteam(url, params, 2);
    } catch (e) {
      console.log(`⚠️ Erro ao buscar schema do jogo ${gameName}: ${e.message}`);
    }

    const iconMap = {};
    if (schemaData?.game?.availableGameStats?.achievements) {
      for (const ach of schemaData.game.availableGameStats.achievements) {
        if (ach.icon) {
          iconMap[ach.name] = ach.icon;
        }
      }
    }

    let conquistasData;
    try {
      conquistasData = await getPlayerAchievementsWithPercent(steamId, appid);
    } catch (e) {
      if (e.response && e.response.status === 400) {
        console.log(`ℹ️ ${gameName} não possui conquistas (ou não é suportado pela API). Ignorando.`);
        if (!db.jogosSemConquistas) db.jogosSemConquistas = {};
        db.jogosSemConquistas[appid] = { nome: gameName, data: new Date().toISOString(), motivo: 'sem_conquistas' };
        await salvarDBNoCanal();
        continue;
      }
      console.log(`⚠️ Erro ao buscar conquistas de ${gameName}: ${e.message}`);
      continue;
    }

    if (!conquistasData?.achievements || conquistasData.achievements.length === 0) {
      console.log(`ℹ️ ${gameName} não possui conquistas.`);
      if (!db.jogosSemConquistas) db.jogosSemConquistas = {};
      db.jogosSemConquistas[appid] = { nome: gameName, data: new Date().toISOString(), motivo: 'sem_conquistas' };
      await salvarDBNoCanal();
      continue;
    }

    const conquistas = conquistasData.achievements;
    const desbloqueadas = conquistas.filter(c => c.achieved === 1);
    const total = desbloqueadas.length;
    const totalJogo = conquistas.length;

    console.log(`📊 ${gameName}: ${total}/${totalJogo} conquistas desbloqueadas`);

    if (!db.conquistas[steamId][appid]) {
      db.conquistas[steamId][appid] = { 
        total, 
        nomes: desbloqueadas.map(c => c.apiname), 
        totalJogo
      };
      await salvarDBNoCanal();
      console.log(`📊 Primeira verificação de ${gameName}: ${total}/${totalJogo} conquistas`);
      continue;
    }

    const anterior = db.conquistas[steamId][appid];
    const totalAntigo = anterior.total || 0;
    const antigos = anterior.nomes || [];
    const novas = desbloqueadas.filter(c => !antigos.includes(c.apiname));

    if (novas.length === 0) {
      console.log(`ℹ️ ${gameName} - Nenhuma nova conquista para ${userName}`);
      continue;
    }

    console.log(`🎉 ${userName} desbloqueou ${novas.length} nova(s) conquista(s) em ${gameName}`);

    let contador = 0;
    for (const ach of novas) {
      contador++;
      const progressoAtual = totalAntigo + contador;
      const faltam = totalJogo - progressoAtual;
      const nomeBonito = await getAchievementDisplayName(appid, ach.apiname);

      // Busca a imagem da conquista
      let imageUrl = null;
      const iconName = iconMap[ach.apiname];
      if (iconName) {
        imageUrl = `https://cdn.steamstatic.com/steamcommunity/public/images/apps/${appid}/${iconName}`;
      }

      // Se não tiver ícone da conquista, usa a imagem do jogo
      if (!imageUrl) {
        try {
          const detalhes = await getGameDetails(appid);
          if (detalhes?.header_image) {
            imageUrl = detalhes.header_image;
          } else {
            imageUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
          }
        } catch (e) {
          console.log(`⚠️ Erro ao buscar imagem do jogo: ${e.message}`);
          imageUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
        }
      }

      // Verifica se a URL é válida
      if (!imageUrl || imageUrl.includes('null') || imageUrl.includes('undefined')) {
        imageUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
      }

      const percent = ach.percent || 0;
      const percentText = percent > 0 ? `${percent.toFixed(1)}% dos jogadores` : 'Dados indisponíveis';

      let rarezaEmoji = '';
      let rarezaText = '';
      if (percent > 0 && percent <= 5) {
        rarezaEmoji = '💎';
        rarezaText = ' (RARÍSSIMA!)';
      } else if (percent > 5 && percent <= 15) {
        rarezaEmoji = '🌟';
        rarezaText = ' (Rara)';
      }

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
        .setThumbnail(imageUrl)
        .setFooter({ 
          text: `🏆 ${userName} • ${gameName} • ${new Date().toLocaleTimeString()}`,
          iconURL: client.user.displayAvatarURL()
        })
        .setTimestamp();

      try {
        await channel.send({ embeds: [embed] });
        console.log(`✅ Mensagem de conquista enviada no canal ${channel.name}`);
      } catch (error) {
        console.error(`❌ Erro ao enviar mensagem no canal ${channel.name}:`, error.message);
      }
    }

    // Atualiza o banco de dados
    db.conquistas[steamId][appid] = { 
      total, 
      nomes: desbloqueadas.map(c => c.apiname), 
      totalJogo
    };
    await salvarDBNoCanal();
  }
}

// ============================================================
// 11. checkAchievements - 12 JOGOS (GARDEMI = 6)
// ============================================================
async function checkAchievements() {
  console.log(`🔍 [checkAchievements] Verificando conquistas da família...`);
  
  try {
    for (const steamId of STEAM_IDS_ARRAY) {
      try {
        const member = MEMBROS[steamId];
        if (!member) continue;
        const userName = member.nome;
        const discordId = member.discordId;
        const mention = `<@${discordId}>`;

        // 🔥 DEFINE O LIMITE POR USUÁRIO
        let limit = 12; // Padrão: 12 jogos
        if (userName === 'Gardemi') {
          limit = 6; // Gardemi: apenas 6 jogos
          console.log(`📊 [${userName}] Buscando APENAS ${limit} jogos recentes (limite personalizado)...`);
        } else {
          console.log(`📊 [${userName}] Buscando ${limit} jogos recentes...`);
        }

        const recentGames = await getRecentlyPlayedGames(steamId, limit);
        
        if (!recentGames || recentGames.length === 0) {
          console.log(`ℹ️ ${userName} - Nenhum jogo recente encontrado.`);
          continue;
        }

        console.log(`📊 ${userName} - ${recentGames.length} jogos recentes encontrados:`);
        for (const game of recentGames) {
          let lastPlayed = 'N/A';
          if (game.rtime_last_played) {
            const date = new Date(game.rtime_last_played * 1000);
            const agora = new Date();
            const diffMs = agora - date;
            const diffMin = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffMin < 1) {
              lastPlayed = 'Agora mesmo';
            } else if (diffMin < 60) {
              lastPlayed = `${diffMin} minutos atrás`;
            } else if (diffHours < 24) {
              lastPlayed = `${diffHours} horas atrás`;
            } else if (diffDays < 7) {
              lastPlayed = `${diffDays} dias atrás`;
            } else {
              lastPlayed = date.toLocaleDateString('pt-BR');
            }
          }
          console.log(`   🎮 ${game.name || `App ${game.appid}`} (${game.appid}) - Última vez: ${lastPlayed}`);
        }

        const jogosParaVerificar = [];
        const agora = Date.now();
        const INTERVALO_VERIFICACAO = 5 * 60 * 1000;
        
        for (const game of recentGames) {
          const appid = game.appid;
          
          if (db.jogosSemConquistas && db.jogosSemConquistas[appid]) {
            console.log(`ℹ️ ${game.name || `App ${appid}`} já foi marcado como sem conquistas. Ignorando.`);
            continue;
          }
          
          const ultimaVerificacao = db.ultimaVerificacao?.[steamId]?.[appid] || 0;
          const tempoDesdeUltimaVerificacao = (agora - ultimaVerificacao) / 1000 / 60;
          
          console.log(`   ⏱️ ${game.name || `App ${appid}`}: Última verificação há ${tempoDesdeUltimaVerificacao.toFixed(1)} minutos`);
          
          if (agora - ultimaVerificacao > INTERVALO_VERIFICACAO) {
            jogosParaVerificar.push(game);
            console.log(`   ✅ Será verificado agora`);
          } else {
            const tempoRestante = ((INTERVALO_VERIFICACAO - (agora - ultimaVerificacao)) / 1000 / 60);
            console.log(`   ⏳ Aguardando ${tempoRestante.toFixed(1)} minutos para próxima verificação`);
          }
        }

        if (jogosParaVerificar.length === 0) {
          console.log(`ℹ️ ${userName} - Todos os jogos recentes já foram verificados recentemente.`);
          continue;
        }

        console.log(`📊 ${userName} - Verificando ${jogosParaVerificar.length} jogos recentes:`);
        for (const game of jogosParaVerificar) {
          console.log(`   🎮 ${game.name || `App ${game.appid}`} (${game.appid})`);
        }

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
// 12. VERIFICAÇÃO DE NOVOS JOGOS
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
        const userName = member.nome;
        const discordId = member.discordId;

        if (!db.historicoJogos[steamId]) {
          db.historicoJogos[steamId] = allGames.map(g => g.appid);
          await salvarDBNoCanal();
          continue;
        }
        const oldIds = db.historicoJogos[steamId] || [];
        const newGames = allGames.filter(g => !oldIds.includes(g.appid));
        if (newGames.length === 0) continue;

        for (const game of newGames) {
          const appid = game.appid;
          const nome = game.name || `App ${appid}`;
          const link = `https://store.steampowered.com/app/${appid}`;
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
// 13. VERIFICAÇÃO DE LANÇAMENTOS E PROMOÇÕES
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

console.log('🚀 [11] Tarefas periódicas carregadas.');

// ============================================================
// 14. FUNÇÃO DE BUSCA DE VÍDEOS
// ============================================================
async function buscarVideoYouTube(nomeJogo, nomeConquista) {
  const cachedVideo = await getVideoFromCache(nomeJogo, nomeConquista);
  if (cachedVideo) {
    console.log(`✅ [CACHE] Vídeo encontrado para "${nomeConquista}"`);
    return cachedVideo;
  }
  
  console.log(`⏱️ [buscarVideoYouTube] INICIO: "${nomeJogo}" - "${nomeConquista}"`);
  
  if (!YOUTUBE_API_KEY) {
    console.warn('⚠️ YOUTUBE_API_KEY não definida.');
    return null;
  }

  try {
    const nomeJogoLimpo = nomeJogo.replace(/[^\w\s]/gi, '').trim();
    const nomeConquistaLimpo = nomeConquista.replace(/[^\w\s]/gi, '').trim();
    const termoBusca = `${nomeConquistaLimpo} ${nomeJogoLimpo} trophy`;
    
    const searchResponse = await Promise.race([
      axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          part: 'snippet',
          type: 'video',
          maxResults: 5,
          q: termoBusca,
          key: YOUTUBE_API_KEY,
          order: 'relevance'
        },
        timeout: 5000
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout YouTube')), 5000))
    ]);

    if (!searchResponse.data.items?.length) {
      console.log(`⚠️ Nenhum resultado para: "${termoBusca}"`);
      return null;
    }

    const primeiroVideo = searchResponse.data.items[0];
    const videoInfo = {
      id: primeiroVideo.id.videoId,
      titulo: primeiroVideo.snippet.title,
      canal: primeiroVideo.snippet.channelTitle,
      link: `https://www.youtube.com/watch?v=${primeiroVideo.id.videoId}`,
      views: 0
    };

    try {
      const statsResponse = await Promise.race([
        axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: {
            part: 'statistics',
            id: primeiroVideo.id.videoId,
            key: YOUTUBE_API_KEY
          },
          timeout: 2000
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout stats')), 2000))
      ]);
      if (statsResponse?.data?.items?.length > 0) {
        const stats = statsResponse.data.items[0];
        if (stats.statistics) {
          videoInfo.views = parseInt(stats.statistics.viewCount) || 0;
        }
      }
    } catch (e) {
      console.log(`⚠️ Erro nas estatísticas: ${e.message}`);
    }

    console.log(`✅ VÍDEO ENCONTRADO: "${videoInfo.titulo}"`);
    await saveVideoToCache(nomeJogo, nomeConquista, videoInfo);
    return videoInfo;
  } catch (error) {
    console.error(`❌ ERRO NA BUSCA: ${error.message}`);
    return null;
  }
}

console.log('🚀 [12] Função de busca de vídeos carregada.');

// ============================================================
// 15. CLIENT DISCORD
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

console.log('🚀 [13] Cliente Discord criado.');

// Eventos de conexão
client.on('disconnect', (event) => {
  console.log(`🔌 Desconectado: ${event.reason || 'Motivo desconhecido'}`);
});

client.on('reconnecting', () => {
  console.log('🔄 Tentando reconectar...');
});

client.on('error', (error) => {
  console.error('❌ Erro no cliente Discord:', error.message);
});

// ============================================================
// 16. CARREGAR MAPEAMENTO DE CONQUISTAS (MEGA MAN X)
// ============================================================
let conquestMappings = null;
let conquestMappingsLoaded = false;
const videoLinksMap = new Map();

async function carregarMapeamentoConquistas() {
  if (conquestMappingsLoaded && conquestMappings) {
    return conquestMappings;
  }

  const channelId = '1525926566373363823';
  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    console.error('❌ Canal #lista-quero não encontrado!');
    try {
      const fetched = await client.channels.fetch(channelId);
      if (fetched) {
        return await carregarMapeamentoDoCanal(fetched);
      }
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
// 17. EVENTO clientReady
// ============================================================
let botIniciado = false;
const flagFile = path.join(__dirname, 'bot_started.flag');

client.once('clientReady', async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
  console.log(`📋 Banco de dados armazenado como anexo no canal: <#${QUERO_CHANNEL}>`);
  console.log(`📢 ACHIEVEMENT_CHANNEL_ID configurado: ${ACHIEVEMENT_CHANNEL_ID || 'NÃO DEFINIDO'}`);

  try {
    await inicializarDB();
    await carregarVideoCache();
    console.log(`📊 Cache de vídeos: ${Object.keys(videoCache).length} vídeos`);

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
        { name: 'dbstatus', description: '[DONO] Status do banco de dados' },
        { name: 'regras', description: 'Mostra as regras e comandos do servidor' },
        {
          name: 'conquista',
          description: 'Mostra todas as conquistas de um jogo com vídeos guia',
          options: [{ name: 'jogo', description: 'Nome do jogo para buscar conquistas', type: 3, required: true }]
        }
      ];
      const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log('✅ Comandos registrados');
    } catch (err) {
      console.error('❌ Erro ao registrar comandos:', err);
    }

    // Verificação do canal de conquistas
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

    setInterval(checkAchievements, 30000);
    setInterval(checkNewGames, 300000);
    setInterval(verificarLancamentosQuero, 5 * 60 * 1000);
    setInterval(verificarPromocoesQuero, 5 * 60 * 1000);
    console.log('🔄 Monitorando conquistas a cada 30s, novos jogos a cada 5min.');

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
    console.error('❌ ERRO FATAL:', err);
  }
});

// ============================================================
// 18. COMANDO /dbstatus
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
        traducoes: translationCache.size
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
        { name: '👥 Membros', value: `${status.membros}`, inline: true },
        { name: '🔄 Steam IDs', value: `${status.steamIds}`, inline: true }
      )
      .setTimestamp();
      
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
});

// ============================================================
// 19. COMANDO /conquista
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'conquista') {
    console.log(`🎮 [COMANDO] /conquista por ${interaction.user.tag}`);
    
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const nomeJogoInput = interaction.options.getString('jogo').trim();
      console.log(`📌 Jogo: "${nomeJogoInput}"`);

      const jogoInfo = await searchGameOnSteam(nomeJogoInput);
      if (!jogoInfo) {
        await interaction.editReply(`❌ Não encontrei o jogo **${nomeJogoInput}** na Steam.`);
        return;
      }
      const appid = jogoInfo.appid;

      let userSteamId = null;
      for (const [sid, m] of Object.entries(MEMBROS)) {
        if (m.discordId === interaction.user.id) {
          userSteamId = sid;
          break;
        }
      }
      
      if (!userSteamId) {
        await interaction.editReply('❌ Você não está mapeado como membro da família.');
        return;
      }

      let jogoNaFamilia = false;
      let donosDoJogo = [];
      
      for (const [sid, jogos] of Object.entries(db.historicoJogos || {})) {
        if (jogos.includes(appid)) {
          jogoNaFamilia = true;
          const member = MEMBROS[sid];
          if (member) {
            donosDoJogo.push({
              nome: member.nome,
              discordId: member.discordId,
              steamId: sid
            });
          }
        }
      }

      if (!jogoNaFamilia) {
        for (const sid of STEAM_IDS_ARRAY) {
          try {
            const ownedGames = await getOwnedGames(sid);
            if (ownedGames.some(g => g.appid === appid)) {
              jogoNaFamilia = true;
              const member = MEMBROS[sid];
              if (member) {
                donosDoJogo.push({
                  nome: member.nome,
                  discordId: member.discordId,
                  steamId: sid
                });
              }
            }
          } catch (_) {}
        }
      }

      if (!jogoNaFamilia) {
        await interaction.editReply(`❌ Nenhum membro da família possui **${jogoInfo.nome}**.`);
        return;
      }

      const compat = await verificarCompatibilidadeFamilia(appid);
      if (!compat.compatível) {
        await interaction.editReply(`⚠️ **${jogoInfo.nome}** não é compatível com Family Sharing.\nMotivo: ${compat.motivo}`);
        return;
      }

      const isMegaManX = (appid === 743890);
      let conquistasSchema = [];
      let conquistasUsuario = [];

      if (isMegaManX && conquestMappings) {
        console.log(`🎮 Mega Man X detectado! Usando JSON.`);
        try {
          const playerAch = await getPlayerAchievements(userSteamId, appid);
          if (playerAch && Array.isArray(playerAch)) {
            conquistasUsuario = playerAch.filter(c => c.achieved === 1).map(c => c.apiname);
          }
        } catch (e) {
          conquistasUsuario = [];
        }

        conquistasSchema = Object.keys(conquestMappings).map(nome => {
          const data = conquestMappings[nome];
          return {
            name: nome,
            displayName: data.displayName || nome,
            description: data.description || 'Sem descrição disponível',
            icon: data.image || null,
            icongray: data.image || null
          };
        });
      } else {
        console.log(`🎮 Buscando schema da Steam...`);
        let schemaData;
        try {
          const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/`;
          const params = { key: STEAM_KEY, appid: appid, l: 'portuguese' };
          schemaData = await fetchSteam(url, params, 2);
        } catch (e) {
          await interaction.editReply(`❌ Erro ao buscar conquistas do jogo.`);
          return;
        }

        if (!schemaData?.game?.availableGameStats?.achievements) {
          await interaction.editReply(`❌ O jogo **${jogoInfo.nome}** não possui conquistas.`);
          return;
        }

        conquistasSchema = schemaData.game.availableGameStats.achievements;

        try {
          const playerAch = await getPlayerAchievements(userSteamId, appid);
          if (playerAch && Array.isArray(playerAch)) {
            conquistasUsuario = playerAch.filter(c => c.achieved === 1).map(c => c.apiname);
          }
        } catch (e) {
          conquistasUsuario = [];
        }
      }

      let conquistasList = conquistasSchema.map(ach => {
        const nome = ach.name;
        const desbloqueada = conquistasUsuario.includes(nome);
        
        return {
          name: nome,
          displayName: ach.displayName || nome,
          description: ach.description || 'Sem descrição disponível',
          icon: ach.icon || null,
          icongray: ach.icongray || null,
          desbloqueada: desbloqueada,
          status: desbloqueada ? '✅ Desbloqueada' : '🔒 Não desbloqueada'
        };
      });

      conquistasList.sort((a, b) => {
        if (a.desbloqueada === b.desbloqueada) return a.displayName.localeCompare(b.displayName);
        return a.desbloqueada ? 1 : -1;
      });

      const totalConquistas = conquistasList.length;
      const conquistasDesbloqueadas = conquistasList.filter(c => c.desbloqueada).length;
      const conquistasFaltantes = totalConquistas - conquistasDesbloqueadas;

      const usuarioTemJogo = donosDoJogo.some(d => d.steamId === userSteamId);
      const nomesDonos = donosDoJogo.map(d => d.nome).join(', ');

      async function generateAchievementEmbed(ach, index) {
        let imageUrl = ach.icon;
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = `https://cdn.steamstatic.com/steamcommunity/public/images/apps/${appid}/${imageUrl}`;
        }
        
        if (!imageUrl || imageUrl.includes('null')) {
          imageUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
        }

        let descricao = ach.description || 'Sem descrição disponível';
        if (descricao !== 'Sem descrição disponível' && descricao.length > 3) {
          const temAcento = /[áàâãéêíóôõúç]/i.test(descricao);
          if (!temAcento) {
            try {
              const traducao = await traduzirTexto(descricao);
              if (traducao && !traducao.includes('INVALID')) {
                descricao = traducao;
              }
            } catch (_) {}
          }
        }

        const embed = new EmbedBuilder()
          .setColor(ach.desbloqueada ? 0x00FF00 : 0xFF4444)
          .setTitle(`🏆 ${ach.displayName}`)
          .setDescription(descricao)
          .addFields(
            { name: '🎮 Jogo', value: jogoInfo.nome, inline: true },
            { name: '📊 Status', value: ach.status, inline: true },
            { name: '📈 Progresso', value: `${index + 1}/${totalConquistas}`, inline: true }
          )
          .setThumbnail(imageUrl)
          .setFooter({ 
            text: `🎯 ${conquistasDesbloqueadas}/${totalConquistas} desbloqueadas • Faltam ${conquistasFaltantes}` 
          })
          .setTimestamp();

        const buttons = new ActionRowBuilder();
        
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_list_conq')
            .setLabel('🔙 Voltar à lista')
            .setStyle(ButtonStyle.Secondary)
        );

        if (YOUTUBE_API_KEY) {
          const videoId = `video_${ach.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
          videoLinksMap.set(videoId, {
            jogo: jogoInfo.nome,
            conquista: ach.displayName,
            appid: appid,
            achName: ach.name
          });
          
          buttons.addComponents(
            new ButtonBuilder()
              .setCustomId(videoId)
              .setLabel('🎬 Buscar vídeo guia')
              .setStyle(ButtonStyle.Primary)
          );
        }

        return { embed, buttons };
      }

      const ITEMS_PER_PAGE = 10;
      let currentPage = 0;

      function generateSelectMenu(page) {
        const start = page * ITEMS_PER_PAGE;
        const end = Math.min(start + ITEMS_PER_PAGE, totalConquistas);
        const pageItems = conquistasList.slice(start, end);

        return new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('conquista_select')
              .setPlaceholder(`Escolha uma conquista (${page + 1}/${Math.ceil(totalConquistas / ITEMS_PER_PAGE)})`)
              .addOptions(
                pageItems.map((ach, idx) => {
                  const emoji = ach.desbloqueada ? '✅' : '🔒';
                  const label = `${emoji} ${ach.displayName}`;
                  return {
                    label: label.length > 100 ? label.substring(0, 97) + '...' : label,
                    description: ach.description ? ach.description.substring(0, 100) : 'Sem descrição',
                    value: String(start + idx),
                  };
                })
              )
          );
      }

      function generatePaginationButtons(page) {
        const totalPages = Math.ceil(totalConquistas / ITEMS_PER_PAGE);
        return new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('prev_page_conq')
              .setLabel('◀️ Anterior')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page === 0),
            new ButtonBuilder()
              .setCustomId('next_page_conq')
              .setLabel('Próxima ▶️')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page === totalPages - 1)
          );
      }

      let mensagemAcesso = '';
      if (usuarioTemJogo) {
        mensagemAcesso = `🎮 Você possui **${jogoInfo.nome}**`;
      } else {
        mensagemAcesso = `🎮 **${jogoInfo.nome}** está disponível via Family Sharing`;
      }

      let descricaoResumo = `${mensagemAcesso}\n\n`;
      
      if (conquistasDesbloqueadas === 0 && conquistasUsuario.length === 0) {
        descricaoResumo += `**📊 Todas as Conquistas do Jogo**\n\n`;
        descricaoResumo += `🔒 **Não desbloqueadas:** ${totalConquistas}/${totalConquistas}\n`;
        descricaoResumo += `📊 **Progresso:** 0%\n\n`;
        descricaoResumo += `📌 **Legenda:** 🔒 Conquista não desbloqueada\n\n`;
        descricaoResumo += `Selecione uma conquista no menu abaixo para ver os detalhes.`;
        descricaoResumo += `\n\n💡 **Dica:** Clique em "🎬 Buscar vídeo guia" para encontrar um vídeo da conquista.`;
      } else {
        descricaoResumo += `**📊 Suas Conquistas**\n\n`;
        descricaoResumo += `✅ **Desbloqueadas:** ${conquistasDesbloqueadas}/${totalConquistas}\n`;
        descricaoResumo += `🔒 **Faltantes:** ${conquistasFaltantes}/${totalConquistas}\n`;
        descricaoResumo += `📊 **Progresso:** ${Math.round((conquistasDesbloqueadas/totalConquistas)*100)}%\n\n`;
        descricaoResumo += `📌 **Legenda:** ✅ Desbloqueada | 🔒 Não desbloqueada\n\n`;
        descricaoResumo += `Selecione uma conquista no menu abaixo para ver os detalhes.`;
        descricaoResumo += `\n\n💡 **Dica:** Clique em "🎬 Buscar vídeo guia" para encontrar um vídeo da conquista.`;
      }

      const embedResumo = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle(`🎮 ${jogoInfo.nome}`)
        .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`)
        .setDescription(descricaoResumo)
        .setFooter({ text: `Total: ${totalConquistas} conquistas • Página 1/${Math.ceil(totalConquistas/ITEMS_PER_PAGE)}` })
        .setTimestamp();

      const selectRow = generateSelectMenu(0);
      const buttonRow = generatePaginationButtons(0);

      const reply = await interaction.editReply({
        embeds: [embedResumo],
        components: [selectRow, buttonRow]
      });

      console.log(`✅ Resposta enviada com sucesso!`);

      const filter = i => i.user.id === interaction.user.id;
      const collector = reply.createMessageComponentCollector({ filter, time: 180000 });

      collector.on('collect', async (i) => {
        if (!i.isRepliable()) {
          console.log(`⚠️ [BOTÃO] Interação não pode ser respondida (já expirou)`);
          return;
        }

        if (i.customId.startsWith('video_')) {
          const videoData = videoLinksMap.get(i.customId);
          
          if (!videoData) {
            try {
              await i.deferUpdate();
            } catch (e) {
              console.log(`⚠️ Erro ao fazer deferUpdate: ${e.message}`);
            }
            return;
          }

          try {
            await i.deferUpdate();
            console.log(`✅ [BOTÃO] DeferUpdate executado para "${videoData.conquista}"`);
            
            const videoPromise = buscarVideoYouTube(videoData.jogo, videoData.conquista);
            const timeoutPromise = new Promise((resolve) => {
              setTimeout(() => {
                console.log(`⏰ TIMEOUT: 5 segundos para "${videoData.conquista}"`);
                resolve(null);
              }, 5000);
            });
            
            const videoInfo = await Promise.race([videoPromise, timeoutPromise]);
            
            if (videoInfo) {
              await i.followUp({
                content: `🎬 **Vídeo guia para "${videoData.conquista}":**\n${videoInfo.link}`,
                flags: MessageFlags.Ephemeral
              });
              console.log(`✅ [BOTÃO] Vídeo enviado para "${videoData.conquista}"`);
            } else {
              console.log(`ℹ️ [BOTÃO] Nenhum vídeo encontrado para "${videoData.conquista}" - sem mensagem`);
            }
          } catch (error) {
            console.error(`❌ Erro no botão de vídeo:`, error);
          }
          return;
        }

        if (i.customId === 'conquista_select') {
          try {
            const selectedIndex = parseInt(i.values[0]);
            const ach = conquistasList[selectedIndex];
            const { embed, buttons } = await generateAchievementEmbed(ach, selectedIndex);

            await i.update({
              embeds: [embed],
              components: [buttons]
            });
          } catch (e) {
            console.error(`❌ Erro na seleção:`, e.message);
          }
          return;
        }

        if (i.customId === 'back_to_list_conq') {
          try {
            let descricaoAtualizada = `${mensagemAcesso}\n\n`;
            
            if (conquistasDesbloqueadas === 0 && conquistasUsuario.length === 0) {
              descricaoAtualizada += `**📊 Todas as Conquistas do Jogo**\n\n`;
              descricaoAtualizada += `🔒 **Não desbloqueadas:** ${totalConquistas}/${totalConquistas}\n`;
              descricaoAtualizada += `📊 **Progresso:** 0%\n\n`;
              descricaoAtualizada += `📌 **Legenda:** 🔒 Conquista não desbloqueada\n\n`;
              descricaoAtualizada += `Selecione uma conquista no menu abaixo para ver os detalhes.`;
              descricaoAtualizada += `\n\n💡 **Dica:** Clique em "🎬 Buscar vídeo guia" para encontrar um vídeo da conquista.`;
            } else {
              descricaoAtualizada += `**📊 Suas Conquistas**\n\n`;
              descricaoAtualizada += `✅ **Desbloqueadas:** ${conquistasDesbloqueadas}/${totalConquistas}\n`;
              descricaoAtualizada += `🔒 **Faltantes:** ${conquistasFaltantes}/${totalConquistas}\n`;
              descricaoAtualizada += `📊 **Progresso:** ${Math.round((conquistasDesbloqueadas/totalConquistas)*100)}%\n\n`;
              descricaoAtualizada += `📌 **Legenda:** ✅ Desbloqueada | 🔒 Não desbloqueada\n\n`;
              descricaoAtualizada += `Selecione uma conquista no menu abaixo para ver os detalhes.`;
              descricaoAtualizada += `\n\n💡 **Dica:** Clique em "🎬 Buscar vídeo guia" para encontrar um vídeo da conquista.`;
            }

            const embed = new EmbedBuilder()
              .setColor(0x00AE86)
              .setTitle(`🎮 ${jogoInfo.nome}`)
              .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`)
              .setDescription(descricaoAtualizada)
              .setFooter({ text: `Total: ${totalConquistas} conquistas • Página ${currentPage+1}/${Math.ceil(totalConquistas/ITEMS_PER_PAGE)}` })
              .setTimestamp();

            const selectRow = generateSelectMenu(currentPage);
            const buttonRow = generatePaginationButtons(currentPage);

            await i.update({
              embeds: [embed],
              components: [selectRow, buttonRow]
            });
          } catch (e) {
            console.error(`❌ Erro ao voltar:`, e.message);
          }
          return;
        }

        if (i.customId === 'prev_page_conq' || i.customId === 'next_page_conq') {
          try {
            const totalPages = Math.ceil(totalConquistas / ITEMS_PER_PAGE);
            if (i.customId === 'prev_page_conq' && currentPage > 0) currentPage--;
            if (i.customId === 'next_page_conq' && currentPage < totalPages - 1) currentPage++;

            let descricaoAtualizada = `${mensagemAcesso}\n\n`;
            
            if (conquistasDesbloqueadas === 0 && conquistasUsuario.length === 0) {
              descricaoAtualizada += `**📊 Todas as Conquistas do Jogo**\n\n`;
              descricaoAtualizada += `🔒 **Não desbloqueadas:** ${totalConquistas}/${totalConquistas}\n`;
              descricaoAtualizada += `📊 **Progresso:** 0%\n\n`;
              descricaoAtualizada += `📌 **Legenda:** 🔒 Conquista não desbloqueada\n\n`;
              descricaoAtualizada += `Selecione uma conquista no menu abaixo para ver os detalhes.`;
              descricaoAtualizada += `\n\n💡 **Dica:** Clique em "🎬 Buscar vídeo guia" para encontrar um vídeo da conquista.`;
            } else {
              descricaoAtualizada += `**📊 Suas Conquistas**\n\n`;
              descricaoAtualizada += `✅ **Desbloqueadas:** ${conquistasDesbloqueadas}/${totalConquistas}\n`;
              descricaoAtualizada += `🔒 **Faltantes:** ${conquistasFaltantes}/${totalConquistas}\n`;
              descricaoAtualizada += `📊 **Progresso:** ${Math.round((conquistasDesbloqueadas/totalConquistas)*100)}%\n\n`;
              descricaoAtualizada += `📌 **Legenda:** ✅ Desbloqueada | 🔒 Não desbloqueada\n\n`;
              descricaoAtualizada += `Selecione uma conquista no menu abaixo para ver os detalhes.`;
              descricaoAtualizada += `\n\n💡 **Dica:** Clique em "🎬 Buscar vídeo guia" para encontrar um vídeo da conquista.`;
            }

            const embed = new EmbedBuilder()
              .setColor(0x00AE86)
              .setTitle(`🎮 ${jogoInfo.nome}`)
              .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`)
              .setDescription(descricaoAtualizada)
              .setFooter({ text: `Total: ${totalConquistas} conquistas • Página ${currentPage+1}/${Math.ceil(totalConquistas/ITEMS_PER_PAGE)}` })
              .setTimestamp();

            const selectRow = generateSelectMenu(currentPage);
            const buttonRow = generatePaginationButtons(currentPage);

            await i.update({
              embeds: [embed],
              components: [selectRow, buttonRow]
            });
          } catch (e) {
            console.error(`❌ Erro na navegação:`, e.message);
          }
          return;
        }
      });

      collector.on('end', async () => {
        try {
          await reply.edit({ components: [] }).catch(() => {});
        } catch (_) {}
      });

    } catch (error) {
      console.error(`❌ [COMANDO] Erro crítico:`, error);
      try {
        await interaction.editReply('❌ Ocorreu um erro ao processar o comando. Tente novamente.');
      } catch (_) {}
    }
  }
});

// ============================================================
// 20. FALLBACK PARA BOTÕES
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith('video_')) {
    if (!interaction.isRepliable()) {
      console.log(`⚠️ [FALLBACK] Interação não pode ser respondida`);
      return;
    }
    
    const videoData = videoLinksMap.get(interaction.customId);
    if (!videoData) {
      try {
        await interaction.deferUpdate();
      } catch (e) {}
      return;
    }

    try {
      await interaction.deferUpdate();
      
      const videoPromise = buscarVideoYouTube(videoData.jogo, videoData.conquista);
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(null), 5000);
      });
      
      const videoInfo = await Promise.race([videoPromise, timeoutPromise]);
      
      if (videoInfo) {
        await interaction.followUp({
          content: `🎬 **Vídeo guia para "${videoData.conquista}":**\n${videoInfo.link}`,
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error(`❌ [FALLBACK] Erro:`, error);
    }
  }
});

// ============================================================
// 21. OUTROS COMANDOS
// ============================================================
client.on('messageCreate', async (message) => {
  if (message.author.bot || message.author.id !== DONO_ID) return;
  if (message.content.toLowerCase() !== '!resetranking') return;

  await message.reply('⚠️ Tem certeza? Digite `!confirmar` em 30 segundos.');
  const collector = message.channel.createMessageCollector({
    filter: m => m.author.id === DONO_ID && m.content.toLowerCase() === '!confirmar',
    max: 1,
    time: 30000
  });
  collector.on('collect', async () => {
    for (const sid of STEAM_IDS_ARRAY) {
      if (db.ranking[sid]) db.ranking[sid].jogos = 0;
    }
    db.rankingVersion = RANKING_VERSION;
    await salvarDBNoCanal();
    await enviarRanking();
    await message.reply('✅ Ranking resetado.');
  });
  collector.on('end', collected => {
    if (collected.size === 0) message.reply('⏰ Cancelado.');
  });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'regras') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await enviarRegras();
      await interaction.editReply('✅ Mensagem de regras enviada no canal <#' + RULES_CHANNEL + '>.');
    } catch (err) {
      await interaction.editReply(`❌ Erro ao enviar regras: ${err.message}`);
    }
  }
});

// ============================================================
// 22. HEALTH CHECK PARA RAILWAY
// ============================================================
if (process.env.PORT) {
  try {
    const express = require('express');
    const app = express();
    app.get('/health', (req, res) => {
      res.status(200).json({ 
        status: 'online', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });
    app.listen(process.env.PORT, () => {
      console.log(`🌐 Health check disponível na porta ${process.env.PORT}`);
    });
  } catch (e) {
    console.log('ℹ️ Express não disponível para health check');
  }
}

// ============================================================
// 23. LOGIN
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
