import db from '#db';

export default {
  command: ['delcoin', 'delcoins'],
  category: 'owner',
  description: 'Quitar coins a un usuario (owner).',
  isOwner: true,
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const botSettings = db.getSettings(botId);
    const monedas = botSettings.currency || 'coins';
    const who = msg.mentionedJid?.[0] || msg.quoted?.sender || null;
    const isAll = args.some(a => a.toLowerCase() === 'all');
    const cantidadInput = args.find(a => /^\d+$/.test(a));
    if (!who || (!isAll && !cantidadInput)) {
      return msg.reply(`ꕥ Debes mencionar/citar a un usuario y una cantidad válida o *all* para quitar todo.\n> Ejemplo » *${usedPrefix + command} @mencion 5000*\n> Ejemplo » *${usedPrefix + command} 5000 @mencion*\n> Ejemplo » *${usedPrefix + command} @mencion all*\n> También puedes citar un mensaje del usuario.`);
    }
    const targetData = db.getChatUser(chatId, who);
    const coins = targetData.coins || 0;
    const bank = targetData.bank || 0;
    const total = coins + bank;
    const cantidad = isAll ? total : Math.min(parseInt(cantidadInput), total);
    if (cantidad <= 0) {
      return msg.reply(`ꕥ Ese usuario no tiene *${monedas}* para quitarle.`);
    }
    let restante = cantidad;
    const fromCoins = Math.min(restante, coins);
    const newCoins = coins - fromCoins;
    restante -= fromCoins;
    const fromBank = Math.min(restante, bank);
    const newBank = bank - fromBank;
    db.setChatUser(chatId, who, 'coins', newCoins);
    db.setChatUser(chatId, who, 'bank', newBank);
    const userData = db.getUser(who);
    const name = userData?.name || who.split('@')[0];
    await sock.sendMessage(chatId, { text: `❀ Se quitaron *¥${cantidad.toLocaleString()} ${monedas}* a *${name}*\n> Cartera: *¥${newCoins.toLocaleString()} ${monedas}*\n> Banco: *¥${newBank.toLocaleString()} ${monedas}*`, mentions: [who] }, { quoted: msg });
  }
};
