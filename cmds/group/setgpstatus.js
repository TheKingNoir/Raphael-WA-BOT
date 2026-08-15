export default {
  command: ['setgpstatus'],
  category: 'group',
  description: 'Publicar un estado en el grupo.',
  isAdmin: true,
  run: async ({ msg, sock, args, text, usedPrefix, command }) => {
    const q = msg.quoted || msg;
    const mime = (q.content || q).mimetype || q.mediaType || '';
    if (q?.key?.remoteJid?.endsWith('@newsletter')) {
      await sock.copyNForward(msg.chat, q.fakeObj, true);
      return msg.reply('✿ Estado del grupo publicado correctamente!');
    }
    const type = /image\/(png|jpe?g|gif)/.test(mime) ? 'image' : /video\/mp4/.test(mime) ? 'video' : /audio\//.test(mime) ? 'audio' : 'text';
    if (type === 'text' && !text) return msg.reply(`✐ Debes escribir un texto o citar una imagen/video/audio para publicar como estado del grupo.\n> Ejemplo: *${usedPrefix + command} Hola! soy Raphael -bg blue -tc white -font script*\n> Fuentes: sans, serif, script, hand, condensed, heavy`);
    if (type !== 'text') {
      const media = await q.download();
      if (!media) return msg.reply('✎ No se pudo descargar el archivo.');
      await sock.sendStatusMessage(msg.chat, { type, media, caption: text || (msg.quoted ? q.text : '') || '', ptt: false, audienceType: 2, listName: 'Mejores Amigos', listEmoji: '⭐' });
    } else {
      const bgColors = { black: 4278190080, white: 4294967295, red: 4294901760, blue: 4278190335, green: 4278222848, purple: 4286578816, pink: 4294951115, orange: 4294944000, yellow: 4294967040, gray: 4286611584 };
      const tcColors = { black: 4278190080, white: 4294967295, red: 4294901760, blue: 4278190335, green: 4278222848, purple: 4286578816, pink: 4294951115, orange: 4294944000, yellow: 4294967040, gray: 4286611584 };
      const fonts = { sans: 0, serif: 1, script: 2, hand: 3, condensed: 4, heavy: 5 };
      const bgIdx = args.findIndex(a => a === '-bg' || a.startsWith('-bg'));
      const bgArg = bgIdx !== -1 ? (args[bgIdx].replace('-bg', '').trim() || args[bgIdx + 1]?.trim().toLowerCase()) : null;
      const tcIdx = args.findIndex(a => a === '-tc' || a.startsWith('-tc'));
      const tcArg = tcIdx !== -1 ? (args[tcIdx].replace('-tc', '').trim() || args[tcIdx + 1]?.trim().toLowerCase()) : null;
      const fontIdx = args.findIndex(a => a === '-font' || a.startsWith('-font'));
      const fontArg = fontIdx !== -1 ? (args[fontIdx].replace('-font', '').trim() || args[fontIdx + 1]?.trim().toLowerCase()) : null;
      const backgroundArgb = bgColors[bgArg] ?? 4283453520;
      const textArgb = tcColors[tcArg] ?? 4292401368;
      const selectedFont = fonts[fontArg] ?? 5;
      const cleanText = text.replace(/-bg\s*\w*/g, '').replace(/-tc\s*\w*/g, '').replace(/-font\s*\w*/g, '').trim();
      await sock.sendStatusMessage(msg.chat, { type: 'text', text: cleanText || text, textArgb, backgroundArgb, font: selectedFont, audienceType: 2, listName: 'Mejores Amigos', listEmoji: '⭐' });
    }
    return msg.reply('✿ Estado del grupo publicado correctamente!');
  },
};