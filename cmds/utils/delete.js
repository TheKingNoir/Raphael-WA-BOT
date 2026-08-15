import { areJidsSameUser } from 'baileys';
import db from '#db';

export default {
  command: ['del', 'delete'],
  category: 'utils',
  description: 'Eliminar un mensaje.',
  run: async ({ msg, sock, isAdmins, isBotAdmins }) => {
    if (!msg.quoted) {
      return sock.reply(msg.chat, `《✧》 Por favor, cita el mensaje que deseas eliminar.`, msg);
    }
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const botSettings = db.getSettings(botJid) || {};
    const botname = botSettings.namebot || 'Bot';
    const isBotMessage = msg.quoted.fromMe;
    const hasmark = (msg.quoted.text || msg.quoted.body || '').includes('\u206c');
    if (isBotMessage) {
      if (hasmark && !isAdmins) return sock.reply(msg.chat, `《✧》 No puedes eliminar el mensaje citado.`, msg);
    } else {
      if (!isAdmins)    return sock.reply(msg.chat, `《✧》 Debes ser administrador para eliminar mensajes de otros usuarios.`, msg);
      if (!isBotAdmins) return sock.reply(msg.chat, `《✧》 *${botname}* debe ser administrador para eliminar ese mensaje.`, msg);
    }
    return sock.sendMessage(msg.quoted.chat, { delete: { remoteJid: msg.quoted.chat, fromMe: isBotAdmins ? false : true, id: msg.quoted.id, participant: msg.quoted.sender } });
  }
};
