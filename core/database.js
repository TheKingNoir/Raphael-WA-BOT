import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const dbDir = path.join(process.cwd(), 'core', 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, 'database.db');
const db = new Database(dbPath, { fileMustExist: false, timeout: 10000 });
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -65536');
db.pragma('busy_timeout = 5000');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 134217728');

const stmts = {};
function stmt(sql) {
  if (!stmts[sql]) stmts[sql] = db.prepare(sql);
  return stmts[sql];
}

class TtlCache {
  map = new Map();
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > entry.ttl) { this.map.delete(key); return undefined; }
    return entry.data;
  }
  set(key, data, ttl) {
    this.map.set(key, { data, ts: Date.now(), ttl });
  }
  delete(key) { this.map.delete(key); }
  deletePrefix(prefix) {
    for (const k of this.map.keys()) if (k.startsWith(prefix)) this.map.delete(k);
  }
  clear() { this.map.clear(); }
  startGC(intervalMs = 180000) {
    const id = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.map) if (now - v.ts > v.ttl) this.map.delete(k);
    }, intervalMs);
    id.unref();
    return id;
  }
}

const memCache = new TtlCache();
memCache.startGC();
const USER_CACHE_TTL = 900_000;
const CHAT_CACHE_TTL = 900_000;
const CHATUSER_CACHE_TTL = 900_000;
const SET_CACHE_TTL = 600_000;
const CHAR_CACHE_TTL = 900_000;
const STICKERPACK_CACHE_TTL = 900_000;
const dirtyRows = new Map();
const dirtyTables = { chatuser: { table: 'chat_users', keys: ['chat_id', 'user_id'] }, user: { table: 'users', keys: ['id'] }, chat: { table: 'chats', keys: ['id'] }, set: { table: 'settings', keys: ['id'] } };
const FLUSH_INTERVAL = 5_000;

function markDirty(kind, ids, fields) {
  const dirtyKey = `${kind}:${ids.join(':')}`;
  let row = dirtyRows.get(dirtyKey);
  if (!row) { row = { kind, ids, fields: {} }; dirtyRows.set(dirtyKey, row); }
  Object.assign(row.fields, fields);
  return dirtyKey;
}

function writeDirtyRow(row) {
  const info = dirtyTables[row.kind];
  const cols = Object.keys(row.fields);
  if (!cols.length) return;
  const setClause = cols.map(f => `${f} = ?`).join(', ');
  const vals = cols.map(f => row.fields[f]);
  const whereClause = info.keys.map(k => `${k} = ?`).join(' AND ');
  stmt(`UPDATE ${info.table} SET ${setClause} WHERE ${whereClause}`).run(...vals, ...row.ids);
}

function flushDirty(dirtyKey) {
  if (dirtyKey) {
    const row = dirtyRows.get(dirtyKey);
    if (!row) return;
    dirtyRows.delete(dirtyKey);
    try { writeDirtyRow(row); } catch (e) { console.error('[flushDirty]', e); }
    return;
  }
  if (dirtyRows.size === 0) return;
  const rows = [...dirtyRows.values()];
  dirtyRows.clear();
  const runAll = db.transaction((batch) => { for (const row of batch) writeDirtyRow(row); });
  try { runAll(rows); } catch (e) { console.error('[flushDirty]', e); }
}

function flushDirtyKind(kind) {
  const rows = [];
  for (const [dirtyKey, row] of dirtyRows) {
    if (row.kind !== kind) continue;
    rows.push(row);
    dirtyRows.delete(dirtyKey);
  }
  if (!rows.length) return;
  const runAll = db.transaction((batch) => { for (const row of batch) writeDirtyRow(row); });
  try { runAll(rows); } catch (e) { console.error('[flushDirtyKind]', e); }
}

const flushInterval = setInterval(() => flushDirty(), FLUSH_INTERVAL);
if (typeof flushInterval?.unref === 'function') flushInterval.unref();
for (const ev of ['beforeExit', 'SIGINT', 'SIGTERM']) {
  process.on(ev, () => { try { flushDirty(); } catch {} });
}

function toStore(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return JSON.stringify(val);
  if (typeof val === 'boolean') return val ? 1 : 0;
  return val;
}

function parseJSON(val, fallback) {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

export const defUser = {
  name: '',
  exp: 0,
  level: 0,
  usedcommands: 0,
  pasatiempo: '',
  description: '',
  marry: '',
  genre: '',
  birth: '',
  metadatos: null,
  metadatos2: null,
  minxp: 0,
  maxxp: 0,
  monthlyStreak: 0,
  lastMonthlyGlobal: 0,
  streak: 0,
  lastDailyGlobal: 0,
  weeklyStreak: 0,
  lastWeeklyGlobal: 0,
  jointime: 0,
  pendingInvites: '{}',
  reportCooldown: 0,
  sugCooldown: 0,
  pendingTickets: '{}',
  favorite: '',
  lastVote: 0,
  claimMessage: ''
};

export const defChat = {
  isBanned: 0,
  welcome: 0,
  goodbye: 0,
  sWelcome: '',
  sGoodbye: '',
  nsfw: 0,
  alerts: 1,
  gacha: 1,
  economy: 1,
  adminonly: 0,
  antilinks: 1,
  antistatus: 0,
  rolls: '{}',
  expulsar: 0,
  warnLimit: 3,
  sales: '{}',
  regalosPendientes: '[]',
  intercambios: '[]',
  timeTrade: 0
};

export const defChatUser = {
  coins: 0,
  bank: 0,
  lastCmd: 0,
  usedTime: null,
  afk: -1,
  afkReason: '',
  health: 100,
  stamina: 100,
  magic: 100,
  characters: '[]',
  stats: '{}',
  warnings: '[]',
  lastcrime: 0,
  lastmine: 0,
  lastinvoke: 0,
  lastwork: 0,
  lastslut: 0,
  laststeal: 0,
  lasthunt: 0,
  lastfish: 0,
  lastcoffer: 0,
  lastdungeon: 0,
  lastadventure: 0,
  lastdaily: 0,
  lastweekly: 0,
  lastmonthly: 0,
  inventory: '{}',
  weapons: '{}',
  tools: '{}',
  lastttt: 0,
  lastcoinflip: 0,
  lastppt: 0,
  lastahorcado: 0,
  lastmath: 0,
  lastApuesta: 0,
  lastslot: 0,
  lastroulette: 0,
  lastriddle: 0,
  lastmovie: 0,
  lasttrivia: 0,
  lastflag: 0,
  favorite: '',
  lastrobwaifu: 0,
  robVictims: '{}',
  lastRoll: 0,
  lastClaim: 0
};

export const defSets = {
  self: 0,
  prefix: '[\"/\",\"!\",\".\",\"#\"]',
  newsletter_id: '120363407498961861@newsletter',
  nameid: '𝗞𝗢𝗠𝗢𝗗𝗢 🐊 𝗣𝗥𝗢𝗝𝗘𝗖𝗧 💻',
  type: 'Owner',
  link: 'https://komodo-host.site',
  banner: 'https://files.yuki-wabot.my.id/cdn/4s1mgQQb.jpeg',
  currency: 'Yenes',
  namebot: 'Raphael',
  botname: 'Raphael',
  owner: ''
};

export const defStickerPack = {
  packs: '[]'
};

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT DEFAULT '',
      exp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      usedcommands INTEGER DEFAULT 0,
      pasatiempo TEXT DEFAULT '',
      description TEXT DEFAULT '',
      marry TEXT DEFAULT '',
      genre TEXT DEFAULT '',
      birth TEXT DEFAULT '',
      metadatos TEXT,
      metadatos2 TEXT,
      minxp INTEGER DEFAULT 0,
      maxxp INTEGER DEFAULT 0,
      monthlyStreak INTEGER DEFAULT 0,
      lastMonthlyGlobal INTEGER DEFAULT 0,
      streak INTEGER DEFAULT 0,
      lastDailyGlobal INTEGER DEFAULT 0,
      weeklyStreak INTEGER DEFAULT 0,
      lastWeeklyGlobal INTEGER DEFAULT 0,
      jointime INTEGER DEFAULT 0,
      pendingInvites TEXT DEFAULT '{}',
      reportCooldown INTEGER DEFAULT 0,
      sugCooldown INTEGER DEFAULT 0,
      pendingTickets TEXT DEFAULT '{}',
      favorite TEXT DEFAULT '',
      lastVote INTEGER DEFAULT 0,
      claimMessage TEXT DEFAULT ''
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      isBanned BOOLEAN DEFAULT 0,
      welcome BOOLEAN DEFAULT 0,
      goodbye BOOLEAN DEFAULT 0,
      sWelcome TEXT DEFAULT '',
      sGoodbye TEXT DEFAULT '',
      nsfw BOOLEAN DEFAULT 0,
      alerts BOOLEAN DEFAULT 1,
      gacha BOOLEAN DEFAULT 1,
      economy BOOLEAN DEFAULT 1,
      adminonly BOOLEAN DEFAULT 0,
      antilinks BOOLEAN DEFAULT 1,
      antistatus BOOLEAN DEFAULT 0,
      rolls TEXT DEFAULT '{}',
      expulsar BOOLEAN DEFAULT 0,
      warnLimit INTEGER DEFAULT 3,
      sales TEXT DEFAULT '{}',
      regalosPendientes TEXT DEFAULT '[]',
      intercambios TEXT DEFAULT '[]',
      timeTrade INTEGER DEFAULT 0
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_users (
      chat_id TEXT,
      user_id TEXT,
      coins INTEGER DEFAULT 0,
      bank INTEGER DEFAULT 0,
      lastCmd INTEGER DEFAULT 0,
      usedTime TEXT,
      afk INTEGER DEFAULT -1,
      afkReason TEXT DEFAULT '',
      health INTEGER DEFAULT 100,
      stamina INTEGER DEFAULT 100,
      magic INTEGER DEFAULT 100,
      characters TEXT DEFAULT '[]',
      stats TEXT DEFAULT '{}',
      warnings TEXT DEFAULT '[]',
      lastcrime INTEGER DEFAULT 0,
      lastmine INTEGER DEFAULT 0,
      lastinvoke INTEGER DEFAULT 0,
      lastwork INTEGER DEFAULT 0,
      lastslut INTEGER DEFAULT 0,
      laststeal INTEGER DEFAULT 0,
      lasthunt INTEGER DEFAULT 0,
      lastfish INTEGER DEFAULT 0,
      lastcoffer INTEGER DEFAULT 0,
      lastdungeon INTEGER DEFAULT 0,
      lastadventure INTEGER DEFAULT 0,
      lastdaily INTEGER DEFAULT 0,
      lastweekly INTEGER DEFAULT 0,
      lastmonthly INTEGER DEFAULT 0,
      inventory TEXT DEFAULT '{}',
      weapons TEXT DEFAULT '{}',
      tools TEXT DEFAULT '{}',
      lastttt INTEGER DEFAULT 0,
      lastcoinflip INTEGER DEFAULT 0,
      lastppt INTEGER DEFAULT 0,
      lastahorcado INTEGER DEFAULT 0,
      lastmath INTEGER DEFAULT 0,
      lastApuesta INTEGER DEFAULT 0,
      lastslot INTEGER DEFAULT 0,
      lastroulette INTEGER DEFAULT 0,
      lastriddle INTEGER DEFAULT 0,
      lastmovie INTEGER DEFAULT 0,
      lasttrivia INTEGER DEFAULT 0,
      lastflag INTEGER DEFAULT 0,
      favorite TEXT DEFAULT '',
      lastrobwaifu INTEGER DEFAULT 0,
      robVictims TEXT DEFAULT '{}',
      lastRoll INTEGER DEFAULT 0,
      lastClaim INTEGER DEFAULT 0,
      PRIMARY KEY (chat_id, user_id)
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      self BOOLEAN DEFAULT 0,
      prefix TEXT DEFAULT '[\"/\",\"!\",\".\",\"#\"]',
      newsletter_id TEXT DEFAULT '120363407498961861@newsletter',
      nameid TEXT DEFAULT '𝗞𝗢𝗠𝗢𝗗𝗢 🐊 𝗣𝗥𝗢𝗝𝗘𝗖𝗧 💻',
      type TEXT DEFAULT 'Owner',
      link TEXT DEFAULT 'https://komodo-host.site',
      banner TEXT DEFAULT 'https://files.yuki-wabot.my.id/cdn/4s1mgQQb.jpeg',
      currency TEXT DEFAULT 'Yenes',
      namebot TEXT DEFAULT 'Raphael',
      botname TEXT DEFAULT 'Raphael',
      owner TEXT DEFAULT ''
    )`);
  db.exec(`CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, data TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS sticker_packs (id TEXT PRIMARY KEY, packs TEXT DEFAULT '[]')`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_users_user ON chat_users(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_users_lastCmd ON chat_users(lastCmd)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_exp ON users(exp DESC)`);
}

function getCacheKey(type, id) {
  return `${type}:${id}`;
}

export function getUser(id, opt = {}) {
  if (!id) {
    const { orderBy, limit = null, desc = true } = opt;
    if (orderBy) {
      const allowedCols = ['exp', 'level', 'usedcommands', 'name'];
      if (!allowedCols.includes(orderBy)) throw new Error('Columna no permitida');
      let q = `SELECT * FROM users ORDER BY ${orderBy} ${desc ? 'DESC' : 'ASC'}`;
      if (limit) q += ` LIMIT ${limit}`;
      return stmt(q).all();
    }
    return stmt('SELECT * FROM users').all();
  }
  const key = getCacheKey('user', id);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  let user = stmt('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    stmt(`INSERT OR IGNORE INTO users (id, name, exp, level, usedcommands, pasatiempo, description, marry, genre, birth, metadatos, metadatos2, minxp, maxxp, monthlyStreak, lastMonthlyGlobal, streak, lastDailyGlobal, weeklyStreak, lastWeeklyGlobal, jointime, pendingInvites, reportCooldown, sugCooldown, pendingTickets, favorite, lastVote, claimMessage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, defUser.name, defUser.exp, defUser.level, defUser.usedcommands, defUser.pasatiempo, defUser.description, defUser.marry, defUser.genre, defUser.birth, defUser.metadatos, defUser.metadatos2, defUser.minxp, defUser.maxxp, defUser.monthlyStreak, defUser.lastMonthlyGlobal, defUser.streak, defUser.lastDailyGlobal, defUser.weeklyStreak, defUser.lastWeeklyGlobal, defUser.jointime, defUser.pendingInvites, defUser.reportCooldown, defUser.sugCooldown, defUser.pendingTickets, defUser.favorite, defUser.lastVote, defUser.claimMessage);
    user = stmt('SELECT * FROM users WHERE id = ?').get(id);
  }
  if (user.metadatos) { try { user.metadatos = JSON.parse(user.metadatos); } catch {} }
  if (user.metadatos2) { try { user.metadatos2 = JSON.parse(user.metadatos2); } catch {} }
  user.pendingInvites = parseJSON(user.pendingInvites, {});
  user.pendingTickets = parseJSON(user.pendingTickets, {});
  memCache.set(key, user, USER_CACHE_TTL);
  return user;
}

export function setUser(id, field, val) {
  const key = getCacheKey('user', id);
  const cached = memCache.get(key);
  if (!cached) {
    const user = stmt('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) return;
  }
  if (field !== null && typeof field === 'object') {
    const entries = Object.entries(field);
    if (!entries.length) return;
    const fields = {};
    for (const [f, v] of entries) fields[f] = toStore(v);
    markDirty('user', [id], fields);
    if (cached) {
      for (const [f, v] of entries) cached[f] = v === undefined ? null : v;
      memCache.set(key, cached, USER_CACHE_TTL);
    }
    return;
  }
  markDirty('user', [id], { [field]: toStore(val) });
  if (cached) {
    cached[field] = val === undefined ? null : val;
    memCache.set(key, cached, USER_CACHE_TTL);
  }
}

export function getChat(id) {
  if (!id) return stmt('SELECT * FROM chats').all();
  const key = getCacheKey('chat', id);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  let chat = stmt('SELECT * FROM chats WHERE id = ?').get(id);
  if (!chat) {
    stmt(`INSERT OR IGNORE INTO chats (id, isBanned, welcome, goodbye, sWelcome, sGoodbye, nsfw, alerts, gacha, economy, adminonly, antilinks, antistatus, rolls, expulsar, warnLimit, sales, regalosPendientes, intercambios, timeTrade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, defChat.isBanned, defChat.welcome, defChat.goodbye, defChat.sWelcome, defChat.sGoodbye, defChat.nsfw, defChat.alerts, defChat.gacha, defChat.economy, defChat.adminonly, defChat.antilinks, defChat.antistatus, defChat.rolls, defChat.expulsar, defChat.warnLimit, defChat.sales, defChat.regalosPendientes, defChat.intercambios, defChat.timeTrade);
    chat = stmt('SELECT * FROM chats WHERE id = ?').get(id);
  }
  chat.rolls = parseJSON(chat.rolls, {});
  chat.sales = parseJSON(chat.sales, {});
  chat.regalosPendientes = parseJSON(chat.regalosPendientes, []);
  chat.intercambios = parseJSON(chat.intercambios, []);
  memCache.set(key, chat, CHAT_CACHE_TTL);
  return chat;
}

export function setChat(id, field, val) {
  const key = getCacheKey('chat', id);
  const cached = memCache.get(key);
  if (!cached) {
    const chat = stmt('SELECT id FROM chats WHERE id = ?').get(id);
    if (!chat) return;
  }
  if (cached) {
    cached[field] = val === undefined ? null : val;
    memCache.set(key, cached, CHAT_CACHE_TTL);
  }
  markDirty('chat', [id], { [field]: toStore(val) });
}

export function getChatUser(chatId, userId, opt = {}) {
  if (!chatId) {
    const users = stmt('SELECT * FROM chat_users').all();
    return users.map(u => {
      u.characters = parseJSON(u.characters, []);
      u.stats = parseJSON(u.stats, {});
      return u;
    });
  }
  if (chatId && !userId) {
    const { orderBy, limit = null, desc = true } = opt;
    let query = 'SELECT * FROM chat_users WHERE chat_id = ?';
    let params = [chatId];
    if (orderBy) {
      const allowedCols = ['coins', 'bank', 'lastCmd', 'usedTime', 'afk', 'health', 'stamina', 'magic'];
      if (!allowedCols.includes(orderBy)) throw new Error('Columna no permitida');
      query += ` ORDER BY ${orderBy} ${desc ? 'DESC' : 'ASC'}`;
    }
    if (limit) { query += ' LIMIT ?'; params.push(limit); }
    return stmt(query).all(...params).map(u => {
      u.characters = parseJSON(u.characters, []);
      u.stats = parseJSON(u.stats, {});
      u.warnings = parseJSON(u.warnings, []);
      u.inventory = parseJSON(u.inventory, {});
      u.weapons = parseJSON(u.weapons, {});
      u.tools = parseJSON(u.tools, {});
      u.robVictims = parseJSON(u.robVictims, {});
      return u;
    });
  }
  const key = getCacheKey('chatuser', `${chatId}:${userId}`);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  let cu = stmt('SELECT * FROM chat_users WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
  if (!cu) {
    stmt(`INSERT OR IGNORE INTO chat_users (chat_id, user_id, coins, bank, lastCmd, usedTime, afk, afkReason, health, stamina, magic, characters, stats, warnings, lastcrime, lastmine, lastinvoke, lastwork, lastslut, laststeal, lasthunt, lastfish, lastcoffer, lastdungeon, lastadventure, lastdaily, lastweekly, lastmonthly, inventory, weapons, tools, lastttt, lastcoinflip, lastppt, lastahorcado, lastmath, lastApuesta, lastslot, lastroulette, lastriddle, lastmovie, lasttrivia, lastflag, favorite, lastrobwaifu, robVictims, lastRoll, lastClaim) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(chatId, userId, defChatUser.coins, defChatUser.bank, defChatUser.lastCmd, defChatUser.usedTime, defChatUser.afk, defChatUser.afkReason, defChatUser.health, defChatUser.stamina, defChatUser.magic, defChatUser.characters, defChatUser.stats, defChatUser.warnings, defChatUser.lastcrime, defChatUser.lastmine, defChatUser.lastinvoke, defChatUser.lastwork, defChatUser.lastslut, defChatUser.laststeal, defChatUser.lasthunt, defChatUser.lastfish, defChatUser.lastcoffer, defChatUser.lastdungeon, defChatUser.lastadventure, defChatUser.lastdaily, defChatUser.lastweekly, defChatUser.lastmonthly, defChatUser.inventory, defChatUser.weapons, defChatUser.tools, defChatUser.lastttt, defChatUser.lastcoinflip, defChatUser.lastppt, defChatUser.lastahorcado, defChatUser.lastmath, defChatUser.lastApuesta, defChatUser.lastslot, defChatUser.lastroulette, defChatUser.lastriddle, defChatUser.lastmovie, defChatUser.lasttrivia, defChatUser.lastflag, defChatUser.favorite, defChatUser.lastrobwaifu, defChatUser.robVictims, defChatUser.lastRoll, defChatUser.lastClaim);
    cu = stmt('SELECT * FROM chat_users WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
  }
  if (cu) {
    cu.characters = parseJSON(cu.characters, []);
    cu.stats = parseJSON(cu.stats, {});
    cu.warnings = parseJSON(cu.warnings, []);
    cu.inventory = parseJSON(cu.inventory, {});
    cu.weapons = parseJSON(cu.weapons, {});
    cu.tools = parseJSON(cu.tools, {});
    cu.robVictims = parseJSON(cu.robVictims, {});
    memCache.set(key, cu, CHATUSER_CACHE_TTL);
  }
  return cu;
}

export function setChatUser(chatId, userId, field, val) {
  const key = getCacheKey('chatuser', `${chatId}:${userId}`);
  if (field !== null && typeof field === 'object') {
    const entries = Object.entries(field);
    if (!entries.length) return;
    const cached = memCache.get(key);
    if (cached) {
      for (const [f, v] of entries) cached[f] = v === undefined ? null : v;
      memCache.set(key, cached, CHATUSER_CACHE_TTL);
    }
    const fields = {};
    for (const [f, v] of entries) fields[f] = toStore(v);
    markDirty('chatuser', [chatId, userId], fields);
    return;
  }
  const cached = memCache.get(key);
  if (cached) {
    cached[field] = val === undefined ? null : val;
    memCache.set(key, cached, CHATUSER_CACHE_TTL);
  }
  markDirty('chatuser', [chatId, userId], { [field]: toStore(val) });
}

export function getSettings(id) {
  if (!id) {
    return stmt('SELECT * FROM settings').all().map(row => {
      row.prefix = parseJSON(row.prefix, []);
      return row;
    });
  }
  const key = getCacheKey('set', id);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  let row = stmt('SELECT * FROM settings WHERE id = ?').get(id);
  if (!row) {
    stmt(`INSERT OR IGNORE INTO settings (id, self, prefix, newsletter_id, nameid, type, link, banner, currency, namebot, botname, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, defSets.self, defSets.prefix, defSets.newsletter_id, defSets.nameid, defSets.type, defSets.link, defSets.banner, defSets.currency, defSets.namebot, defSets.botname, defSets.owner);
    row = stmt('SELECT * FROM settings WHERE id = ?').get(id);
  }
  if (row.prefix != null) {
    try { row.prefix = JSON.parse(row.prefix); }
    catch { row.prefix = row.prefix === 'true' || row.prefix === '1' ? true : []; }
  }
  memCache.set(key, row, SET_CACHE_TTL);
  return row;
}

export function setSettings(id, field, val) {
  const key = getCacheKey('set', id);
  const cached = memCache.get(key);
  if (!cached) {
    const setting = stmt('SELECT id FROM settings WHERE id = ?').get(id);
    if (!setting) return;
  }
  if (field !== null && typeof field === 'object') {
    const entries = Object.entries(field);
    if (!entries.length) return;
    const fields = {};
    for (const [f, v] of entries) {
      fields[f] = v === true ? "1" : (Array.isArray(v) || (typeof v === 'object' && v !== null)) ? JSON.stringify(v) : v;
    }
    markDirty('set', [id], fields);
    if (cached) {
      for (const [f, v] of entries) cached[f] = v === undefined ? null : v;
      memCache.set(key, cached, SET_CACHE_TTL);
    }
    return;
  }
  let stored = val;
  if (val === true) stored = "1";
  else if (Array.isArray(val) || typeof val === 'object') stored = JSON.stringify(val);
  markDirty('set', [id], { [field]: stored });
  if (cached) {
    cached[field] = val === undefined ? null : val;
    memCache.set(key, cached, SET_CACHE_TTL);
  }
}

export function getCharacter(id) {
  const key = getCacheKey('char', id || 'all');
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  if (!id) {
    const rows = stmt('SELECT id, data FROM characters').all();
    const characters = {};
    for (const row of rows) { characters[row.id] = parseJSON(row.data, row.data); }
    memCache.set(key, characters, CHAR_CACHE_TTL);
    return characters;
  }
  const row = stmt('SELECT data FROM characters WHERE id = ?').get(id);
  if (!row) return null;
  const data = parseJSON(row.data, row.data);
  memCache.set(key, data, CHAR_CACHE_TTL);
  return data;
}

export function setCharacter(id, data) {
  memCache.delete(getCacheKey('char', id));
  stmt('REPLACE INTO characters (id, data) VALUES (?, ?)').run(id, toStore(data));
  return true;
}

export function getStickersPack(id) {
  if (!id) return stmt('SELECT * FROM sticker_packs').all();
  const key = getCacheKey('stickerpack', id);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  let stickerPack = stmt('SELECT * FROM sticker_packs WHERE id = ?').get(id);
  if (!stickerPack) {
    stmt(`INSERT OR IGNORE INTO sticker_packs (id, packs) VALUES (?, ?)`).run(id, defStickerPack.packs);
    stickerPack = stmt('SELECT * FROM sticker_packs WHERE id = ?').get(id);
  }
  stickerPack.packs = parseJSON(stickerPack.packs, []);
  memCache.set(key, stickerPack, STICKERPACK_CACHE_TTL);
  return stickerPack;
}

export function setStickersPack(id, field, val) {
  const stickerPack = stmt('SELECT id FROM sticker_packs WHERE id = ?').get(id);
  if (!stickerPack) return;
  memCache.delete(getCacheKey('stickerpack', id));
  return stmt(`UPDATE sticker_packs SET ${field} = ? WHERE id = ?`).run(toStore(val), id);
}

export function deletedb(type, ...ids) {
  if (!type || !ids || ids.length === 0) return false;
  switch(type) {
    case 'user': memCache.delete(getCacheKey('user', ids[0])); dirtyRows.delete(`user:${ids[0]}`); return stmt('DELETE FROM users WHERE id = ?').run(ids[0]).changes > 0;
    case 'chat': memCache.delete(getCacheKey('chat', ids[0])); dirtyRows.delete(`chat:${ids[0]}`); return stmt('DELETE FROM chats WHERE id = ?').run(ids[0]).changes > 0;
    case 'chatuser':
      if (ids.length < 2) return false;
      memCache.delete(getCacheKey('chatuser', `${ids[0]}:${ids[1]}`));
      dirtyRows.delete(`chatuser:${ids[0]}:${ids[1]}`);
      return stmt('DELETE FROM chat_users WHERE chat_id = ? AND user_id = ?').run(ids[0], ids[1]).changes > 0;
    case 'settings': memCache.delete(getCacheKey('set', ids[0])); dirtyRows.delete(`set:${ids[0]}`); return stmt('DELETE FROM settings WHERE id = ?').run(ids[0]).changes > 0;
    case 'character': memCache.delete(getCacheKey('char', ids[0])); return stmt('DELETE FROM characters WHERE id = ?').run(ids[0]).changes > 0;
    case 'stickerpack': memCache.delete(getCacheKey('stickerpack', ids[0])); return stmt('DELETE FROM sticker_packs WHERE id = ?').run(ids[0]).changes > 0;
    default: return false;
  }
}

const knownColumns = new Set();
export function setCreate(table, identifier, field, value) {
  const tableConfig = {
    users: { primaryKeys: ['id'], identifierFields: ['id'], jsonFields: ['metadatos', 'metadatos2'] },
    chats: { primaryKeys: ['id'], identifierFields: ['id'], jsonFields: ['rolls'] },
    chat_users: { primaryKeys: ['chat_id', 'user_id'], identifierFields: ['chat_id', 'user_id'], jsonFields: ['characters', 'stats'] },
    settings: { primaryKeys: ['id'], identifierFields: ['id'], jsonFields: ['prefix'] },
    characters: { primaryKeys: ['id'], identifierFields: ['id'], jsonFields: [], isSimpleTable: true },
    sticker_packs: { primaryKeys: ['id'], identifierFields: ['id'], jsonFields: ['packs'] }
  };
  const config = tableConfig[table];
  if (!config) throw new Error(`Tabla '${table}' no soportada`);
  if (config.isSimpleTable) {
    const primaryKey = identifier;
    let existingData = getCharacter(primaryKey);
    if (!existingData) {
      const newData = { [field]: value };
      setCharacter(primaryKey, newData);
      return value;
    }
    if (existingData[field] === undefined) {
      const updatedData = { ...existingData, [field]: value };
      setCharacter(primaryKey, updatedData);
      return value;
    }
    return existingData[field];
  }
  const columnExists = (tableName, columnName) => {
    const cacheKey = `${tableName}:${columnName}`;
    if (knownColumns.has(cacheKey)) return true;
    try {
      const columns = stmt(`PRAGMA table_info(${tableName})`).all();
      const exists = columns.some(col => col.name === columnName);
      if (exists) knownColumns.add(cacheKey);
      return exists;
    } catch { return false; }
  };
  if (!columnExists(table, field)) {
    const getSQLType = (val) => typeof val === 'number' ? 'INTEGER' : typeof val === 'boolean' ? 'BOOLEAN' : 'TEXT';
    const sqlType = getSQLType(value);
    let defaultValue = 'NULL';
    if (typeof value === 'number') defaultValue = '0';
    else if (typeof value === 'boolean') defaultValue = '0';
    else if (Array.isArray(value)) defaultValue = "'[]'";
    else if (typeof value === 'object' && value !== null) defaultValue = "'{}'";
    else defaultValue = "''";
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${field} ${sqlType} DEFAULT ${defaultValue}`);
    knownColumns.add(`${table}:${field}`);
  }
  if (table === 'chat_users') {
    if (!Array.isArray(identifier) || identifier.length < 2) throw new Error('chat_users requiere [chatId, userId]');
    const [chatId, userId] = identifier;
    let record = getChatUser(chatId, userId);
    if (!record) {
      stmt(`INSERT OR IGNORE INTO chat_users (chat_id, user_id, ${field}) VALUES (?, ?, ?)`).run(chatId, userId, value);
      clearCache('chatuser', `${chatId}:${userId}`);
      return value;
    }
    if (record[field] === undefined) { setChatUser(chatId, userId, field, value); return value; }
    return record[field];
  } else if (table === 'users') {
    let record = getUser(identifier);
    if (!record) {
      stmt(`INSERT OR IGNORE INTO users (id, ${field}) VALUES (?, ?)`).run(identifier, value);
      clearCache('user', identifier);
      return value;
    }
    if (record[field] === undefined) { setUser(identifier, field, value); return value; }
    return record[field];
  } else if (table === 'chats') {
    let record = getChat(identifier);
    if (!record) {
      stmt(`INSERT OR IGNORE INTO chats (id, ${field}) VALUES (?, ?)`).run(identifier, value);
      clearCache('chat', identifier);
      return value;
    }
    if (record[field] === undefined) { setChat(identifier, field, value); return value; }
    return record[field];
  } else if (table === 'settings') {
    let record = getSettings(identifier);
    if (!record) {
      stmt(`INSERT OR IGNORE INTO settings (id, ${field}) VALUES (?, ?)`).run(identifier, value);
      clearCache('set', identifier);
      return value;
    }
    if (record[field] === undefined) { setSettings(identifier, field, value); return value; }
    return record[field];
  } else if (table === 'sticker_packs') {
    let record = getStickersPack(identifier);
    if (!record) {
      stmt(`INSERT OR IGNORE INTO sticker_packs (id, ${field}) VALUES (?, ?)`).run(identifier, value);
      clearCache('stickerpack', identifier);
      return value;
    }
    if (record[field] === undefined) { setStickersPack(identifier, field, value); return value; }
    return record[field];
  }
  return value;
}

export function clearCache(type, id) {
  if (type === undefined && id === undefined) { flushDirty(); memCache.clear(); return true; }
  if (id) {
    flushDirty(`${type}:${id}`);
    memCache.delete(getCacheKey(type, id));
  } else {
    flushDirtyKind(type);
    memCache.deletePrefix(`${type}:`);
  }
}

try {
  const tables = [{ name: 'users', def: defUser, exclude: ['id'] }, { name: 'chats', def: defChat, exclude: ['id'] }, { name: 'chat_users', def: defChatUser, exclude: ['chat_id', 'user_id'] }, { name: 'settings', def: defSets, exclude: ['id'] }, { name: 'sticker_packs', def: defStickerPack, exclude: ['id'] }];
  for (const table of tables) {
    if (!stmt(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table.name)) continue;
    const existingCols = stmt(`PRAGMA table_info(${table.name})`).all();
    const existingNames = existingCols.map(c => c.name);
    const expectedCols = Object.keys(table.def);
    const missingCols = expectedCols.filter(col => !existingNames.includes(col) && !table.exclude.includes(col));
    for (const col of missingCols) {
      let defaultValue = table.def[col];
      let sqlType = 'TEXT';
      if (typeof defaultValue === 'number') sqlType = 'INTEGER';
      else if (typeof defaultValue === 'boolean') sqlType = 'BOOLEAN';
      else if (defaultValue === null) sqlType = 'TEXT';
      const defaultStr = defaultValue === null ? 'NULL' : JSON.stringify(defaultValue);
      db.exec(`ALTER TABLE ${table.name} ADD COLUMN ${col} ${sqlType} DEFAULT ${defaultStr}`);
    }
  }
} catch (e) { console.error('[DB migration error]', e); }

export function clearDB() {
  if (!global.cleardb) {
    global.cleardb = true;
    const INACTIVE_MS = 20 * 86400000;
    const runCleanup = db.transaction(() => {
      flushDirtyKind('chatuser');
      flushDirtyKind('user');
      const cutoff = Date.now() - INACTIVE_MS;
      stmt('DELETE FROM chat_users WHERE lastCmd = 0 OR lastCmd < ?').run(cutoff);
      stmt('DELETE FROM users WHERE exp = 0 AND id NOT IN (SELECT user_id FROM chat_users)').run();
      memCache.deletePrefix('chatuser:');
      memCache.deletePrefix('user:');
    });
    const id = setInterval(() => {
      try {
        runCleanup();
        db.pragma('wal_checkpoint(PASSIVE)');
      } catch (e) { console.error('[clearDB]', e); }
    }, 86400000);
    if (typeof id?.unref === 'function') id.unref();
  }
}

export default { initDB, getUser, setUser, getChat, setChat, getChatUser, setChatUser, getSettings, setSettings, getCharacter, setCharacter, getStickersPack, setStickersPack, deletedb, setCreate, clearCache, clearDB, db };