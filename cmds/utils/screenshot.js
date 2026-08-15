export default {
  command: ['ss', 'screenshot', 'web'],
  category: 'utils',
  description: 'Captura una página web.',
  run: async ({ msg, sock, text, usedPrefix, command }) => {
    if (!text) return sock.reply(msg.chat, `《✧》 Ingresa el link de una página.\n> Ejemplo: *${usedPrefix + command} https://google.com*`, msg);
    const url = text.startsWith('http') ? text : `https://${text}`;
    await sock.sendMessage(msg.chat, { image: { url: `https://image.thum.io/get/width/1200/crop/800/fullpage/${url}` }, caption: `「✿」Captura lista.\n\n> URL: ${url}` }, { quoted: msg });
  }
};