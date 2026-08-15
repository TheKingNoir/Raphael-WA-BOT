import db from '#db';

global.ahorcado = global.ahorcado || {};
const words = { animales: ['perro', 'gato', 'elefante', 'tigre', 'delfin', 'aguila', 'serpiente', 'conejo', 'leopardo', 'tortuga'], frutas: ['manzana', 'naranja', 'sandia', 'platano', 'fresa', 'mango', 'pera', 'uva', 'papaya', 'kiwi'], paises: ['mexico', 'colombia', 'argentina', 'brasil', 'chile', 'peru', 'cuba', 'españa', 'japon', 'canada'], deportes: ['futbol', 'tenis', 'natacion', 'boxeo', 'ciclismo', 'voleibol', 'beisbol', 'golf', 'rugby', 'ajedrez'], colores: ['rojo', 'azul', 'verde', 'amarillo', 'morado', 'naranja', 'rosado', 'blanco', 'negro', 'dorado'], comida: ['pizza', 'sushi', 'tacos', 'hamburgesa', 'paella', 'lasaña', 'ramen', 'ceviche', 'empanada', 'arepa'], tecnologia: ['computadora', 'celular', 'internet', 'satelite', 'robot', 'pantalla', 'teclado', 'impresora', 'servidor', 'antena'] };
const categoryHints = { animales: 'Es un animal del reino Animalia', paises: 'Es un país del mundo', frutas: 'Es una fruta comestible', tecnologia: 'Está relacionado con la tecnología', deportes: 'Es un deporte o disciplina física', colores: 'Es un color o tonalidad', comida: 'Es un plato o alimento típico' };
const gallows = [`  ┌──┐\n  │\n  │\n  │\n  │\n──┘`, `  ┌──┐\n  │  O\n  │\n  │\n  │\n──┘`, `  ┌──┐\n  │  O\n  │  │\n  │\n  │\n──┘`, `  ┌──┐\n  │  O\n  │ \\│\n  │\n  │\n──┘`, `  ┌──┐\n  │  O\n  │ \\│/\n  │\n  │\n──┘`, `  ┌──┐\n  │  O\n  │ \\│/\n  │  │\n  │\n──┘`, `  ┌──┐\n  │  O\n  │ \\│/\n  │  │\n  │ / \\\n──┘`];

const buildDisplay = (game) => game.word.split('').map(c => game.guessed.has(c) ? `*${c.toUpperCase()}*` : '＿').join(' ');
const isWon = (game) => game.word.split('').every(c => game.guessed.has(c));
const livesBar = (v) => '♥'.repeat(v) + '♡'.repeat(6 - v);
const randomLoss = () => Math.floor(Math.random() * (1800 - 800 + 1)) + 800;

const applyLoss = (chatId, jid, amount) => {
  const u = db.getChatUser(chatId, jid);
  const total = (u.coins || 0) + (u.bank || 0);
  if (total <= 0) return 0;
  const loss = Math.min(amount, total);
  if ((u.coins || 0) >= loss) { db.setChatUser(chatId, jid, 'coins', (u.coins || 0) - loss); }
  else { const rest = loss - (u.coins || 0); db.setChatUser(chatId, jid, 'coins', 0); db.setChatUser(chatId, jid, 'bank', Math.max(0, (u.bank || 0) - rest)); }
  return loss;
};

const resolveHint = (game) => {
  const base = categoryHints[game.category] ?? `Categoría: ${game.category}`;
  if (game.hintsUsed === 1) { game.guessed.add(game.word[0]); return `${base}\n> Primera letra: *${game.word[0].toUpperCase()}*`; }
  if (game.hintsUsed === 2) { const l = game.word.at(-1); game.guessed.add(l); return `${base}\n> Última letra: *${l.toUpperCase()}*`; }
  const hidden = game.word.split('').filter(c => !game.guessed.has(c));
  if (!hidden.length) return `${base}\n> No quedan letras por revelar.`;
  const reveal = hidden[Math.floor(Math.random() * hidden.length)];
  game.guessed.add(reveal);
  return `${base}\n> Letra revelada: *${reveal.toUpperCase()}*`;
};

export default {
  command: ['ahorcado', 'hangman'],
  category: 'economy',
  description: 'Jugar al ahorcado en el grupo.',
  before: async ({ msg, sock }) => {
    const game = global.ahorcado[msg.chat];
    if (!game) return;
    if (!msg.quoted || !game.msgIds.has(msg.quoted.id)) return;
    const text = (msg.text || '').toLowerCase().trim();
    if (!text || text.length > 20 || !/^[a-záéíóúüñ]+$/.test(text)) return;
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const currency = (db.getSettings(botId)).currency || 'Monedas';
    const send = async (content) => { const sent = await sock.reply(msg.chat, content, msg); if (sent?.key?.id) game.msgIds.add(sent.key.id); };
    if (['rendirse', 'cancelar', 'stop'].includes(text)) {
      const loss = applyLoss(msg.chat, msg.sender, randomLoss());
      clearTimeout(game.timer); delete global.ahorcado[msg.chat];
      await send(`「✿」Juego cancelado.\n\n> La palabra era: *${game.word.toUpperCase()}*\n> Perdiste ¥${loss.toLocaleString()} ${currency} por rendirte`);
      return true;
    }
    if (text === 'pista' || text === 'hint') {
      if (game.hintsUsed >= 3) { await send(`「✩」Pistas\n\nꕥ Ya usaste todas las pistas disponibles.\n\n${gallows[game.wrong.length]}\n\n${buildDisplay(game)}\n\n> Vidas: ${livesBar(6 - game.wrong.length)}`); return true; }
      game.hintsUsed++;
      await send(`「✩」Pista #${game.hintsUsed}\n\n${resolveHint(game)}\n\n${gallows[game.wrong.length]}\n\n${buildDisplay(game)}\n\n> Vidas: ${livesBar(6 - game.wrong.length)}\n> Pistas restantes: ${3 - game.hintsUsed}`);
      return true;
    }
    if (text.length > 1) {
      if (text === game.word) {
        const u = db.getChatUser(msg.chat, msg.sender);
        db.setChatUser(msg.chat, msg.sender, 'coins', (u.coins || 0) + 3000);
        clearTimeout(game.timer); delete global.ahorcado[msg.chat];
        await send(`「✿」¡Adivinaste la palabra!\n\n> Palabra: *${game.word.toUpperCase()}*\n> Ganaste ¥3,000 ${currency}`);
      } else {
        game.wrong.push(`[${text}]`);
        if (game.wrong.length >= 6) { const loss = applyLoss(msg.chat, msg.sender, randomLoss()); clearTimeout(game.timer); delete global.ahorcado[msg.chat]; await send(`${gallows[6]}\n\n「✎」Game Over\n\n> La palabra era: *${game.word.toUpperCase()}*\n> Perdiste ¥${loss.toLocaleString()} ${currency}`); }
        else await send(`${gallows[game.wrong.length]}\n\n*"${text.toUpperCase()}"* no es la palabra.\n\n${buildDisplay(game)}\n\n> Intentos fallidos: ${game.wrong.join(', ')}\n> Vidas: ${livesBar(6 - game.wrong.length)}`);
      }
      return true;
    }
    if (game.guessed.has(text)) { await send(`ꕥ Ya enviaste la letra *${text.toUpperCase()}*`); return true; }
    game.guessed.add(text);
    if (game.word.includes(text)) {
      if (isWon(game)) { const u = db.getChatUser(msg.chat, msg.sender); db.setChatUser(msg.chat, msg.sender, 'coins', (u.coins || 0) + 3000); clearTimeout(game.timer); delete global.ahorcado[msg.chat]; await send(`「✿」¡Completaste la palabra!\n\n> Palabra: *${game.word.toUpperCase()}*\n> Ganaste ¥3,000 ${currency}`); return true; }
      await send(`${gallows[game.wrong.length]}\n\nLa letra *${text.toUpperCase()}* está en la palabra.\n\n${buildDisplay(game)}\n\n> Fallidas: ${game.wrong.join(', ') || 'ninguna'}\n> Vidas: ${livesBar(6 - game.wrong.length)}\n> Pistas: escribe *pista* _(${3 - game.hintsUsed} restantes)_`);
      return true;
    }
    game.wrong.push(text.toUpperCase());
    if (game.wrong.length >= 6) { const loss = applyLoss(msg.chat, msg.sender, randomLoss()); clearTimeout(game.timer); delete global.ahorcado[msg.chat]; await send(`${gallows[6]}\n\n「✎」Game Over\n\n> La palabra era: *${game.word.toUpperCase()}*\n> Perdiste ¥${loss.toLocaleString()} ${currency}`); return true; }
    await send(`${gallows[game.wrong.length]}\n\nLa letra *${text.toUpperCase()}* no está en la palabra.\n\n${buildDisplay(game)}\n\n> Fallidas: ${game.wrong.join(', ')}\n> Vidas: ${livesBar(6 - game.wrong.length)}\n> Pistas: escribe *pista* _(${3 - game.hintsUsed} restantes)_`);
    return true;
  },
  run: async ({ msg, sock }) => {
    if (global.ahorcado[msg.chat]) return sock.reply(msg.chat, `「✩」Ahorcado\n\nꕥ Ya hay un juego activo en este chat.\n_Cita cualquier mensaje del juego y escribe *rendirse* para cancelar._`, msg);
    const u = db.getChatUser(msg.chat, msg.sender);
    const remaining = (u.lastahorcado || 0) - Date.now();
    if (remaining > 0) return sock.reply(msg.chat, `ꕥ Debes esperar *${msToTime(remaining)}* para volver a jugar.`, msg);
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const currency = (db.getSettings(botId)).currency || 'Monedas';
    const cats = Object.keys(words);
    const catName = cats[Math.floor(Math.random() * cats.length)];
    const word = words[catName][Math.floor(Math.random() * words[catName].length)];
    const game = { word, category: catName, guessed: new Set(), wrong: [], hintsUsed: 0, msgIds: new Set(), timer: null, starter: msg.sender };
    db.setChatUser(msg.chat, msg.sender, 'lastahorcado', Date.now() + 60 * 1000);
    game.timer = setTimeout(async () => {
      if (!global.ahorcado[msg.chat]) return;
      const loss = applyLoss(msg.chat, game.starter, randomLoss());
      delete global.ahorcado[msg.chat];
      await sock.reply(msg.chat, `「✎」Tiempo agotado.\n\n> La palabra era: *${word.toUpperCase()}*\n> Perdiste ¥${loss.toLocaleString()} ${currency}`, msg);
    }, 3 * 60 * 1000);
    global.ahorcado[msg.chat] = game;
    const sent = await sock.sendMessage(msg.chat, { text: `${gallows[0]}\n\n「✩」Ahorcado — ¡Juego iniciado!\n\n> Categoría: *${catName}*\n> Letras: *${word.length}*\n> Vidas: ${livesBar(6)}\n> Premio: ¥3,000\n> Pistas: cita este mensaje y escribe *pista* _(3 disponibles)_\n\n${buildDisplay(game)}\n\n_Cita cualquier mensaje del juego con una letra o la palabra completa._\n_Tiempo: 3 min · escribe *rendirse* para cancelar_` }, { quoted: msg });
    if (sent?.key?.id) game.msgIds.add(sent.key.id);
  },
};

function msToTime(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}