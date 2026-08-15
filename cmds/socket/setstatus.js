import db from '#db';
export default {
  command: ['setstatus'],
  category: 'socket',
  description: 'Cambiar el estado del bot.',
  run: async ({ msg, sock, args, usedPrefix, command, isROwner }) => {
    if (!isROwner) return msg.reply(global.mess.socket);
    const value = args.join(' ').trim();
    if (!value) return msg.reply(`✐ Debes escribir un estado valido.\n> Ejemplo: *${usedPrefix + command} Hola! soy Raphael*`);
    await sock.updateProfileStatus(value);
    return msg.reply(`✿ Se ha actualizado el estado del bot a *${value}*!`);
  },
};