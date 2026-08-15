import yts from 'yt-search';
import fetch from 'node-fetch';
import { getBuffer } from '#serialize';
import sharp from 'sharp';

const isYTUrl = (url) => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url);
async function getVideoInfo(query, videoMatch) {
  const search = await yts(query);
  if (!search.all.length) return null;
  const videoInfo = videoMatch ? search.videos.find(v => v.videoId === videoMatch[1]) || search.all[0] : search.all[0];
  return videoInfo || null;
}

export default {
  command: ['play', 'musica', 'mp3', 'ytmp3', 'ytaudio', 'playaudio'],
  category: 'downloads',
  description: 'Descargar una canción de YouTube.',
  run: async ({ msg, sock, args, usedPrefix, command, text }) => {
    try {
      if (!args[0]) {
        return msg.reply('《✧》Por favor, menciona el nombre o URL del video que deseas descargar');
      }
      const text = args.join(' ');
      const videoMatch = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/))([a-zA-Z0-9_-]{11})/);
      const query = videoMatch ? 'https://youtu.be/' + videoMatch[1] : text;
      let url = query, title = null, thumbBuffer = null;
      try {
        const videoInfo = await getVideoInfo(query, videoMatch);
        if (videoInfo) {
          url = videoInfo.url;
          title = videoInfo.title;
          thumbBuffer = await getBuffer(videoInfo.image);
          const vistas = (videoInfo.views || 0).toLocaleString();
          const canal = videoInfo.author?.name || 'Desconocido';
          const infoMessage = `➩ Descargando › ${title}\n\n> ❖ Canal › *${canal}*\n> ⴵ Duración › *${videoInfo.timestamp || 'Desconocido'}*\n> ❀ Vistas › *${vistas}*\n> ✩ Publicado › *${videoInfo.ago || 'Desconocido'}*\n> ❒ Enlace › *${url}*`;
          await sock.sendMessage(msg.chat, { image: thumbBuffer, caption: infoMessage }, { quoted: msg });
        }
      } catch (err) {}
      const audio = await getAudioFromApis(url);
      if (!audio?.url) {
        return msg.reply('《✧》 No se pudo descargar el *audio*, intenta más tarde.');
      }
      const audioBuffer = await getBuffer(audio.url);
      const documento = Math.random() < 0.4;
      let mensaje;
      if (documento && thumbBuffer && title) {
        const thumbBuffer2 = await sharp(thumbBuffer).resize(300, 300).jpeg({ quality: 80 }).toBuffer();
        mensaje = { document: audioBuffer, mimetype: 'audio/mpeg', fileName: `${title || 'audio'}.mp3`, jpegThumbnail: thumbBuffer2 };
      } else {
        mensaje = { audio: audioBuffer, fileName: `${title || 'audio'}.mp3`, mimetype: 'audio/mpeg' };
      }
      await sock.sendMessage(msg.chat, mensaje, { quoted: msg });
    } catch (e) {
      await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  }
};

async function getAudioFromApis(url) {
  const apis = [
    { endpoint: `${global.APIs.yuki.url}/dl/youtubeplay?query=${encodeURIComponent(url)}&key=${global.APIs.yuki.key}`, extractor: (res) => res.status ? res.result?.dl : null },
    { endpoint: `${global.APIs.evogb.url}/dl/ytmp3?url=${encodeURIComponent(url)}&key=${global.APIs.evogb.key}`, extractor: (res) => res.status ? res.data?.dl : null },
    { endpoint: `${global.APIs.evogb.url}/dl/youtubeplay?query=${encodeURIComponent(url)}&type=audio&key=${global.APIs.evogb.key}`, extractor: (res) => res.status ? res.data?.dl : null },
    { endpoint: `${global.APIs.neoapis.url}/api/downloader/ytdl?url=${encodeURIComponent(url)}&type=mp3`, extractor: (res) => res.status ? res.data?.download : null }
  ];

  for (const { endpoint, headers, extractor } of apis) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(endpoint, { signal: controller.signal, headers }).then(r => r.json());
      clearTimeout(timeout);
      const link = extractor(res);
      if (link) return { url: link };
    } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return null;
}