import { proto, delay, areJidsSameUser, generateWAMessage, generateWAMessageFromContent, generateWAMessageContent, generateForwardMessageContent, prepareWAMessageMedia, downloadContentFromMessage, getContentType, getDevice, extractMessageContent, jidDecode, jidNormalizedUser } from 'baileys';
import fs from 'fs';
import axios from 'axios';
import crypto from 'crypto';
import FileType from 'file-type';
import path from 'path';
import exif from '#core/exif';
import db from '#db';
import { fileURLToPath } from 'url';
import GraphemeSplitter from 'grapheme-splitter';

const splitter = new GraphemeSplitter();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = exif;

class BoundedMap {
  #map = new Map();
  #max;
  #ttl;
  constructor(max, ttlMs = 0) { this.#max = max; this.#ttl = ttlMs; }
  #expired(e) { return this.#ttl > 0 && Date.now() - e.ts > this.#ttl; }
  has(k) {
    const e = this.#map.get(k);
    if (!e) return false;
    if (this.#expired(e)) { this.#map.delete(k); return false; }
    return true;
  }
  get(k) {
    const e = this.#map.get(k);
    if (!e) return undefined;
    if (this.#expired(e)) { this.#map.delete(k); return undefined; }
    return e.v;
  }
  set(k, v) {
    if (this.#map.size >= this.#max) this.#map.delete(this.#map.keys().next().value);
    this.#map.set(k, { v, ts: Date.now() });
  }
  prune() {
    if (this.#ttl <= 0) return;
    const now = Date.now();
    for (const [k, e] of this.#map)
      if (now - e.ts > this.#ttl) this.#map.delete(k);
  }
}

const groupMetaCache = new Map();
const rawMetaCache = new Map();
const lidCache = new BoundedMap(2000, 24 * 60 * 60_000);
const lidNegativeCache = new BoundedMap(5000, 5 * 60_000);
const usernameCache = new BoundedMap(2000, 24 * 60 * 60_000);
const usernameNegativeCache = new BoundedMap(5000, 10 * 60_000);
const lidWarming = new Set();
const LID_WARMING_MAX = 500;
const META_TTL = 300_000;
const gcMeta = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of groupMetaCache)
    if (now - val.ts > META_TTL) groupMetaCache.delete(key);
  for (const [key, val] of rawMetaCache)
    if (now - val.ts > META_TTL) rawMetaCache.delete(key);
  lidCache.prune();
  lidNegativeCache.prune();
  usernameCache.prune();
  usernameNegativeCache.prune();
  if (lidWarming.size > LID_WARMING_MAX) lidWarming.clear();
}, 10 * 60 * 1000);
gcMeta.unref();

function buildParticipantIndex(participants) {
  const adminSet = new Set();
  const byBase = new Map();
  const byUsername = new Map();
  for (const p of participants ?? []) {
    const id = p.id?.split('@')[0];
    const lid = p.lid?.split('@')[0];
    const phone = p.phoneNumber?.split('@')[0];
    const isAdmin = p.admin === 'admin' || p.admin === 'superadmin';
    const info = { id: p.id, lid: p.lid, phoneNumber: p.phoneNumber, username: p.username || null, name: p.name || null, notify: p.notify || null, admin: p.admin ?? null };
    for (const base of [id, lid, phone]) {
      if (!base) continue;
      byBase.set(base, info);
      if (isAdmin) adminSet.add(base);
    }
    if (p.username) byUsername.set(String(p.username).toLowerCase(), info);
  }
  return { adminSet, byBase, byUsername };
}

const participantIndexByMeta = new WeakMap();
function getParticipantIndex(groupMetadata) {
  if (!groupMetadata) return { adminSet: new Set(), byBase: new Map(), byUsername: new Map() };
  let idx = participantIndexByMeta.get(groupMetadata);
  if (!idx) { idx = buildParticipantIndex(groupMetadata.participants); participantIndexByMeta.set(groupMetadata, idx); }
  return idx;
}

function getAdminSet(groupMetadata) {
  return getParticipantIndex(groupMetadata).adminSet;
}

function getParticipantInfo(groupMetadata, jid) {
  if (!groupMetadata || !jid) return null;
  const base = String(jid).split('@')[0];
  return getParticipantIndex(groupMetadata).byBase.get(base) || null;
}

function getParticipantInfoByUsername(groupMetadata, username) {
  if (!groupMetadata || !username) return null;
  const clean = String(username).replace(/^@/, '').trim().toLowerCase();
  if (!clean) return null;
  return getParticipantIndex(groupMetadata).byUsername.get(clean) || null;
}

function getUsername(groupMetadata, jid) {
  return getParticipantInfo(groupMetadata, jid)?.username || null;
}

function getCachedMeta(groupJid) {
  const c = groupMetaCache.get(groupJid);
  if (!c || Date.now() - c.ts > META_TTL) return null;
  return c.metadata;
}

function getRawMeta(groupJid) {
  const c = rawMetaCache.get(groupJid);
  if (!c || Date.now() - c.ts > META_TTL) return null;
  return c.metadata;
}

function setCachedMeta(groupJid, metadata) {
  groupMetaCache.set(groupJid, { metadata, ts: Date.now() });
}

function deleteCachedMeta(groupJid) {
  groupMetaCache.delete(groupJid);
  rawMetaCache.delete(groupJid);
}

function normalizeJid(raw) {
  if (!raw) return null;
  const s = typeof raw === 'number' ? String(raw) : String(raw).trim();
  if (!s) return null;
  if (s.endsWith('@g.us')) return s;
  if (s.endsWith('@newsletter')) return s;
  if (s.endsWith('@lid')) return s;
  if (/:\d+@/i.test(s)) {
    const decoded = jidDecode(s);
    if (decoded?.user && decoded?.server) return `${decoded.user}@${decoded.server}`;
  }
  if (s.endsWith('@s.whatsapp.net')) return s;
  const digits = s.replace(/\D/g, '');
  if (digits && digits.length >= 4 && digits.length <= 15) return `${digits}@s.whatsapp.net`;
  return s;
}

function resolveParticipantJid(p, sock) {
  if (!p) return null;
  if (p.phoneNumber) {
    const n = normalizeJid(p.phoneNumber);
    if (n && !n.endsWith('@lid')) return n;
  }
  if (p.id && !p.id.endsWith('@lid')) {
    const n = normalizeJid(p.id);
    if (n && !n.endsWith('@lid')) return n;
  }
  if (p.jid && !p.jid.endsWith('@lid')) {
    const n = normalizeJid(p.jid);
    if (n && !n.endsWith('@lid')) return n;
  }
  const rawLid = p.lid || (p.id?.endsWith('@lid') ? p.id : null) || (p.jid?.endsWith('@lid') ? p.jid : null);
  if (rawLid) {
    if (lidCache.has(rawLid)) return lidCache.get(rawLid);
    return rawLid;
  }
  return null;
}

function hasLidStore(sock) {
  const lm = sock?.signalRepository?.lidMapping;
  return typeof lm?.getPNsForLIDs === 'function' || typeof lm?.getPNForLID === 'function';
}

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, ms);
    Promise.resolve(promise).then(
      (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
      () => { if (!done) { done = true; clearTimeout(timer); resolve(null); } }
    );
  });
}

function peekMappingCache(lid, sock) {
  const mc = sock?.signalRepository?.lidMapping?.mappingCache;
  if (!mc || typeof mc.get !== 'function') return null;
  try {
    const cached = mc.get(`lid:${String(lid).split('@')[0]}`);
    if (typeof cached === 'string' && cached) {
      const n = normalizeJid(cached.includes('@') ? cached : `${cached}@s.whatsapp.net`);
      return n && !n.endsWith('@lid') ? n : null;
    }
  } catch {}
  return null;
}

function warmLids(lids, sock) {
  const lm = sock?.signalRepository?.lidMapping;
  const pending = [...new Set(lids)].filter(l => l && !lidCache.has(l) && !lidNegativeCache.has(l) && !lidWarming.has(l));
  if (!pending.length) return;
  for (const l of pending) lidWarming.add(l);
  const finish = (resolvedSet) => {
    for (const l of pending) if (!resolvedSet.has(l)) lidNegativeCache.set(l, true);
    for (const l of pending) lidWarming.delete(l);
  };
  if (typeof lm?.getPNsForLIDs === 'function') {
    Promise.resolve(lm.getPNsForLIDs(pending))
      .then((pairs) => {
        const resolvedSet = new Set();
        for (const pair of pairs || []) {
          const n = normalizeJid(pair?.pn);
          if (pair?.lid && n && !n.endsWith('@lid')) { lidCache.set(pair.lid, n); resolvedSet.add(pair.lid); }
        }
        finish(resolvedSet);
      })
      .catch(() => finish(new Set()));
  } else if (typeof lm?.getPNForLID === 'function') {
    Promise.all(pending.map(lid =>
      Promise.resolve(lm.getPNForLID(lid))
        .then((pn) => { const n = normalizeJid(pn); if (n && !n.endsWith('@lid')) { lidCache.set(lid, n); return lid; } return null; })
        .catch(() => null)
    )).then((resolved) => finish(new Set(resolved.filter(Boolean))));
  } else {
    finish(new Set());
  }
}

async function resolveLidsAsync(lids, sock) {
  const list = [...new Set((lids ?? []).filter(l => l?.endsWith('@lid')))];
  const result = new Map();
  if (!list.length || !hasLidStore(sock)) return result;
  const pending = [];
  for (const lid of list) {
    const sync = peekMappingCache(lid, sock);
    if (sync) { lidCache.set(lid, sync); result.set(lid, sync); }
    else if (!lidNegativeCache.has(lid)) pending.push(lid);
  }
  if (pending.length) warmLids(pending, sock);
  return result;
}

async function resolveLidAsync(lid, sock) {
  if (!lid?.endsWith('@lid')) return null;
  const map = await resolveLidsAsync([lid], sock);
  return map.get(lid) || null;
}

async function resolveUsernameAsync(username, sock, groupJid) {
  const clean = String(username || '').replace(/^@/, '').trim();
  if (!clean) return null;
  const key = clean.toLowerCase();
  const localMeta = groupJid ? getCachedMeta(groupJid) : null;
  const localHit = getParticipantInfoByUsername(localMeta, key);
  if (localHit?.id) return localHit.id;
  if (usernameCache.has(key)) return usernameCache.get(key);
  if (usernameNegativeCache.has(key)) return null;
  if (typeof sock?.getJidByUsername !== 'function') { usernameNegativeCache.set(key, true); return null; }
  let results = null;
  try { results = await withTimeout(sock.getJidByUsername(clean), 4000); }
  catch { results = null; }
  const hit = Array.isArray(results) ? results.find(r => r?.exists) || results[0] : null;
  const jid = hit?.jid ? normalizeJid(hit.jid) : null;
  if (jid) { usernameCache.set(key, jid); return jid; }
  usernameNegativeCache.set(key, true);
  return null;
}

async function resolveParticipants(participants, sock) {
  if (!Array.isArray(participants)) return [];
  const prelim = participants.map(p => ({ p, realJid: resolveParticipantJid(p, sock) }));
  const unresolvedLids = prelim.filter(e => e.realJid?.endsWith('@lid')).map(e => e.realJid);
  const batchResolved = unresolvedLids.length ? await resolveLidsAsync(unresolvedLids, sock) : new Map();
  const stillUnresolved = prelim.filter(e => e.realJid?.endsWith('@lid') && !batchResolved.has(e.realJid) && e.p.username);
  if (stillUnresolved.length) {
    const usernames = stillUnresolved.map(e => e.p.username);
    const results = await Promise.all(usernames.map(u => resolveUsernameAsync(u, sock, null)));
    stillUnresolved.forEach((e, i) => {
      const jid = results[i];
      if (jid && !jid.endsWith('@lid')) batchResolved.set(e.realJid, jid);
    });
  }
  const resolved = prelim.map(({ p, realJid }) => {
    const finalJid = (realJid?.endsWith('@lid') ? batchResolved.get(realJid) : null) || realJid;
    if (!finalJid) return p;
    const originalLid = p.lid || (p.id?.endsWith('@lid') ? p.id : undefined) || (p.jid?.endsWith('@lid') ? p.jid : undefined);
    return { ...p, id: finalJid, ...(originalLid ? { lid: originalLid } : {}), ...(p.phoneNumber ? { phoneNumber: p.phoneNumber } : (!finalJid.endsWith('@lid') ? { phoneNumber: finalJid } : {})) };
  });
  return resolved.filter(p => p.id);
}

function resolveJidSync(raw, sock) {
  if (!raw) return null;
  const norm = normalizeJid(raw);
  if (!norm) return null;
  if (!norm.endsWith('@lid')) return norm;
  if (lidCache.has(norm)) return lidCache.get(norm);
  return norm;
}

async function resolveJidAsync(raw, sock, groupJid, altHint) {
  if (!raw) return null;
  const norm = normalizeJid(raw);
  if (!norm) return null;
  if (!norm.endsWith('@lid')) return norm;
  if (altHint) {
    const hinted = normalizeJid(altHint);
    if (hinted && !hinted.endsWith('@lid')) { lidCache.set(norm, hinted); return hinted; }
  }
  const sync = resolveJidSync(norm, sock);
  if (sync && !sync.endsWith('@lid')) return sync;
  const viaStore = await resolveLidAsync(norm, sock);
  if (viaStore) return viaStore;
  if (!groupJid?.endsWith('@g.us')) {
    try {
      const results = await withTimeout(sock.onWhatsApp(norm), 4000);
      const hit = Array.isArray(results) ? results.find(r => r?.exists) || results[0] : null;
      const resolvedJid = hit?.jid ? normalizeJid(hit.jid) : null;
      if (resolvedJid && !resolvedJid.endsWith('@lid')) {
        lidCache.set(norm, resolvedJid);
        return resolvedJid;
      }
    } catch {}
    return norm;
  }
  const lidBase = norm.split('@')[0];
  let meta = getCachedMeta(groupJid);
  if (!meta) {
    try { meta = await sock.groupMetadata(groupJid); if (meta?.participants) setCachedMeta(groupJid, meta); else meta = null; }
    catch { return norm; }
  }
  let username = null;
  for (const p of meta?.participants ?? []) {
    const pLidBase = p.lid?.split('@')[0];
    const pIdBase  = (p.id && !p.id.endsWith('@lid')) ? p.id.split('@')[0] : null;
    if (pLidBase !== lidBase && pIdBase !== lidBase) continue;
    const phone = p.phoneNumber ? normalizeJid(p.phoneNumber) : (p.id && !p.id.endsWith('@lid') ? normalizeJid(p.id) : null);
    if (phone) { lidCache.set(norm, phone); return phone; }
    if (p.username) username = p.username;
    break;
  }
  if (username) {
    const viaUsername = await resolveUsernameAsync(username, sock, groupJid);
    if (viaUsername && !viaUsername.endsWith('@lid')) { lidCache.set(norm, viaUsername); return viaUsername; }
  }
  return norm;
}

function patchGroupMetadata(sock) {
  if (sock.groupMetadataPatched) return;
  sock.groupMetadataPatched = true;
  const orig = sock.groupMetadata.bind(sock);
  sock.groupMetadata = async (jid) => {
    try {
      const cached = getCachedMeta(jid);
      if (cached) return cached;
      const meta = await orig(jid);
      if (!meta?.participants) return meta;
      const crudos = meta.participants;
      rawMetaCache.set(jid, { metadata: { ...meta, participants: crudos }, ts: Date.now() });
      meta.participants = await resolveParticipants(crudos, sock);
      setCachedMeta(jid, meta);
      return meta;
    } catch (e) {
      return null;
    }
  };
}

function createMessageCache(max = 1000) {
  const map = new Map();
  const bind = (ev) => {
    ev.on('messages.upsert', ({ messages }) => {
      for (const m of messages) {
        if (!m?.message || !m?.key?.id || !m?.key?.remoteJid) continue;
        const cacheKey = `${m.key.remoteJid}:${m.key.id}`;
        map.delete(cacheKey);
        map.set(cacheKey, m.message);
        while (map.size > max) {
          map.delete(map.keys().next().value);
        }
      }
    });
  };
  const getMessage = async (key) => map.get(`${key.remoteJid}:${key.id}`) ?? undefined;
  const loadMessage = async (jid, id) => {
    const message = map.get(`${jid}:${id}`);
    return message ? { message } : null;
  };
  return { bind, getMessage, loadMessage, size: () => map.size };
}

export { normalizeJid, resolveParticipantJid, resolveJidSync, resolveLidAsync, resolveUsernameAsync, patchGroupMetadata, getCachedMeta, setCachedMeta, deleteCachedMeta, getRawMeta, getAdminSet, getParticipantInfo, getParticipantInfoByUsername, getUsername, createMessageCache, BoundedMap };

export async function getBuffer(url, options = {}) {
  try {
    const res = await axios({ method: 'get', url, headers: { DNT: 1, 'Upgrade-Insecure-Request': 1 }, responseType: 'arraybuffer', timeout: 30_000, ...options });
    return res.data;
  } catch (e) { throw e; }
}

export async function smsg(sock, msg, store) {
  const botId = sock?.user?.id.split(':')[0] + '@s.whatsapp.net' || '';
  const botSetting = db.getSettings(botId);
  if (!sock.decodeJid) {
    sock.decodeJid = (jid) => {
      if (!jid) return jid;
      if (/:\d+@/gi.test(jid)) {
        const decoded = jidDecode(jid) || {};
        return (decoded.user && decoded.server && decoded.user + '@' + decoded.server) || jid;
      }
      return jid;
    };
  }
  patchGroupMetadata(sock);
  if (!sock.downloadMediaMessage) {
  sock.downloadMediaMessage = async (message) => {
    const m = message.content || message;
    const normalized = message.message ? extractMessageContent(message.message) : null;
    const realType = (normalized && getContentType(normalized)) || message.type;
    const mime = m.mimetype || '';
    const messageType = (realType || mime.split('/')[0] || '').replace(/Message/gi, '');
    const stream = await downloadContentFromMessage(m, messageType);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  };
  }
  if (!msg) return msg;
  let groupMeta = null;
  if (msg.key) {
    msg.id = msg.key.id;
    msg.chat = msg.key.remoteJid;
    msg.fromMe = msg.key.fromMe;
    msg.isBot = ['HSK', 'BAE', 'B1E', '3EB0', 'B24E', 'WA'].some((a) => msg.id.startsWith(a) && [12, 16, 20, 22, 40].includes(msg.id.length)) || /(.)\1{5,}|[^a-zA-Z0-9]/.test(msg.id) || false;
    msg.isGroup = msg.chat?.endsWith('@g.us') ?? false;
    if (!msg.isGroup && msg.chat?.endsWith('@lid')) {
      const resolved = await resolveJidAsync(msg.chat, sock, null);
      if (resolved && !resolved.endsWith('@lid')) msg.chat = resolved;
    }
    const rawSender = (msg.fromMe && sock.user.id) || msg.key?.participant || msg.key?.remoteJid || '';
    const senderAltHint = msg.key?.participantAlt || msg.key?.remoteJidAlt;
    msg.sender = await resolveJidAsync(sock.decodeJid(rawSender), sock, msg.key?.remoteJid, senderAltHint);
    groupMeta = msg.isGroup ? getCachedMeta(msg.chat) : null;
    msg.senderUsername = msg.key?.participantUsername || (msg.isGroup ? getUsername(groupMeta, msg.sender) : null);
  }

  if (msg.message) {
    msg.type = getContentType(msg.message) || Object.keys(msg.message)[0];
    msg.content = /viewOnceMessage|viewOnceMessageV2Extension|editedMessage|ephemeralMessage/i.test(msg.type) ? msg.message[msg.type].message[getContentType(msg.message[msg.type].message)] : extractMessageContent(msg.message[msg.type]) || msg.message[msg.type];
    msg.body = msg.message?.conversation || msg.content?.text || msg.content?.conversation || msg.content?.caption || msg.content?.selectedButtonId || msg.content?.singleSelectReply?.selectedRowId || msg.content?.selectedId || msg.content?.contentText || msg.content?.selectedDisplayText || msg.content?.title || msg.content?.name || '';
    const rawMentioned = msg.content?.contextInfo?.mentionedJid ?? [];
    let metaParticipants = null;
    if (msg.isGroup && rawMentioned.some(j => j?.endsWith('@lid'))) {
      try {
        if (!groupMeta) {
          groupMeta = await sock.groupMetadata(msg.chat).catch(() => null);
          if (groupMeta) setCachedMeta(msg.chat, groupMeta);
        }
        metaParticipants = groupMeta?.participants ?? null;
      } catch {}
    }
    const resolveMentionedJids = async (rawList) => {
      const normalized = (rawList ?? []).map(raw => raw ? normalizeJid(raw) : null);
      const out = new Array(normalized.length);
      const needStore = [];
      for (let i = 0; i < normalized.length; i++) {
        const norm = normalized[i];
        if (!norm) { out[i] = null; continue; }
        if (!norm.endsWith('@lid')) { out[i] = norm; continue; }
        const sync = resolveJidSync(norm, sock);
        if (sync && !sync.endsWith('@lid')) { out[i] = sync; continue; }
        out[i] = norm;
        needStore.push(i);
      }
      if (needStore.length) {
        const batchResolved = await resolveLidsAsync(needStore.map(i => out[i]), sock);
        for (const i of needStore) {
          const lid = out[i];
          const viaStore = batchResolved.get(lid);
          if (viaStore) { out[i] = viaStore; continue; }
          if (metaParticipants) {
            const lidBase = lid.split('@')[0];
            for (const p of metaParticipants) {
              if (p.lid?.split('@')[0] === lidBase) { out[i] = p.id; break; }
              if (p.id?.split('@')[0] === lidBase) { out[i] = p.id; break; }
            }
          }
        }
      }
      return out.filter(Boolean);
    };
    msg.mentionedJid = await resolveMentionedJids(rawMentioned);
    msg.mentionedUsernames = msg.isGroup ? msg.mentionedJid.map(j => getUsername(groupMeta, j)) : [];
    msg.text = msg.content?.text || msg.content?.caption || msg.message?.conversation || msg.content?.contentText || msg.content?.selectedDisplayText || msg.content?.title || '';
    let activePrefixes = [];
    if (botSetting.prefix === 1) activePrefixes = [];
    else if (Array.isArray(botSetting.prefix)) activePrefixes = botSetting.prefix;
    else if (typeof botSetting.prefix === 'string') activePrefixes = splitter.splitGraphemes(botSetting.prefix);
    else activePrefixes = ['#', '/', '.', '!'];
    msg.usedPrefix = '';
    for (const p of activePrefixes) { if (msg.body?.startsWith(p)) { msg.usedPrefix = p; break; } }
    msg.command = msg.body && msg.body.replace(msg.usedPrefix, '').trim().split(/ +/).shift();
    msg.args = msg.body?.trim().replace(new RegExp('^' + (msg.usedPrefix || '').replace(/[.*=+:\-?^${}()|[\]\\]|\s/g, '\\$&'), 'i'), '').replace(msg.command, '').split(/ +/).filter((a) => a) || [];
    msg.device = getDevice(msg.id);
    msg.expiration = msg.content?.contextInfo?.expiration || msg?.metadata?.ephemeralDuration || sock?.messages?.[msg.chat]?.array?.slice(-1)[0]?.metadata?.ephemeralDuration || 0;
    msg.timestamp = (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp?.low || msg.messageTimestamp?.high) || (msg.content?.timestampMs * 1000);
    msg.isMedia = !!msg.content?.mimetype || !!msg.content?.thumbnailDirectPath;
    if (msg.isMedia && /webp/i.test(msg.content?.mimetype || '')) msg.isAnimated = msg.content?.isAnimated;
    msg.quoted = msg.content?.contextInfo?.quotedMessage ? {} : null;
    if (msg.quoted) {
      msg.quoted.message = extractMessageContent(msg.content?.contextInfo?.quotedMessage);
      msg.quoted.type = getContentType(msg.quoted.message) || Object.keys(msg.quoted.message)[0];
      msg.quoted.content = extractMessageContent(msg.quoted.message[msg.quoted.type]) || msg.quoted.message[msg.quoted.type];
      msg.quoted.id = msg.content.contextInfo.stanzaId;
      msg.quoted.device = getDevice(msg.quoted.id);
      msg.quoted.chat = msg.content.contextInfo.remoteJid || msg.chat;
      msg.quoted.isBot = msg.quoted.id ? ['HSK', 'BAE', 'B1E', '3EB0', 'B24E', 'WA'].some((a) => msg.quoted.id.startsWith(a) && [12, 16, 20, 22, 40].includes(msg.quoted.id.length)) || /(.)\1{5,}|[^a-zA-Z0-9]/.test(msg.quoted.id) : false;
      const rawQP = msg.content?.contextInfo?.participant ?? '';
      msg.quoted.sender = await resolveJidAsync(sock.decodeJid(rawQP), sock, msg.chat);
      msg.quoted.fromMe = areJidsSameUser(msg.quoted.sender, sock.decodeJid(sock.user.id));
      msg.quoted.senderUsername = msg.quoted.chat?.endsWith('@g.us') ? getUsername(getCachedMeta(msg.quoted.chat), msg.quoted.sender) : null;
      msg.quoted.text = msg.quoted.content?.text || msg.quoted.content?.caption || msg.quoted.content?.conversation || msg.quoted.content?.contentText || msg.quoted.content?.selectedDisplayText || msg.quoted.content?.title || '';
      msg.quoted.body = msg.quoted.content?.text || msg.quoted.content?.caption || msg.quoted.message?.conversation || msg.quoted.content?.selectedButtonId || msg.quoted.content?.singleSelectReply?.selectedRowId || msg.quoted.content?.selectedId || msg.quoted.content?.contentText || msg.quoted.content?.selectedDisplayText || msg.quoted.content?.title || msg.quoted.content?.name || '';
      msg.quoted.mentionedJid = await resolveMentionedJids(msg.quoted.content?.contextInfo?.mentionedJid ?? []);
      msg.quoted.isGroup = msg.quoted.chat?.endsWith('@g.us');
      let quotedPrefix = '';
      for (const p of activePrefixes) { if (msg.quoted.body?.startsWith(p)) { quotedPrefix = p; break; } }
      msg.quoted.usedPrefix = quotedPrefix;
      msg.quoted.command = msg.quoted.body && msg.quoted.body.replace(msg.quoted.usedPrefix, '').trim().split(/ +/).shift();
      msg.quoted.isMedia = !!msg.quoted.content?.mimetype || !!msg.quoted.content?.thumbnailDirectPath;
      if (msg.quoted.isMedia && /webp/i.test(msg.quoted.content?.mimetype || '')) msg.quoted.isAnimated = msg.quoted.content?.isAnimated || false;
      msg.quoted.key = { remoteJid: msg.content?.contextInfo?.remoteJid || msg.chat, participant: msg.quoted.sender, fromMe: areJidsSameUser(sock.decodeJid(msg.content?.contextInfo?.participant), sock.decodeJid(sock?.user?.id)), id: msg.content?.contextInfo?.stanzaId };
      msg.quoted.fakeObj = proto.WebMessageInfo.fromObject({ key: { remoteJid: msg.quoted.chat, fromMe: msg.quoted.fromMe, id: msg.quoted.id }, message: msg.quoted.message, ...(msg.isGroup ? { participant: msg.quoted.sender } : {}) });
      msg.getQuotedObj = async () => {
        if (!msg.quoted.id) return false;
        const q = store ? await store.loadMessage(msg.chat, msg.quoted.id).catch(() => null) : null;
        return await smsg(sock, q);
      };
      msg.quoted.download = () => sock.downloadMediaMessage(msg.quoted);
      msg.quoted.delete = async () => {
        let isBotAdmins = false;
        if (msg.quoted.isGroup) {
          const botJid = sock?.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '';
          const botBase = botJid.split('@')[0];
          let meta = getCachedMeta(msg.quoted.chat);
          if (!meta) meta = await sock.groupMetadata(msg.quoted.chat).catch(() => null);
          const participants = meta?.participants || [];
          const adminSet = new Set(participants.filter((p) => p.admin === 'admin' || p.admin === 'superadmin').flatMap((p) => [p.id?.split('@')[0], p.lid?.split('@')[0], p.phoneNumber?.split('@')[0]].filter(Boolean)));
          isBotAdmins = adminSet.has(botBase);
        }
        return sock.sendMessage(msg.quoted.chat, { delete: { remoteJid: msg.quoted.chat, fromMe: isBotAdmins ? false : true, id: msg.quoted.id, participant: msg.quoted.sender } });
      };
    }
  }
  msg.getUsername = (jid = msg.sender) => msg.isGroup ? getUsername(getCachedMeta(msg.chat), jid) : null;
  msg.getJidByUsername = (username) => resolveUsernameAsync(username, sock, msg.isGroup ? msg.chat : null);
  msg.download = () => sock.downloadMediaMessage(msg);
  msg.copy = () => smsg(sock, proto.WebMessageInfo.fromObject(proto.WebMessageInfo.toObject(msg)));
  msg.react = (u) => sock.sendMessage(msg.chat, { react: { text: u, key: msg.key } });
  msg.copyNForward = (jid = msg.chat, forceForward = false, options = {}) => sock.copyNForward(jid, msg, forceForward, options);

  msg.reply = async (content, options = {}) => {
    const quoted = msg;
    const chat = msg.chat;
    const ephemeralExpiration = msg.expiration;
    const mentions = '';
    if (typeof content === 'object') {
      return sock.sendMessage(chat, content, { ...options, quoted, ephemeralExpiration });
    }
    return sock.sendMessage(chat, { text: content, mentions, ...options }, { quoted, ephemeralExpiration });
  };

  if (!sock.parseMention) {
  sock.parseMention = async (text) => {
    return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map((v) => v[1] + '@s.whatsapp.net');
  };
  }
  
  if (!sock.sendImageAsSticker) {
  sock.sendImageAsSticker = async (jid, p, quoted, options = {}) => {
    const buff = Buffer.isBuffer(p) ? p : /^data:.*?\/.*?;base64,/i.test(p) ? Buffer.from(p.split`,`[1], 'base64') : /^https?:\/\//.test(p) ? await getBuffer(p) : fs.existsSync(p) ? fs.readFileSync(p) : Buffer.alloc(0);
    const buffer = (options?.packname || options?.author) ? await writeExifImg(buff, options) : await imageToWebp(buff);
    await sock.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted });
    return buffer;
  };
  }

  if (!sock.sendVideoAsSticker) {
  sock.sendVideoAsSticker = async (jid, p, quoted, options = {}) => {
    const buff = Buffer.isBuffer(p) ? p : /^data:.*?\/.*?;base64,/i.test(p) ? Buffer.from(p.split`,`[1], 'base64') : /^https?:\/\//.test(p) ? await getBuffer(p) : fs.existsSync(p) ? fs.readFileSync(p) : Buffer.alloc(0);
    const buffer = (options?.packname || options?.author) ? await writeExifVid(buff, options) : await videoToWebp(buff);
    await sock.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted });
    return buffer;
  };
  }

  if (!sock.sendFile) {
  sock.sendFile = async (jid, p, filename = 'file', caption = '', quoted = null, ptt = false, options = {}) => {
    let buffer;
    if (Buffer.isBuffer(p)) buffer = p;
    else if (/^https?:\/\//.test(p)) buffer = await getBuffer(p);
    else if (fs.existsSync(p)) buffer = fs.readFileSync(p);
    else throw new Error('Ruta o buffer inválido');
    const type = (await FileType.fromBuffer(buffer)) ?? { mime: 'application/octet-stream', ext: 'bin' };
    const mimetype = options.mimetype ?? type.mime;
    let mtype = 'document';
    if (/webp/i.test(type.mime)) mtype = 'sticker';
    else if (/image/i.test(type.mime)) mtype = 'image';
    else if (/video/i.test(type.mime)) mtype = 'video';
    else if (/audio/i.test(type.mime)) mtype = 'audio';
    if (options.asDocument) mtype = 'document';
    const clean = { ...options };
    ;['asDocument', 'asSticker', 'asImage', 'asVideo'].forEach(k => delete clean[k]);
    return sock.sendMessage(jid, { ...clean, caption, ptt, [mtype]: buffer, mimetype, fileName: filename }, { quoted });
  };
  }

  if (!sock.copyNForward) {
  sock.copyNForward = async (jid, message, forceForward = false, options = {}) => {
    const content = generateForwardMessageContent(message, forceForward);
    if (message.expiration) content[Object.keys(content)[0]].contextInfo = { ...content[Object.keys(content)[0]].contextInfo, expiration: message.expiration };
    return sock.sendMessage(jid, content, options);
  };
  }

  if (!sock.sendAlbumMessage) {
  sock.sendAlbumMessage = async (jid, medias, options = {}) => {
    if (typeof jid !== 'string') throw new TypeError(`jid must be string, received: ${jid}`);
    if (!Array.isArray(medias) || medias.length < 2) throw new RangeError('Minimum 2 media required');
    for (const media of medias) {
      if (!media.type || (media.type !== 'image' && media.type !== 'video')) throw new TypeError(`Invalid media type: ${media.type}`);
      if (!media.data || (!media.data.url && !Buffer.isBuffer(media.data))) throw new TypeError(`Invalid media data`);
    }
    const caption = options.text || options.caption || '';
    const delayMs = !isNaN(options.delay) ? options.delay : 500;
    delete options.text; delete options.caption; delete options.delay;
    const album = generateWAMessageFromContent(jid, { messageContextInfo: {}, albumMessage: { expectedImageCount: medias.filter(m => m.type === 'image').length, expectedVideoCount: medias.filter(m => m.type === 'video').length, ...(options.quoted ? { contextInfo: { remoteJid: options.quoted.key.remoteJid, fromMe: options.quoted.key.fromMe, stanzaId: options.quoted.key.id, participant: options.quoted.key.participant || options.quoted.key.remoteJid, quotedMessage: options.quoted.message } } : {}) } }, {});
    await sock.relayMessage(album.key.remoteJid, album.message, { messageId: album.key.id });
    for (let i = 0; i < medias.length; i++) {
      const { type, data, caption } = medias[i];
      const mediaMsg = await generateWAMessage(album.key.remoteJid, { [type]: data, ...(caption ? { caption } : {}) }, { upload: sock.waUploadToServer });
      mediaMsg.message.messageContextInfo = { messageAssociation: { associationType: 1, parentMessageKey: album.key } };
      await sock.relayMessage(mediaMsg.key.remoteJid, mediaMsg.message, { messageId: mediaMsg.key.id });
      await delay(delayMs);
    }
    return album;
  };
  }
  
  if (!sock.sendCodeMessage) {
  sock.sendCodeMessage = async (jid, filename, code, quoted, tableData) => {
    const KEYWORDS = new Set(['break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','false','finally','for','function','if','import','in','instanceof','let','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','async','await','static']);
    const METHOD_NAMES = new Set(['log','parse','stringify','from','toString','readFileSync','existsSync','statSync','resolve','join','randomUUID','randomBytes','startsWith','replace','trim','isFile','relayMessage','sendMessage']);
    function tokenize(src) {
      const tokens = [];
      let i = 0;
      const push = (content, type = 'DEFAULT') => { if (content) tokens.push({ content, type }); };
      while (i < src.length) {
        const ch = src[i];
        const rest = src.slice(i);
        if (rest.startsWith('//')) { let j = i + 2; while (j < src.length && src[j] !== '\n') j++; push(src.slice(i, j), 'DEFAULT'); i = j; continue; }
        if (rest.startsWith('/*')) { let j = i + 2; while (j < src.length - 1 && !(src[j] === '*' && src[j + 1] === '/')) j++; j = Math.min(j + 2, src.length); push(src.slice(i, j), 'DEFAULT'); i = j; continue; }
        if (ch === "'" || ch === '"' || ch === '`') {
          const quote = ch; let j = i + 1, escaped = false;
          while (j < src.length) { const c = src[j]; if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) { j++; break; } j++; }
          push(src.slice(i, j), 'STR'); i = j; continue;
        }
        if (/[0-9]/.test(ch)) { let j = i + 1; while (j < src.length && /[0-9._]/.test(src[j])) j++; push(src.slice(i, j), 'NUMBER'); i = j; continue; }
        if (/[A-Za-z_$]/.test(ch)) {
          let j = i + 1; while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
          const word = src.slice(i, j); const next = src[j] || '', prev = src[i - 1] || '';
          if (KEYWORDS.has(word)) push(word, 'KEYWORD');
          else if ((METHOD_NAMES.has(word) || next === '(') && prev === '.') push(word, 'METHOD');
          else if (METHOD_NAMES.has(word) && next === '(') push(word, 'METHOD');
          else push(word, 'DEFAULT');
          i = j; continue;
        }
        push(ch, 'DEFAULT'); i++;
      }
      const merged = [];
      for (const token of tokens) { const last = merged[merged.length - 1]; if (last?.type === 'DEFAULT' && token.type === 'DEFAULT') last.content += token.content; else merged.push({ ...token }); }
      return merged;
    }
    const codeBlocks = Array.isArray(code) ? code : tokenize(String(code));
    const sections = [];
    const submessages = [];
    sections.push({ view_model: { primitive: { text: filename, __typename: 'GenAIMarkdownTextUXPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } });
    if (tableData) {
      const tableRows = [{ items: tableData.headers, isHeading: true }, ...tableData.rows.map(r => ({ items: r.map(String) }))];
      submessages.push({ messageType: 4, tableMetadata: { title: tableData.title, rows: tableRows } });
      sections.push({ view_model: { primitive: { title: tableData.title, rows: tableRows.map(row => ({ is_header: row.isHeading ?? false, cells: row.items, markdown_cells: [] })), __typename: 'GenATableUXPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } });
    }
    sections.push({ view_model: { primitive: { language: 'javascript', code_blocks: codeBlocks, __typename: 'GenAICodeUXPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } });
    const payload = { response_id: crypto.randomUUID(), sections };
    const content = { messageContextInfo: { threadId: [], deviceListMetadata: { senderKeyIndexes: [], recipientKeyIndexes: [], recipientKeyHash: '', recipientTimestamp: Math.floor(Date.now() / 1000) }, deviceListMetadataVersion: 2, messageSecret: crypto.randomBytes(32).toString('base64') }, botForwardedMessage: { message: { richResponseMessage: { submessages, messageType: 1, unifiedResponse: { data: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') }, contextInfo: { mentionedJid: [], groupMentions: [], statusAttributions: [], forwardingScore: 2, isForwarded: true, forwardedAiBotMessageInfo: { botJid: '259786046210223@bot' }, forwardOrigin: 4, botMessageSharingInfo: { botEntryPointOrigin: 1, forwardScore: 2 } } } } } };
    return sock.relayMessage(jid, content, {});
  };
  }

  if (!sock.sendStatusMessage) {
  sock.sendStatusMessage = async (jid, options = {}) => {
    const { type = 'text', text, media, caption, mimetype, fileName, ptt, textArgb, backgroundArgb, font, audienceType, listName, listEmoji } = options;
    const contextInfo = { statusSourceType: 0, statusAttributions: [{ AttributionData: null, type: 10 }], isGroupStatus: true, statusAudienceMetadata: { audienceType, listName, listEmoji } };
    let innerMessage;
    if (type === 'text') {
      innerMessage = { extendedTextMessage: { text, textArgb, backgroundArgb, font, previewType: 0, contextInfo } };
    } else {
      const mediaContent = { [type]: typeof media === 'string' ? { url: media } : media };
      if (caption) mediaContent.caption = caption;
      if (mimetype) mediaContent.mimetype = mimetype;
      if (fileName) mediaContent.fileName = fileName;
      if (ptt) mediaContent.ptt = ptt;
      const content = await generateWAMessageContent(mediaContent, { upload: sock.waUploadToServer });
      const messageKey = `${type}Message`;
      content[messageKey].contextInfo = contextInfo;
      innerMessage = { [messageKey]: content[messageKey] };
    }
    const message = generateWAMessageFromContent(jid, { groupStatusMessageV2: { message: innerMessage } }, {});
    await sock.relayMessage(jid, message.message, { messageId: message.key.id });
    return message;
  };
  }
  
  if (!sock.reply) {
  sock.reply = async (jid, text = '', quoted, options) => {
    return Buffer.isBuffer(text) ? sock.sendFile(jid, text, 'file', '', quoted, false, options) : sock.sendMessage(jid, { ...options, text }, { quoted, ...options });
  };
  }
  
  return msg;
}