import db from '#db';
export default {
  command: ['setchannel', 'setbotchannel'],
  category: 'socket',
  description: 'Cambiar el canal del bot.',
  run: async ({ msg, sock, args, usedPrefix, command, isROwner }) => {
    if (!isROwner) return msg.reply(global.mess.socket);
    const idBot = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    let config = db.getSettings(idBot) || {};
    const value = args.join(' ').trim();
    if (!value) {
      return msg.reply(`❀ Ingresa el enlace de un canal de WhatsApp.\n\nEjemplo:\n*${usedPrefix + command}* https://whatsapp.com/channel/XXXXXXXXXXXXXX`);
    }
    const channelUrl = value.match(/(?:https:\/\/)?(?:www\.)?(?:chat\.|wa\.)?whatsapp\.com\/channel\/([0-9A-Za-z]{22,24})/i)?.[1];
    if (!channelUrl) return msg.reply('ꕥ El enlace proporcionado no es válido.');
    const info = await sock.newsletterMetadata("invite", channelUrl);
    if (!info) return msg.reply('ꕥ No se pudo obtener información del canal.');
    config.nameid = info.thread_metadata?.name?.text || "Canal sin nombre";
    db.setSettings(idBot, 'newsletter_id', info.id);
    db.setSettings(idBot, 'nameid', info.thread_metadata?.name?.text || "Canal sin nombre");
    return msg.reply(`❀ Se cambió el canal del Socket a *"${config.nameid}"* correctamente.`);
  },
};
