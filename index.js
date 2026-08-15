import "./settings.js";
import main from '#main';
import events from '#events';
import makeWASocket, { Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, jidDecode, DisconnectReason, isJidBroadcast, isJidStatusBroadcast, isJidNewsletter, useSqliteAuthState } from 'baileys';
import pino from "pino";
import qrcode from "qrcode-terminal";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import readlineSync from "readline-sync";
import { smsg, getCachedMeta, setCachedMeta, deleteCachedMeta, createMessageCache, patchGroupMetadata, getRawMeta } from "#serialize";
import cmdsLoader from '#core/cmdsLoader';
import db from "#db";
import NodeCache from "node-cache";
import { Boom } from "@hapi/boom";

console.log(chalk.blue.bold('\n  [ ✰ ]  I N I C I A N D O  .  .  .'));
console.log(chalk.cyan("          Raphael | Wa Bot\n   Hecho Por Ares Arcane"));
const fmtLogArg = (a) => (a instanceof Error ? (a.stack || a.message) : a);
const log = {
  info: (...args) => console.log(chalk.bgBlue.white.bold(`[ ℹ ]︎ INFO`), chalk.white(args.map(fmtLogArg).join(' '))),
  success: (...args) => console.log(chalk.bgGreen.white.bold(`( ✔ SUCCESS )`), chalk.greenBright(args.map(fmtLogArg).join(' '))),
  ready: (...args) => console.log(chalk.bgMagenta.blueBright.bold(`( ❏ READY )`), chalk.gray(args.map(fmtLogArg).join(' '))),
  warn: (...args) => console.log(chalk.bgYellowBright.blueBright.bold(`( ⚠ WARNING )`), chalk.yellow(args.map(fmtLogArg).join(' '))),
  error: (...args) => console.log(chalk.bgRed.white.bold(`( ✘ ERROR )`), chalk.redBright(args.map(fmtLogArg).join(' ')))
};

let phoneNumber = "";
let phoneInput = "";
const methodCodeQR = process.argv.includes("--qr");
const methodCode = process.argv.includes("code");
if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp', { recursive: true });
function normalizePhone(input) {
  let s = String(input).replace(/\D/g, '');
  if (!s) return '';
  if (s.startsWith('0')) s = s.replace(/^0+/, '');
  if (s.length === 10 && s.startsWith('3')) s = '57' + s;
  if (s.startsWith('52') && !s.startsWith('521') && s.length >= 12) s = '521' + s.slice(2);
  if (s.startsWith('54') && !s.startsWith('549') && s.length >= 11) s = '549' + s.slice(2);
  return s;
}

async function initDB() {
  db.initDB();
  db.clearDB();
  global.db = db;
  log.ready('[ ✰ ]  Base de datos cargada correctamente.');
}

function cleanCache() {
  try {
    if (!fs.existsSync('./tmp')) return;
    const now = Date.now();
    const files = fs.readdirSync('./tmp');
    let cleaned = 0;
    for (const file of files) {
      const filePath = path.join('./tmp', file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > 10 * 60000) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch {}
    }
    if (cleaned > 0) log.ready(`[ ⚠ ] Cache tmp: ${cleaned} archivos eliminados`);
  } catch (e) {
    console.error(chalk.red('Error en cleanCache: '), e);
  }
}

let authClose = null;
function clearSession() {
  try {
    const sessionDir = './Sessions/Owner';
    if (authClose) { try { authClose(); } catch {} authClose = null; }
    if (!fs.existsSync(sessionDir)) return;
    for (const file of fs.readdirSync(sessionDir)) {
      try { fs.unlinkSync(path.join(sessionDir, file)); } catch {}
    }
    log.warn('Sesión del principal eliminada, debes volver a vincular...');
  } catch (e) {
    log.error(`clearSession → ${e?.message || e}`);
  }
}

let opcion;
if (methodCodeQR) {
  opcion = "1";
} else if (methodCode) {
  opcion = "2";
  if (!phoneNumber) {
    console.log(chalk.bold.redBright(`\nPor favor, Ingrese el número de WhatsApp.\n${chalk.bold.yellowBright("Ejemplo: +57301******")}\n${chalk.bold.magentaBright('---> ')}`));
    phoneInput  = readlineSync.question("");
    phoneNumber = normalizePhone(phoneInput);
  }
} else if (!fs.existsSync("./Sessions/Owner")) {
  opcion = readlineSync.question(chalk.bold.white("\nSeleccione una opción:\n") + chalk.blueBright("1. Con código QR\n") + chalk.cyan("2. Con código de texto de 8 dígitos\n--> "));
  while (!/^[1-2]$/.test(opcion)) {
    console.log(chalk.bold.redBright(`No se permiten numeros que no sean 1 o 2, tampoco letras o símbolos especiales.`));
    opcion = readlineSync.question("--> ");
  }
  if (opcion === "2") {
    console.log(chalk.bold.redBright(`\nPor favor, Ingrese el número de WhatsApp.\n${chalk.bold.yellowBright("Ejemplo: +57301******")}\n${chalk.bold.magentaBright('---> ')}`));
    phoneInput  = readlineSync.question("");
    phoneNumber = normalizePhone(phoneInput);
  }
}

const logger = pino({ level: "silent" });
const versionCache = { value: null, expiresAt: 0 };
async function getVersion() {
  if (versionCache.value && Date.now() < versionCache.expiresAt) return versionCache.value;
  try {
    const latest = await fetchLatestBaileysVersion();
    versionCache.value = latest.version;
    versionCache.expiresAt = Date.now() + 60 * 60 * 1000;
  } catch (e) {
    if (!versionCache.value) versionCache.value = [2, 3000, 1033105955];
  }
  return versionCache.value;
}

let bootTime = Date.now();
let reconexion = 0;
let botReady = false;
let isRestarting = false;
const retriesLimit = 10;
function remove(sock) {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch {}
  try { sock.ws?.close(); } catch {}
  try { sock.end?.(new Error('replaced')); } catch {}
  try { sock.msgRetryCounterCache?.close(); } catch {}
}

async function warmupGroups(sock) {
  try {
    const allChats = db.db.prepare(`SELECT c.id, COALESCE(MAX(cu.lastCmd), 0) as lastActivity FROM chats c LEFT JOIN chat_users cu ON cu.chat_id = c.id WHERE c.id LIKE '%@g.us' GROUP BY c.id ORDER BY lastActivity DESC LIMIT 50`).all();
    const chatIds = allChats.map((c) => c.id);
    if (!chatIds.length) return;
    log.ready(`[ ✿ ] Precargando metadata de ${chatIds.length} grupos...`);
    const t = Date.now();
    const batches = [];
    for (let i = 0; i < chatIds.length; i += 10)
      batches.push(chatIds.slice(i, i + 10));
    for (const batch of batches) {
      await Promise.allSettled(batch.map(async (id) => {
        try {
          const meta = await sock.groupMetadata(id);
          if (meta) setCachedMeta(id, meta);
        } catch {}
      }));
      await new Promise(res => setTimeout(res, 500));
    }
    const elapsed = Date.now() - t;
    log.ready(`[ ✿ ] Reload groups en ${elapsed < 1000 ? `${elapsed}ms` : `${(elapsed/1000).toFixed(1)}s`}`);
  } catch (e) {
    log.error(`[ ✿ ] warmupGroups → ${e?.message || e}`);
  }
}

export async function startBot() {
  if (isRestarting) return;
  isRestarting = true;
  bootTime = Date.now();
  if (authClose) { try { authClose(); } catch {} authClose = null; }
  fs.mkdirSync('./Sessions/Owner', { recursive: true });
  const { state, saveCreds, close } = await useSqliteAuthState({ dbPath: './Sessions/Owner/creds.db' });
  authClose = close
  const version = await getVersion();
  console.info = () => {};
  console.debug = () => {};
  const msgCache = createMessageCache(3000);
  const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, useClones: false });
  const sock = makeWASocket({
    version,
    logger,
    browser: Browsers.macOS('Chrome'),
    printQRInTerminal: false,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    fireInitQueries: false,
    generateHighQualityLinkPreview: false,
    shouldIgnoreJid: (jid) => isJidBroadcast(jid) || isJidStatusBroadcast(jid) || isJidNewsletter(jid),
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 20000,
    transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
    emitOwnEvents: false,
    msgRetryCounterCache,
    cachedGroupMetadata: async (jid) => getRawMeta(jid) ?? undefined,
    getMessage: msgCache.getMessage,
  });

  patchGroupMetadata(sock);
  msgCache.bind(sock.ev);
  sock.msgRetryCounterCache = msgRetryCounterCache;
  global.sock = sock;
  sock.ev.on("creds.update", saveCreds);
  sock.sendText = (jid, text, quoted = "", options) => sock.sendMessage(jid, { text, ...options }, { quoted });
  sock.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      const decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    }
    return jid;
  };

  if (opcion === "2" && !state.creds.registered) {
    setTimeout(async () => {
      try {
        if (!state.creds.registered) {
          const pairing = await sock.requestPairingCode(phoneNumber);
          const codeBot = pairing?.match(/.{1,4}/g)?.join("-") || pairing;
          console.log(chalk.bold.white(chalk.bgMagenta(`Código de emparejamiento:`)), chalk.bold.white(chalk.white(codeBot)));
        }
      } catch (err) {
        console.log(chalk.red("Error al generar código:"), err);
      }
    }, 3000);
  }

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (!botReady) return;
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        if (!msg?.message || msg.key?.remoteJid === "status@broadcast") continue;
        if ((msg.messageTimestamp * 1000) < bootTime - 15000) continue;
        if (msg.message.ephemeralMessage) msg.message = msg.message.ephemeralMessage.message;
        const m = await smsg(sock, msg, msgCache);
        if (typeof main === 'function') main(sock, m, messages).catch(err => log.error('[ ✰ ]  Main Owner »', err?.stack || err?.message || err));
      } catch (err) {
        log.error('Error:', err?.stack || err?.message || err);
      }
    }
  });
  sock.ev.on("group-participants.update", ({ id }) => { deleteCachedMeta(id); });
  sock.ev.on("groups.update", (updates) => { for (const update of updates) deleteCachedMeta(update.id); });
  try { await events(sock); } catch (err) { log.error(`[ EVENT ERROR ] → ${err}`); }

  sock.ev.on("connection.update", connectionUpdate);
  async function connectionUpdate(update) {
    const { qr, connection, lastDisconnect, isNewLogin } = update;
    if (qr != 0 && qr != undefined || methodCodeQR) {
      if (opcion == '1' || methodCodeQR) {
        log.info("[ ➪ ] Escanea este código QR");
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === "open") {
      bootTime = Date.now();
      reconexion = 0;
      isRestarting = false;
      const userName = sock.user.name || "Desconocido";
      log.success(`[ ✰ ]  Conectado a: ${userName}`);
      if (!botReady) {
        botReady = true;
        warmupGroups(sock);
      }
    }
    if (isNewLogin) log.info("Nuevo dispositivo detectado");

    if (connection === "close") {
      remove(sock);
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode || 0;
      if ([DisconnectReason.loggedOut, DisconnectReason.forbidden, DisconnectReason.multideviceMismatch].includes(reason)) {
        log.warn(`Principal desvinculado (${reason}) — limpiando sesión...`);
        botReady = false;
        isRestarting = false;
        clearSession();
        process.exit(1);
      }
      if (reason === DisconnectReason.connectionReplaced) {
        log.warn("Conexión reemplazada, cierra la otra sesión antes de reconectar.");
        isRestarting = false;
        return;
      }
      reconexion++;
      if (reconexion > retriesLimit) {
        log.error(`Demasiados reintentos (${retriesLimit}), sesión posiblemente corrupta...`);
        botReady = false;
        reconexion = 0;
        isRestarting = false;
        clearSession();
        process.exit(1);
      }
      const reasonMessages = {
        [DisconnectReason.connectionLost]: "Se perdió la conexión al servidor, intentando reconectar...",
        [DisconnectReason.connectionClosed]: "Conexión cerrada, intentando reconectarse...",
        [DisconnectReason.restartRequired]: "Es necesario reiniciar...",
        [DisconnectReason.timedOut]: "Tiempo de conexión agotado, intentando reconectarse...",
        [DisconnectReason.badSession]: "Sesión inválida, limpiando y reconectando...",
      };
      log.warn(reasonMessages[reason] || `Desconexión (${reason}), reconectando en 5s...`);
      isRestarting = false;
      setTimeout(startBot, 5000);
    }
  }
}

cleanCache();
const cleanCacheInterval = setInterval(cleanCache, 30 * 60000);
if (typeof cleanCacheInterval?.unref === 'function') cleanCacheInterval.unref();

(async () => {
  await initDB();
  await cmdsLoader();
  await startBot();
})();

function shutdownDB() {
  try { db.db.close(); } catch {}
  try { authClose?.(); } catch {}
}
process.on('SIGINT', () => { shutdownDB(); process.exit(0); });
process.on('SIGTERM', () => { shutdownDB(); process.exit(0); });
process.on('exit', shutdownDB);

function onUncaughtException(e) {
  log.error(`ERROR → ${e?.stack || e?.message || e}`);
}
function onUnhandledRejection(reason) {
  if (reason instanceof SyntaxError) {
    process.off('uncaughtException', onUncaughtException);
    process.off('unhandledRejection', onUnhandledRejection);
    process.nextTick(() => { throw reason; });
    return;
  }
  log.error(`RECHAZO → ${reason?.stack || reason?.message || reason}`);
}
process.on('uncaughtException', onUncaughtException);
process.on('unhandledRejection', onUnhandledRejection);