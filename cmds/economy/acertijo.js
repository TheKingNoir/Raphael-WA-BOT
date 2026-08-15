import { promises as fs } from 'fs';
import similarity from 'similarity';
import db from '#db';

global.games = global.games || {};
const winCoins = { acertijo: 1000, pelicula: 1500, trivia: 1200, paises: 800 };
const maxIntentos = { acertijo: 3, pelicula: 2, trivia: 2, paises: 2 };
const cmdCat = { acertijo: 'acertijo', riddle: 'acertijo', adivinanza: 'acertijo', pelicula: 'pelicula', peli: 'pelicula', movie: 'pelicula', advp: 'pelicula', trivia: 'trivia', country: 'paises', flag: 'paises' };
const catLabel = { acertijo: 'Acertijo', pelicula: 'Adivina la Película', trivia: 'Trivia', paises: 'Adivina la Bandera' };
const cooldownKey = { acertijo: 'lastriddle', pelicula: 'lastmovie', trivia: 'lasttrivia', paises: 'lastflag' };

export default {
  command: ['acertijo', 'riddle', 'adivinanza', 'pelicula', 'peli', 'advp', 'trivia', 'paises', 'movie', 'country', 'flag'],
  category: 'economy',
  description: 'Acertijo, adivina la película o trivia.',
  before: async ({ msg, sock }) => {
    if (!msg.quoted) return;
    const session = Object.values(global.games).find(s => s.chat === msg.chat && s.msgId === msg.quoted.id);
    if (!session) return;
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const currency = (db.getSettings(botId)).currency || 'Monedas';
    const texto = (msg.text || '').toLowerCase().trim();
    if (texto === 'pista' || texto === 'hint') {
      if (session.hintUsed) { await sock.reply(msg.chat, `ꕥ Ya usaste la pista de esta pregunta.`, msg); return true; }
      session.hintUsed = true;
      const pistas = session.item.pista;
      const pista = Array.isArray(pistas) ? pistas[Math.floor(Math.random() * pistas.length)] : pistas;
      await sock.reply(msg.chat, `ꕥ Pista:\n\n> ${pista}`, msg);
      return true;
    }
    const correcta = session.item.respuesta.toLowerCase().trim();
    const esCorrecto = session.cat === 'trivia' ? texto === correcta : texto === correcta || similarity(texto, correcta) >= 0.72;
    if (esCorrecto) {
      const premio = winCoins[session.cat];
      const u = db.getChatUser(msg.chat, msg.sender);
      db.setChatUser(msg.chat, msg.sender, 'coins', (u.coins || 0) + premio);
      clearTimeout(session.timer);
      delete global.games[session.key];
      await sock.reply(msg.chat, `ꕥ Respuesta correcta.\n> ✿ *${currency} ›* +¥${premio.toLocaleString()}`, msg);
      return true;
    }
    session.intentos++;
    if (session.intentos >= maxIntentos[session.cat]) {
      clearTimeout(session.timer);
      delete global.games[session.key];
      await sock.reply(msg.chat, `ꕥ Sin intentos.\n\n> ✿ *Respuesta ›* ${session.item.respuesta}`, msg);
      return true;
    }
    await sock.reply(msg.chat, `ꕥ Respuesta incorrecta. Te quedan *${maxIntentos[session.cat] - session.intentos}* intento${maxIntentos[session.cat] - session.intentos !== 1 ? 's' : ''}.`, msg);
    return true;
  },
  run: async ({ msg, sock, command }) => {
    const cat = cmdCat[command?.toLowerCase()] ?? 'acertijo';
    const gameKey = `${msg.chat}|${cat}`;
    if (global.games[gameKey]) return sock.sendMessage(msg.chat, { text: `ꕥ Ya hay una pregunta activa en este chat.` }, { quoted: global.games[gameKey].msg });
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const currency = (db.getSettings(botId)).currency || 'Monedas';
    const key = cooldownKey[cat];
    const u = db.getChatUser(msg.chat, msg.sender);
    const remaining = (u[key] || 0) - Date.now();
    if (remaining > 0) return sock.reply(msg.chat, `ꕥ Debes esperar *${msToTime(remaining)}* para volver a jugar.`, msg);
    const preguntas = JSON.parse(await fs.readFile('./core/questions.json', 'utf8'));
    const item = preguntas[cat][Math.floor(Math.random() * preguntas[cat].length)];
    const premio = winCoins[cat];
    db.setChatUser(msg.chat, msg.sender, key, Date.now() + 60 * 1000);
    const sent = await sock.sendMessage(msg.chat, { text: `ꕥ ${catLabel[cat]}\n\n${item.pregunta}\n\n> ✿ *Tiempo ›* 60s\n> ✿ *Intentos ›* ${maxIntentos[cat]}\n> ✿ *Premio ›* ¥${premio.toLocaleString()} ${currency}\n\n_Cita este mensaje con tu respuesta · escribe *pista* para una ayuda._` }, { quoted: msg });
    const timer = setTimeout(async () => {
      if (!global.games[gameKey]) return;
      delete global.games[gameKey];
      await sock.reply(msg.chat, `ꕥ Tiempo agotado.\n\n> ✿ *Respuesta ›* ${item.respuesta}`, sent);
    }, 60 * 1000);
    global.games[gameKey] = { key: gameKey, chat: msg.chat, msg: sent, msgId: sent?.key?.id, item, cat, hintUsed: false, intentos: 0, timer };
  },
};

function msToTime(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}