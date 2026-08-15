import fetch from 'node-fetch'
import db from '#db';

export default {
  command: ['instagram', 'ig', 'reel'],
  category: 'downloads',
  description: 'Descargar un reel de Instagram.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net'
    const settings = db.getSettings(botId) || {}
    if (!args[0]) {
      return msg.reply('《✧》 Por favor, ingrese un enlace de Instagram.')
    }
    if (!args[0].match(/instagram\.com\/(p|reel|share|tv|stories)\//)) {
      return msg.reply('《✧》 El enlace no parece *válido*. Asegúrate de que sea de *Instagram*.')
    }
    try {
      const data = await getInstagramMedia(args[0])
      if (!data) return msg.reply('《✧》 No se pudo obtener el contenido.')
      const caption = `ㅤ۟∩　ׅ　★ ໌　ׅ　🅘𝖦 🅓ownload　ׄᰙ\n\n${data.title ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Usuario* › ${data.title}\n` : ''}${data.caption ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Descripción* › ${data.caption}\n` : ''}${data.like ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Likes* › ${data.like}\n` : ''}${data.comment ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Comentarios* › ${data.comment}\n` : ''}${data.views ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Vistas* › ${data.views}\n` : ''}${data.duration ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Duración* › ${data.duration}\n` : ''}${data.resolution ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Resolución* › ${data.resolution}\n` : ''}${data.format ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Formato* › ${data.format}\n` : ''}𖣣ֶㅤ֯⌗ ❀  ⬭ *Enlace* › ${args[0]}`
      if (data.type === 'video') {
        await sock.sendMessage(msg.chat, { video: { url: data.url }, caption, mimetype: 'video/mp4', fileName: 'ig.mp4' }, { quoted: msg })
      } else if (data.type === 'image') {
        await sock.sendMessage(msg.chat, { image: { url: data.url }, caption }, { quoted: msg })
      } else {
        throw new Error('Contenido no soportado.')
      }
    } catch (e) {
      await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`)
    }
  }
}

async function fetchTimeout(url, opts = {}, ms = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function getInstagramMedia(url) {
  const apis = [
    { endpoint: `${global.APIs.yuki.url}/dl/instagram?url=${encodeURIComponent(url)}&key=${global.APIs.yuki.key}`, extractor: (res) => {
        if (!res.status || !res.data || !res.data.length) return null
        const media = res.data[0]
        if (!media?.url) return null
        return { type: 'video', title: null, caption: null, resolution: null, format: 'mp4', url: media.url, thumbnail: media.thumbnail || null }
      }
    },
    { endpoint: `${global.APIs.evogb.url}/dl/instagram?url=${encodeURIComponent(url)}&key=${global.APIs.evogb.key}`, extractor: (res) => {
        if (!res.status || !res.data?.length) return null
        const media = res.data[0]
        if (!media?.url) return null
        return { type: media.type || 'video', title: null, caption: null, resolution: null, format: media.type === 'video' ? 'mp4' : 'jpg', url: media.url, thumbnail: media.thumbnail || null }
      }
    }
  ]

  for (const { endpoint, headers, extractor } of apis) {
    try {
      const res = await fetchTimeout(endpoint, headers ? { headers } : {}, 10000).then(r => r.json())
      const result = extractor(res)
      if (result) return result
    } catch (error) {
      continue
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return null
}
