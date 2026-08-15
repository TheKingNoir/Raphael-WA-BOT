import db from '#db';

global.math = global.math || {};
const rewardRanges = { facil: [800, 1500], medio: [1500, 2500], dificil: [2500, 4000], imposible: [4000, 5500], imposible2: [5500, 7500] };
const limits = { facil: 10, medio: 50, dificil: 90, imposible: 100, imposible2: 160 };

const generarProblema = (dificultad) => {
  const max = limits[dificultad];
  const num1 = Math.floor(Math.random() * max) + 1;
  const num2 = Math.floor(Math.random() * max) + 1;
  const op = ['+', '-', '*', '/'][Math.floor(Math.random() * 4)];
  const resultado = eval(`${num1} ${op} ${num2}`);
  const simbolo = op === '*' ? '×' : op === '/' ? '÷' : op;
  return { problema: `${num1} ${simbolo} ${num2}`, resultado };
};

export default {
  command: ['math', 'mates'],
  category: 'economy',
  description: 'Iniciar un juego de matemáticas.',
  before: async ({ msg, sock }) => {
    const juego = global.math[msg.chat];
    if (!juego?.juegoActivo) return;
    if (!msg.quoted || msg.quoted.id !== juego.msgId) return;
    const respuesta = parseFloat(msg.text?.trim());
    if (isNaN(respuesta)) return;
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const currency = (db.getSettings(botId)).currency || 'Monedas';
    if (respuesta === parseFloat(juego.resultado)) {
      const [min, max] = rewardRanges[juego.dificultad] || [800, 1500];
      const ganado = Math.floor(Math.random() * (max - min + 1)) + min;
      const u = db.getChatUser(msg.chat, msg.sender);
      db.setChatUser(msg.chat, msg.sender, 'coins', (u.coins || 0) + ganado);
      clearTimeout(juego.timer);
      delete global.math[msg.chat];
      await sock.reply(msg.chat, `「❀」Respuesta correcta.\n> Ganaste ¥${ganado.toLocaleString()} ${currency}`, msg);
    } else {
      juego.intentos += 1;
      if (juego.intentos >= 3) { clearTimeout(juego.timer); delete global.math[msg.chat]; await sock.reply(msg.chat, '「✎」Te quedaste sin intentos. Suerte a la próxima.', msg); }
      else await sock.reply(msg.chat, `「✎」Respuesta incorrecta, te quedan ${3 - juego.intentos} intentos.`, msg);
    }
    return true;
  },
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chat = db.getChat(msg.chat);
    if (chat.adminonly || !chat.economy) return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`);
    if (global.math[msg.chat]?.juegoActivo) return sock.reply(msg.chat, 'ꕥ Ya hay un juego activo. Espera a que termine.', msg);
    const u = db.getChatUser(msg.chat, msg.sender);
    const remaining = (u.lastmath || 0) - Date.now();
    if (remaining > 0) return sock.reply(msg.chat, `ꕥ Debes esperar *${msToTime(remaining)}* para volver a jugar.`, msg);
    const dificultad = args[0]?.toLowerCase();
    if (!limits[dificultad]) return sock.reply(msg.chat, `「✎」Especifica una dificultad válida: *facil, medio, dificil, imposible, imposible2*`, msg);
    const { problema, resultado } = generarProblema(dificultad);
    const [min, max] = rewardRanges[dificultad];
    db.setChatUser(msg.chat, msg.sender, 'lastmath', Date.now() + 60 * 1000);
    const sent = await sock.reply(msg.chat, `「✩」Tienes 1 minuto para resolver:\n\n> ✩ *${problema}*\n\n> ✿ *Premio ›* ¥${min.toLocaleString()} – ¥${max.toLocaleString()}\n\n_✐ Cita este mensaje con el número correcto._`, msg);
    global.math[msg.chat] = {
      juegoActivo: true, problema, resultado: resultado.toString(), intentos: 0, dificultad, msgId: sent?.key?.id,
      timer: setTimeout(() => { if (global.math[msg.chat]?.juegoActivo) { delete global.math[msg.chat]; sock.reply(msg.chat, `「✿」Tiempo agotado. La respuesta era *${resultado}*.`, msg); } }, 60 * 1000)
    };
  }
};

function msToTime(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}