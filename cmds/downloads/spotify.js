import fetch from "node-fetch";
import sharp from "sharp";
import { getBuffer } from "#serialize";
import db from '#db';

export default {
  command: ['spotify', 'sp'],
  category: 'downloads',
  description: 'Descargar una canción de Spotify.',
  run: async ({ msg, sock, usedPrefix, command, text }) => {
    try {
      if (!text.trim()) return sock.reply(msg.chat, '❀ Por favor, ingresa el nombre de la canción o artista.', msg)
      const isUrl = /https?:\/\/(open\.)?spotify\.com\/track\/[a-zA-Z0-9]+/.test(text)
      await msg.react('🕒')
      const query = isUrl ? text : text.trim()
      const track = isUrl ? { url: query } : await searchSpotify(query)
      if (!track?.url) return msg.reply('ꕥ No se encontraron resultados.')
      const info = await getSpotifyInfo(track.url)
      if (!info?.download) return msg.reply('⚠ No se pudo obtener el audio.')
      const data = { url: track.url, title: info.title || track.title, artist: info.artist || track.artist, album: info.album || track.album, duration: info.duration ?? track.duration ?? null, popularity: info.popularity ?? track.popularity ?? null, release: info.release || track.release, image: info.image || track.image, download: info.download, api: info.api }
      const durStr = (() => { const d = data.duration; if (!d) return null; if (typeof d === 'string' && d.includes(':')) return d; const secs = Math.floor(d / 1000); return `${Math.floor(secs/60)}:${(secs%60).toString().padStart(2,'0')}`; })()
      const caption = `「✦」Descargando *<${data.title}>*\n\n> ꕥ Autor › *${data.artist}*\n${data.album ? `> ❖ Álbum › *${data.album}*\n` : ''}${durStr ? `> ⴵ Duración › *${durStr}*\n` : ''}${data.popularity != null ? `> ❀ Popularidad › *${data.popularity}%*\n` : ''}${data.release ? `> ✩ Publicado › *${data.release}*\n` : ''}> ❒ Enlace › ${data.url}`
      const thumbBuffer = await getBuffer(data.image)
      await sock.sendMessage(msg.chat, { image: thumbBuffer, caption }, { quoted: msg })
      const audioBuffer = await getBuffer(info.download)
      const envio = Math.random() < 0.3
      let mensaje
      if (envio) {
        const thumbBuffer2 = await sharp(thumbBuffer).resize(300, 300).jpeg({ quality: 80 }).toBuffer()
        mensaje = { document: audioBuffer, mimetype: 'audio/mpeg', fileName: `${data.title}.mp3`, jpegThumbnail: thumbBuffer2 }
      } else {
        mensaje = { audio: audioBuffer, fileName: `${data.title}.mp3`, mimetype: 'audio/mpeg' }
      }
      await sock.sendMessage(msg.chat, mensaje, { quoted: msg })
      await msg.react('✔️')
    } catch (e) {
      await msg.react('✖️')
      return msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`)
    }
  }
}

async function searchSpotify(query) {
  const apis = [
    { endpoint: `${global.APIs.evogb.url}/search/spotify?query=${encodeURIComponent(query)}&key=${global.APIs.evogb.key}`, extractor: (res) => {
        if (!res.status || !Array.isArray(res.result) || !res.result.length) return null
        const r = res.result[0]
        return r?.link ? { url: r.link, title: r.title, artist: r.artist, album: null, duration: null, popularity: null, release: null, image: r.image } : null
      }
    }
  ]
  return await fetchFromApis(apis)
}

async function getSpotifyInfo(url) {
  const apis = [
    { endpoint: `${global.APIs.yuki.url}/dl/spotifyv2?url=${encodeURIComponent(url)}&key=${global.APIs.yuki.key}`, extractor: (res) => {
        const dl = res?.data?.dl?.mp3 || res?.data?.dl
        if (!res.status || !dl) return null
        const d = res.data
        return { title: d.title, artist: d.artist, album: d.album, image: d.coverHd || d.cover, duration: d.duration ?? null, popularity: null, release: d.year ?? null, download: dl }
      }
    },
    { endpoint: `${global.APIs.yuki.url}/dl/spotify?url=${encodeURIComponent(url)}&key=${global.APIs.yuki.key}`, extractor: (res) => {
        if (!res.status || !res.data?.mp3) return null
        const d = res.data
        return { title: d.name, artist: d.artist, album: d.album, image: d.cover, duration: d.duration ?? null, popularity: d.popularity ?? null, release: d.year ?? null, download: d.mp3 }
      }
    }
  ]
  return await fetchFromApis(apis)
}

async function fetchFromApis(apis) {
  for (const { endpoint, extractor } of apis) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(endpoint, { signal: controller.signal }).then(r => r.json())
      clearTimeout(timeout)
      const result = extractor(res)
      if (result) return result
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return null
}
