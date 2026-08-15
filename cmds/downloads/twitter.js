import fetch from 'node-fetch'

export default {
  command: ['twitter', 'x'],
  category: 'downloads',
  description: 'Descargar un video/imagen de Twitter/X.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    if (!args[0]) {
      return msg.reply('《✧》 Por favor, ingrese un enlace de Twitter/X.')
    }
    if (!args[0].match(/(twitter|x)\.com\/\w+\/status\//)) {
      return msg.reply('《✧》 El enlace no parece válido. Asegúrate de que sea de Twitter/X.')
    }
    try {
      const data = await getTwitterMedia(args[0])
      if (!data) return msg.reply('《✧》 No se pudo obtener el contenido.')
      const caption = `ㅤ۟∩　ׅ　★ ໌　ׅ　🅣witter 🅓ownload　ׄᰙ\n\n${data.title ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Título* › ${data.title}\n` : ''}${data.author ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Autor* › ${data.author}\n` : ''}${data.date ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Fecha* › ${data.date}\n` : ''}${data.duration ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Duración* › ${data.duration}\n` : ''}${data.resolution ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Resolución* › ${data.resolution}\n` : ''}${data.views ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Vistas* › ${data.views}\n` : ''}${data.likes ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Likes* › ${data.likes}\n` : ''}${data.comments ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Comentarios* › ${data.comments}\n` : ''}${data.retweets ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Retweets* › ${data.retweets}\n` : ''}𖣣ֶㅤ֯⌗ ❀  ⬭ *Enlace* › ${args[0]}`
      if (data.type === 'video') {
        await sock.sendMessage(msg.chat, { video: { url: data.url }, caption, mimetype: 'video/mp4', fileName: 'twitter.mp4' }, { quoted: msg })
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

async function getTwitterMedia(url) {
  const apis = [
    { endpoint: `${global.APIs.yuki.url}/dl/twitter?url=${encodeURIComponent(url)}&key=${global.APIs.yuki.key}`, extractor: (res) => {
        if (!res.status || !res.data?.result?.length) return null
        const hd = res.data.result.find(x => x.quality === '1920p' || x.quality === '1280p')
        const sd = res.data.result.find(x => x.quality === '852p' || x.quality === '568p')
        const media = hd || sd || res.data.result[0]
        if (!media?.url) return null
        return { type: res.data.type || 'video', title: res.data.title || null, duration: res.data.duration || null, resolution: media.quality || null, url: media.url, thumbnail: res.data.thumbnail || null }
      }
    },
    { endpoint: `${global.APIs.siputzx.url}/api/d/twitter?url=${encodeURIComponent(url)}`, extractor: (res) => {
        if (!res.status || !res.data?.downloadLink) return null
        return { type: 'video', title: res.data.videoTitle || null, url: res.data.downloadLink, thumbnail: res.data.imgUrl || null }
      }
    },
    { endpoint: `${global.APIs.evogb.url}/dl/twitter?url=${encodeURIComponent(url)}&key=${global.APIs.evogb.key}`, extractor: (res) => {
        if (!res.status || !res.data?.result?.length) return null
        const hd = res.data.result.find(x => x.quality === '1920p' || x.quality === '1280p')
        const sd = res.data.result.find(x => x.quality === '852p' || x.quality === '568p')
        const media = hd || sd || res.data.result[0]
        if (!media?.url) return null
        return { type: res.data.type || 'video', title: res.data.title || null, duration: res.data.duration || null, resolution: media.quality || null, url: media.url, thumbnail: res.data.thumbnail || null }
      }
    },
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
