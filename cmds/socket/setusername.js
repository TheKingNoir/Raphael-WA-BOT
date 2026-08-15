import db from '#db';
export default {
  command: ['setusername'],
  category: 'socket',
  description: 'Cambiar el nombre de usuario del bot.',
  run: async ({ msg, sock, args, usedPrefix, command, isROwner }) => {
    if (!isROwner) return msg.reply(global.mess.socket);
    const value = args.join(' ').trim();
    if (!value) return msg.reply(`✎ Debes escribir un nombre de usuario valido.\n> Ejemplo: *${usedPrefix + command} Raphael*`);
    await sock.updateProfileName(value);
    return msg.reply(`✿ El nombre de usuario del bot ha sido actualizado a *${value}*!`);
  },
};