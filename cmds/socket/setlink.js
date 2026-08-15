import db from '#db';
export default {
  command: ['setlink', 'setbotlink'],
  category: 'socket',
  description: 'Cambiar el enlace del bot.',
  run: async ({ msg, sock, args, isROwner }) => {
    if (!isROwner) return msg.reply(global.mess.socket);
    const idBot = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const config = db.getSettings(idBot) || {};
    const value = args.join(' ').trim()
    if (!value) {
      return msg.reply(`✿ Por favor, Ingresa un enlace válido que comience con http:// o https://`)
    }
    if (!/^https?:\/\//i.test(value)) {
      return msg.reply('ꕥ El enlace debe comenzar con http:// o https://')
    }
    config.link = value
    db.setSettings(idBot, 'link', config.link)
    return msg.reply(`✎ Se cambió el enlace del Socket correctamente.`)
  },
};
