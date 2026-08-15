import db from '#db';

export default {
  command: ['addcoin', 'addcoins'],
  category: 'owner',
  description: 'Agregar coins a un usuario (owner).',
  isOwner: true,
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const botSettings = db.getSettings(botId);
    const monedas = botSettings.currency || 'coins';
    const who = msg.mentionedJid?.[0] || msg.quoted?.sender || null;
    const cantidadInput = args.find(a => /^\d+$/.test(a));
    const cantidad = cantidadInput ? parseInt(cantidadInput) : null;
    if (!who || !cantidad || cantidad <= 0) {
      return msg.reply(`ꕥ Debes mencionar/citar a un usuario y una cantidad válida.\n> Ejemplo » *${usedPrefix + command} @mencion 5000*\n> Ejemplo » *${usedPrefix + command} 5000 @mencion*\n> También puedes citar un mensaje del usuario.`);
    }
    const targetData = db.getChatUser(chatId, who);
    const newCoins = (targetData.coins || 0) + cantidad;
    db.setChatUser(chatId, who, 'coins', newCoins);
    const userData = db.getUser(who);
    const name = userData?.name || who.split('@')[0];
    await sock.sendMessage(chatId, { text: `❀ Se agregaron *¥${cantidad.toLocaleString()} ${monedas}* a *${name}*\n> Ahora tiene *¥${newCoins.toLocaleString()} ${monedas}* en su cartera.`, mentions: [who] }, { quoted: msg });
  }
};
