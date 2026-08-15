import yts from 'yt-search';
import fetch from 'node-fetch';
import { getBuffer } from '#serialize';
import sharp from 'sharp';

const isYTUrl = (url) => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url);

export default {
  command: ['play2', 'mp4', 'ytmp4', 'ytvideo', 'playvideo'],
  category: 'downloads',
  description: 'Descargar un vídeo de YouTube.',
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
        const search = await yts(query);
        if (search.all.length) {
          const videoInfo = videoMatch ? search.videos.find(v => v.videoId === videoMatch[1]) || search.all[0] : search.all[0];
          if (videoInfo) {
            url = videoInfo.url;
            title = videoInfo.title;
            thumbBuffer = await getBuffer(videoInfo.image);
            const vistas = (videoInfo.views || 0).toLocaleString();
            const canal = videoInfo.author?.name || 'Desconocido';
            const infoMessage = `➩ Descargando › *${title}*\n\n> ❖ Canal › *${canal}*\n> ⴵ Duración › *${videoInfo.timestamp || 'Desconocido'}*\n> ❀ Vistas › *${vistas}*\n> ✩ Publicado › *${videoInfo.ago || 'Desconocido'}*\n> ❒ Enlace › *${url}*`;
            await sock.sendMessage(msg.chat, { image: thumbBuffer, caption: infoMessage }, { quoted: msg });
          }
        }
      } catch (err) {}
      const video = await getVideoFromApis(url);
      if (!video?.url) {
        return msg.reply('《✧》 No se pudo descargar el *video*, intenta más tarde.');
      }
      const videoBuffer = await getBuffer(video.url);
      const enviarComoDocumento = Math.random() < 0.4;
      let mensaje;
      if (enviarComoDocumento && thumbBuffer && title) {
        const thumbBuffer2 = await sharp(thumbBuffer).resize(300, 300).jpeg({ quality: 80 }).toBuffer();
        mensaje = { document: videoBuffer, mimetype: 'video/mp4', fileName: `${title}.mp4`, jpegThumbnail: thumbBuffer2 };
      } else {
        mensaje = { video: videoBuffer, fileName: `${title || 'video'}.mp4`, mimetype: 'video/mp4' };
      }
      await sock.sendMessage(msg.chat, mensaje, { quoted: msg });
    } catch (e) {
      await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  }
};

async function getVideoFromApis(url) {
  const apis = [
    { endpoint: `${global.APIs.evogb.url}/dl/ytmp4?url=${encodeURIComponent(url)}&quality=480&key=${global.APIs.evogb.key}`, extractor: (res) => res.status ? res.data?.dl : null },
    { endpoint: `${global.APIs.evogb.url}/dl/youtubeplay?query=${encodeURIComponent(url)}&type=video&quality=480&key=${global.APIs.evogb.key}`, extractor: (res) => res.status ? res.data?.dl : null },
    { endpoint: `${global.APIs.neoapis.url}/api/downloader/ytdl?url=${encodeURIComponent(url)}&type=mp4`, extractor: (res) => res.status ? res.data?.download : null }
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