import db from '#db';
export default {
  command: ['setbotname', 'setname'],
  category: 'socket',
  description: 'Cambiar el nombre del bot.',
  run: async ({ msg, sock, args, usedPrefix, command, isROwner }) => {
    if (!isROwner) return msg.reply(global.mess.socket);
    const idBot = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const value = args.join(' ').trim();
    if (!value) return msg.reply(`✐ Debes escribir un nombre corto y un nombre largo valido.\n> Ejemplo: *${usedPrefix + command} Raphael / Raphael Bot*`);
    const formatted = value.replace(/\s*\/\s*/g, '/');
    let [short, long] = formatted.includes('/') ? formatted.split('/') : [value, value];
    if (!short || !long) return msg.reply('✎ Usa el formato: Nombre Corto / Nombre Largo');
    if (/\s/.test(short)) return msg.reply('❖ El nombre corto no puede contener espacios.');
    db.setSettings(idBot, 'namebot', short.trim());
    db.setSettings(idBot, 'botname', long.trim());
    return msg.reply(`✿ El nombre del bot ha sido actualizado!\n\n❒ Nombre corto: *${short.trim()}*\n❒ Nombre largo: *${long.trim()}*`);
  },
};