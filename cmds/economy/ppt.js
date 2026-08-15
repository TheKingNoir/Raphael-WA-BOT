import db from '#db';

global.pptRetos  = global.pptRetos  || new Map();
global.pptDuelos = global.pptDuelos || new Map();

export default {
  command: ['ppt', 'pvp'],
  category: 'economy',
  description: 'Jugar piedra, papel o tijera con el bot o un usuario.',
  before: async ({ msg, sock }) => {
    const texto = (msg.text || '').toLowerCase().trim();
    const userId = msg.sender;
    if (['aceptar', 'rechazar'].includes(texto) && global.pptRetos.has(userId)) {
      const { retador, chat, apuesta, timeout } = global.pptRetos.get(userId);
      clearTimeout(timeout);
      const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const monedas = (db.getSettings(botId)).currency || 'Monedas';
      if (texto === 'rechazar') {
        global.pptRetos.delete(userId);
        await sock.sendMessage(chat, { text: `ꕥ @${userId.split('@')[0]} rechazó el reto.`, mentions: [userId, retador] });
        return true;
      }
      const uRival = db.getChatUser(chat, userId);
      if ((uRival.coins || 0) < apuesta) {
        global.pptRetos.delete(userId);
        await sock.sendMessage(chat, { text: `ꕥ @${userId.split('@')[0]} no tiene suficientes ${monedas} para aceptar el reto.\n> Se necesitan ¥${apuesta.toLocaleString()} ${monedas}`, mentions: [userId] });
        return true;
      }
      const uRetador = db.getChatUser(chat, retador);
      if ((uRetador.coins || 0) < apuesta) {
        global.pptRetos.delete(userId);
        await sock.sendMessage(chat, { text: `ꕥ El reto fue cancelado, @${retador.split('@')[0]} ya no tiene suficientes ${monedas}.\n> Se necesitan ¥${apuesta.toLocaleString()} ${monedas}`, mentions: [retador] });
        return true;
      }
      global.pptRetos.delete(userId);
      const dueloId = `${retador}-${userId}`;
      global.pptDuelos.set(dueloId, {
        jugadores: [retador, userId], chat, apuesta, eleccion: {},
        timeout: setTimeout(async () => { global.pptDuelos.delete(dueloId); await sock.sendMessage(chat, { text: `ꕥ El duelo expiró por inactividad.` }); }, 60000)
      });
      await sock.sendMessage(chat, { text: `ꕥ Reto aceptado.\n\n> ✿ Las jugadas serán enviadas por privado.\n> ✿ *Apuesta ›* ¥${apuesta.toLocaleString()} ${monedas}`, mentions: [retador, userId] });
      await sock.sendMessage(retador, { text: `ꕥ Duelo contra @${userId.split('@')[0]}\n\nEscribe tu jugada: *piedra*, *papel* o *tijera*`, mentions: [userId] });
      await sock.sendMessage(userId,   { text: `ꕥ Duelo contra @${retador.split('@')[0]}\n\nEscribe tu jugada: *piedra*, *papel* o *tijera*`, mentions: [retador] });
      return true;
    }
    const options = ['piedra', 'papel', 'tijera'];
    if (options.includes(texto)) {
      for (const [dueloId, partida] of global.pptDuelos) {
        if (!partida.jugadores.includes(userId)) continue;
        if (partida.eleccion[userId]) { await sock.sendMessage(userId, { text: `ꕥ Ya enviaste tu jugada. Espera el resultado.` }); return true; }
        partida.eleccion[userId] = texto;
        await sock.sendMessage(userId, { text: `ꕥ Jugada recibida. Espera el resultado.` });
        if (Object.keys(partida.eleccion).length < 2) return true;
        clearTimeout(partida.timeout);
        global.pptDuelos.delete(dueloId);
        const [j1, j2] = partida.jugadores;
        const j1play = partida.eleccion[j1], j2play = partida.eleccion[j2];
        const result = determineWinner(j1play, j2play);
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const monedas = (db.getSettings(botId)).currency || 'Monedas';
        if (result === 'tie') {
          const bonus = Math.floor(Math.random() * (Math.floor(partida.apuesta * 0.15) - Math.floor(partida.apuesta * 0.05) + 1)) + Math.floor(partida.apuesta * 0.05);
          const u1 = db.getChatUser(partida.chat, j1);
          const u2 = db.getChatUser(partida.chat, j2);
          db.setChatUser(partida.chat, j1, 'coins', (u1.coins || 0) + bonus);
          db.setChatUser(partida.chat, j2, 'coins', (u2.coins || 0) + bonus);
          await sock.sendMessage(partida.chat, { text: `ꕥ Empate.\n\n> ✿ *@${j1.split('@')[0]} ›* ${j1play}\n> ✿ *@${j2.split('@')[0]} ›* ${j2play}\n\n> ✿ Bonus de consolación: +¥${bonus.toLocaleString()} ${monedas} a cada uno.`, mentions: [j1, j2] });
        } else {
          const ganador = result === 'win' ? j1 : j2;
          const perdedor = ganador === j1 ? j2 : j1;
          const ug = db.getChatUser(partida.chat, ganador);
          const up = db.getChatUser(partida.chat, perdedor);
          const perdido = Math.min(partida.apuesta, (up.coins || 0) + (up.bank || 0));
          db.setChatUser(partida.chat, ganador, 'coins', (ug.coins || 0) + partida.apuesta);
          if ((up.coins || 0) >= perdido) { db.setChatUser(partida.chat, perdedor, 'coins', (up.coins || 0) - perdido); }
          else { const rest = perdido - (up.coins || 0); db.setChatUser(partida.chat, perdedor, 'coins', 0); db.setChatUser(partida.chat, perdedor, 'bank', Math.max(0, (up.bank || 0) - rest)); }
          await sock.sendMessage(partida.chat, { text: `ꕥ Resultado.\n\n> ✿ *@${j1.split('@')[0]} ›* ${j1play}\n> ✿ *@${j2.split('@')[0]} ›* ${j2play}\n\n> ✿ *@${ganador.split('@')[0]} gana ›* +¥${partida.apuesta.toLocaleString()} ${monedas}\n> ✿ *@${perdedor.split('@')[0]} pierde ›* -¥${perdido.toLocaleString()} ${monedas}`, mentions: [j1, j2] });
        }
        return true;
      }
    }
  },
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const chatData = db.getChat(chatId);
    if (chatData.adminonly || !chatData.economy) return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`);
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const botSettings = db.getSettings(botId);
    const monedas = botSettings.currency;
    const botname = botSettings.namebot;
    const user = db.getChatUser(chatId, msg.sender);
    const remainingTime = (user.lastppt || 0) - Date.now();
    if (remainingTime > 0) return msg.reply(`ꕥ Debes esperar *${msToTime(remainingTime)}* antes de jugar nuevamente.`);
    const rival = msg.mentionedJid?.[0] || msg.quoted?.sender || null;
    if (rival && rival !== msg.sender) {
      if (global.pptRetos.has(rival)) return sock.reply(chatId, `ꕥ Ese usuario ya tiene un reto pendiente.`, msg);
      const apuestaInput = parseInt(args.find(a => /^\d+$/.test(a)));
      if (isNaN(apuestaInput) || apuestaInput < 100) return sock.reply(chatId, `《✧》 Indica la apuesta.\n> Ejemplo: *${usedPrefix + command} @usuario 1000*`, msg);
      if ((user.coins || 0) < apuestaInput) return sock.reply(chatId, `ꕥ No tienes suficientes ${monedas} para apostar ¥${apuestaInput.toLocaleString()}.`, msg);
      global.pptRetos.set(rival, {
        retador: msg.sender, chat: chatId, apuesta: apuestaInput,
        timeout: setTimeout(async () => { global.pptRetos.delete(rival); await sock.sendMessage(chatId, { text: `ꕥ El reto a @${rival.split('@')[0]} expiró por falta de respuesta.`, mentions: [rival] }); }, 60000)
      });
      return sock.sendMessage(chatId, { text: `ꕥ @${msg.sender.split('@')[0]} desafía a @${rival.split('@')[0]}\n\n> ✿ *Apuesta ›* ¥${apuestaInput.toLocaleString()} ${monedas}\n> Escribe *aceptar* o *rechazar* respodiendo a este mensaje.`, mentions: [msg.sender, rival] }, { quoted: msg });
    }
    const options = ['piedra', 'papel', 'tijera'];
    const userChoice = args[0]?.trim().toLowerCase();
    if (!options.includes(userChoice)) return msg.reply(`《✧》 Usa el comando así:\n› *${usedPrefix + command} piedra*, *papel* o *tijera*\n› *${usedPrefix + command} @usuario 1000* para PvP`);
    const botChoice = options[Math.floor(Math.random() * options.length)];
    const result = determineWinner(userChoice, botChoice);
    let newCoins = user.coins || 0;
    let newBank = user.bank || 0;
    if (result === 'win') {
      const reward = Math.floor(Math.random() * (4500 - 2500 + 1)) + 2500;
      newCoins += reward;
      db.setChatUser(chatId, msg.sender, 'coins', newCoins);
      await sock.sendMessage(chatId, { text: `ꕥ Ganaste.\n\n> ✿ *Tu elección ›* ${userChoice}\n> ✿ *${botname} eligió ›* ${botChoice}\n> ✿ *${monedas} ›* +¥${reward.toLocaleString()}` }, { quoted: msg });
    } else if (result === 'lose') {
      const loss = Math.floor(Math.random() * (3500 - 2000 + 1)) + 2000;
      const total = newCoins + newBank;
      const actualLoss = Math.min(loss, total);
      if (newCoins >= actualLoss) { newCoins -= actualLoss; db.setChatUser(chatId, msg.sender, 'coins', newCoins); }
      else { const remaining = actualLoss - newCoins; newCoins = 0; newBank = Math.max(0, newBank - remaining); db.setChatUser(chatId, msg.sender, 'coins', 0); db.setChatUser(chatId, msg.sender, 'bank', newBank); }
      await sock.sendMessage(chatId, { text: `ꕥ Perdiste.\n\n> ✿ *Tu elección ›* ${userChoice}\n> ✿ *${botname} eligió ›* ${botChoice}\n> ✿ *${monedas} ›* -¥${actualLoss.toLocaleString()}` }, { quoted: msg });
    } else {
      const tieBonus = Math.floor(Math.random() * (600 - 200 + 1)) + 200;
      newCoins += tieBonus;
      db.setChatUser(chatId, msg.sender, 'coins', newCoins);
      await sock.sendMessage(chatId, { text: `ꕥ Empate.\n\n> ✿ *Tu elección ›* ${userChoice}\n> ✿ *${botname} eligió ›* ${botChoice}\n> ✿ *Bonus ›* +¥${tieBonus.toLocaleString()} ${monedas}` }, { quoted: msg });
    }
    db.setChatUser(chatId, msg.sender, 'lastppt', Date.now() + 60 * 1000);
  }
};

function determineWinner(user, bot) {
  if (user === bot) return 'tie';
  if ((user === 'piedra' && bot === 'tijera') || (user === 'papel' && bot === 'piedra') || (user === 'tijera' && bot === 'papel')) return 'win';
  return 'lose';
}

function msToTime(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}