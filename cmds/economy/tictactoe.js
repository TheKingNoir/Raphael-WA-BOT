import db from '#db';

class TicTacToe {
  constructor(playerX = 'x', playerO = 'o') {
    this.playerX = playerX;
    this.playerO = playerO;
    this._currentTurn = false;
    this._x = 0;
    this._o = 0;
    this.turns = 0;
  }
  get board() { return this._x | this._o; }
  get currentTurn() { return this._currentTurn ? this.playerO : this.playerX; }
  get enemyTurn() { return this._currentTurn ? this.playerX : this.playerO; }
  static check(state) {
    for (let combo of [7, 56, 73, 84, 146, 273, 292, 448])
      if ((state & combo) === combo) return true;
    return false;
  }
  static toBinary(x = 0, y = 0) {
    if (x < 0 || x > 2 || y < 0 || y > 2) throw new Error('invalid position');
    return 1 << x + (3 * y);
  }
  turn(player = 0, x = 0, y) {
    if (this.board === 511) return -3;
    let pos = 0;
    if (y == null) {
      if (x < 0 || x > 8) return -1;
      pos = 1 << x;
    } else {
      if (x < 0 || x > 2 || y < 0 || y > 2) return -1;
      pos = TicTacToe.toBinary(x, y);
    }
    if (this._currentTurn ^ player) return -2;
    if (this.board & pos) return 0;
    this[this._currentTurn ? '_o' : '_x'] |= pos;
    this._currentTurn = !this._currentTurn;
    this.turns++;
    return 1;
  }
  static render(boardX = 0, boardO = 0) {
    let x = parseInt(boardX.toString(2), 4);
    let y = parseInt(boardO.toString(2), 4) * 2;
    return [...(x + y).toString(4).padStart(9, '0')].reverse().map((v, i) => v == 1 ? 'X' : v == 2 ? 'O' : ++i);
  }
  render() { return TicTacToe.render(this._x, this._o); }
  get winner() { return TicTacToe.check(this._x) ? this.playerX : TicTacToe.check(this._o) ? this.playerO : false; }
}

global.ttt = global.ttt || {};
const cells = { X: '❎', O: '⭕', 1: '1️⃣', 2: '2️⃣', 3: '3️⃣', 4: '4️⃣', 5: '5️⃣', 6: '6️⃣', 7: '7️⃣', 8: '8️⃣', 9: '9️⃣' };
const turnErrors = { '-3': 'ꕥ El juego ya terminó.', '-2': 'ꕥ No es tu turno.', '-1': 'ꕥ Posición inválida, usa del 1 al 9.', 0: 'ꕥ Esa posición ya está ocupada.' };

const renderBoard = (game) => game.render().map(v => cells[String(v)]).reduce((rows, cell, i) => { if (i % 3 === 0) rows.push([]); rows.at(-1).push(cell); return rows; }, []).map(r => r.join('')).join('\n');
const closeRoom = (roomId) => { clearTimeout(global.ttt[roomId]?.timer); delete global.ttt[roomId]; };
const giveCoins = (chatId, jid, amount) => { const u = db.getChatUser(chatId, jid); db.setChatUser(chatId, jid, 'coins', (u.coins || 0) + amount); };
const applyLoss = (chatId, jid, amount) => {
  const u = db.getChatUser(chatId, jid);
  const total = (u.coins || 0) + (u.bank || 0);
  if (total <= 0) return 0;
  const loss = Math.min(amount, total);
  if ((u.coins || 0) >= loss) { db.setChatUser(chatId, jid, 'coins', (u.coins || 0) - loss); }
  else { const rest = loss - (u.coins || 0); db.setChatUser(chatId, jid, 'coins', 0); db.setChatUser(chatId, jid, 'bank', Math.max(0, (u.bank || 0) - rest)); }
  return loss;
};

export default {
  command: ['tictactoe', 'ttc', 'ttt', 'xo', 'delttt', 'delttc', 'delxo'],
  category: 'economy',
  description: 'Iniciar, unirse o abandonar una partida de TicTacToe.',
  before: async ({ msg, sock }) => {
    if (!global.ttt) return;
    const room = Object.values(global.ttt).find(r => r.state === 'PLAYING' && [r.game.playerX, r.game.playerO].includes(msg.sender));
    if (!room) return;
    const text = msg.text?.trim() ?? '';
    const isSurrender = /^(rendirse|surrender|cancelar)$/i.test(text);
    const isMove = /^[1-9]$/.test(text);
    if (!isSurrender && !isMove) return;
    let isWin = false, isTie = false;
    if (isSurrender) { room.game._currentTurn = msg.sender === room.game.playerX; isWin = true; }
    else {
      const result = room.game.turn(msg.sender === room.game.playerO ? 1 : 0, parseInt(text) - 1);
      if (result < 1) { await sock.reply(msg.chat, turnErrors[result] ?? 'ꕥ Error desconocido.', msg); return true; }
      if (room.game.winner) isWin = true;
      else if (room.game.board === 511) isTie = true;
    }
    if (!isWin && !isTie) { clearTimeout(room.timer); room.timer = setTimeout(async () => { if (!global.ttt[room.id]) return; await sock.reply(room.chat, `ꕥ La partida *${room.name}* se cerró por inactividad.`, room.msg); closeRoom(room.id); }, 5 * 60 * 1000); }
    const board = renderBoard(room.game);
    const winnerJid = isSurrender ? room.game.currentTurn : room.game.winner;
    const loserJid = winnerJid === room.game.playerX ? room.game.playerO : room.game.playerX;
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const currency = (db.getSettings(botId)).currency || 'Monedas';
    let header;
    if (isWin) {
      const actualLoss = applyLoss(room.chat, loserJid, Math.floor(Math.random() * (1200 - 500 + 1)) + 500);
      giveCoins(room.chat, winnerJid, 4000);
      header = `「✿」@${winnerJid.split('@')[0]} gana la partida.\n> +¥4,000 ${currency}\n> @${loserJid.split('@')[0]} pierde ¥${actualLoss.toLocaleString()} ${currency}`;
    } else if (isTie) {
      const tieBonus = Math.floor(Math.random() * (700 - 300 + 1)) + 300;
      giveCoins(room.chat, room.game.playerX, tieBonus);
      giveCoins(room.chat, room.game.playerO, tieBonus);
      header = `「✿」Empate.\n> Bonus de consolación: +¥${tieBonus.toLocaleString()} ${currency} a cada uno.`;
    } else header = `「✩」Turno de ${room.game._currentTurn ? '⭕' : '❎'} @${room.game.currentTurn.split('@')[0]}`;
    await sock.sendMessage(msg.chat, { text: `${header}\n\n${board}\n\n> ❎ *J1:* @${room.game.playerX.split('@')[0]}\n> ⭕ *J2:* @${room.game.playerO.split('@')[0]}`, mentions: [room.game.playerX, room.game.playerO] }, { quoted: msg });
    if (isWin || isTie) closeRoom(room.id);
    return true;
  },
  run: async ({ msg, sock, text, usedPrefix, command }) => {
    if (['delttt', 'delttc', 'delxo'].includes(command)) {
      const room = Object.values(global.ttt || {}).find(r => [r.game.playerX, r.game.playerO].includes(msg.sender));
      if (!room) return sock.reply(msg.chat, 'ꕥ No estás en ninguna partida de TicTacToe.', msg);
      closeRoom(room.id);
      return sock.reply(msg.chat, `「✿」Sesión *${room.name}* eliminada.`, msg);
    }
    if (!global.ttt) global.ttt = {};
    const enPartida = Object.values(global.ttt).find(r => [r.game.playerX, r.game.playerO].includes(msg.sender));
    if (enPartida) return sock.reply(msg.chat, `ꕥ Ya estás en una partida activa.\n> Usa *${usedPrefix}delttt* para abandonarla.`, msg);
    const u = db.getChatUser(msg.chat, msg.sender);
    const remaining = (u.lastttt || 0) - Date.now();
    if (remaining > 0) return sock.reply(msg.chat, `ꕥ Debes esperar *${msToTime(remaining)}* para volver a jugar.`, msg);
    if (!text?.trim()) return sock.reply(msg.chat, `《✧》 Indica un nombre de sala.\n> Ejemplo: *${usedPrefix + command} sala1*`, msg);
    const roomName = text.trim();
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const currency = (db.getSettings(botId)).currency || 'Monedas';
    const waiting = Object.values(global.ttt).find(r => r.state === 'WAITING' && r.name === roomName);
    if (waiting) {
      if (waiting.game.playerX === msg.sender) return sock.reply(msg.chat, 'ꕥ No puedes unirte a tu propia sala.', msg);
      waiting.game.playerO = msg.sender;
      waiting.state = 'PLAYING';
      db.setChatUser(msg.chat, msg.sender, 'lastttt', Date.now() + 60 * 1000);
      const sent = await sock.sendMessage(msg.chat, { text: `「✩」TicTacToe — Sala \`${roomName}\`\n\n${renderBoard(waiting.game)}\n\n❎ Turno de @${waiting.game.playerX.split('@')[0]}\n\n> ❎ *J1:* @${waiting.game.playerX.split('@')[0]}\n> ⭕ *J2:* @${waiting.game.playerO.split('@')[0]}\n> Premio: ¥4,000 ${currency} al ganador\n> Perdedor: -¥500 a -¥1,200 ${currency}\n\n_Escribe un número del 1 al 9 o *rendirse* para abandonar._`, mentions: [waiting.game.playerX, waiting.game.playerO] }, { quoted: msg });
      waiting.msg = sent;
      clearTimeout(waiting.timer);
      waiting.timer = setTimeout(async () => { if (!global.ttt[waiting.id]) return; await sock.reply(waiting.chat, `ꕥ La partida *${roomName}* se cerró por inactividad.`, waiting.msg); closeRoom(waiting.id); }, 5 * 60 * 1000);
    } else {
      const roomId = 'ttt-' + Date.now();
      const game = new TicTacToe(msg.sender, 'pending');
      db.setChatUser(msg.chat, msg.sender, 'lastttt', Date.now() + 60 * 1000);
      const sent = await sock.sendMessage(msg.chat, { text: `「✩」TicTacToe — Sala \`${roomName}\`\n\n❀ Esperando a un segundo jugador...\n\nÚnete con: *${usedPrefix + command} ${roomName}*\n\n> Premio: ¥4,000 ${currency} al ganador\n> Perdedor: -¥500 a -¥1,200 ${currency}` }, { quoted: msg });
      const timer = setTimeout(async () => { if (global.ttt?.[roomId]?.state !== 'WAITING') return; await sock.reply(msg.chat, `ꕥ La sala *${roomName}* expiró sin encontrar pareja.`, sent); closeRoom(roomId); }, 5 * 60 * 1000);
      global.ttt[roomId] = { id: roomId, name: roomName, chat: msg.chat, game, state: 'WAITING', msg: sent, timer };
    }
  },
};

function msToTime(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}