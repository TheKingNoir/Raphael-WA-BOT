import db from '#db';
export default {
  command: ['setbotcurrency', 'setcurrency'],
  category: 'socket',
  description: 'Cambiar la moneda del bot.',
  run: async ({ msg, sock, args, usedPrefix, command, isROwner }) => {
    if (!isROwner) return msg.reply(global.mess.socket);
    const idBot = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const value = args.join(' ').trim();
    if (!value) return msg.reply(`✐ Debes escribir un nombre de moneda valido.\n> Ejemplo: *${usedPrefix + command} Coins*`);
    db.setSettings(idBot, 'currency', value);
    return msg.reply(`✿ Se ha cambiado la moneda del bot a *${value}*`);
  },
};