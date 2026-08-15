export default {
  command: ['fakereply', 'fake', 'fitnah'],
  category: 'utils',
  description: 'Enviar un mensaje con una respuesta falsa de alguien.',
  run: async ({ msg, sock, text, usedPrefix, command }) => {
    if (!text) return sock.reply(msg.chat, `《✧》 Uso: *${usedPrefix + command}* _texto falso_ @${msg.sender.split('@')[0]} tu texto\n> Ejemplo: *${usedPrefix + command}* @${msg.sender.split('@')[0]} Hola buenas`, msg, { mentions: [msg.sender] });
    const mentionMatch = text.match(/@\S+/);
    let who = msg.mentionedJid?.[0];
    if (!who && mentionMatch) {
      const digits = mentionMatch[0].slice(1).replace(/\D/g, '');
      if (digits) who = digits + '@s.whatsapp.net';
    }
    if (!who) who = msg.isGroup ? null : msg.chat;
    if (!who) return sock.reply(msg.chat, `《✧》 Menciona a alguien para simular su respuesta.`, msg);
    let fakeText, realText;
    if (mentionMatch) {
      fakeText = text.slice(0, mentionMatch.index).trimEnd();
      realText = text.slice(mentionMatch.index + mentionMatch[0].length).trimStart();
    } else {
      fakeText = '';
      realText = text.trim();
    }
    if (!realText) return sock.reply(msg.chat, `《✧》 Escribe tu respuesta después de la mención.`, msg);
    try {
      const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const quoted = { key: { fromMe: who === botJid, participant: who, ...(msg.isGroup ? { remoteJid: msg.chat } : {}) }, message: { conversation: fakeText } };
      const extraMentions = realText.match(/@(\d+)/g)?.map(m => m.slice(1) + '@s.whatsapp.net') || [];
      await sock.sendMessage(msg.chat, { text: realText, mentions: extraMentions }, { quoted });
    } catch (e) {
      await msg.react('✖️');
      await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  },
};
