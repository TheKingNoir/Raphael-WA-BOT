import fetch from 'node-fetch'

export default {
  command: ['tiktok', 'tt'],
  category: 'downloads',
  description: 'Buscar y descargar un video de TikTok.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    if (!args.length) return msg.reply('《✧》 Por favor, ingresa un término de búsqueda o enlace de TikTok.')
    const text = args.join(' ')
    const isUrl = /tiktok\.com\/[^\s]+/i.test(text)
    const onlyAudio = /-audio\b|-mp3\b/.test(text)
    const cleanText = text.replace(/\s*-audio\b|\s*-mp3\b/g, '').trim()
    try {
      if (isUrl) {
        const data = await getTikTokData(cleanText)
        if (!data) return msg.reply('《✧》 Enlace inválido o sin contenido descargable.')        
        if (onlyAudio) {
          const audioUrl = await getTikTokAudio(cleanText)
          if (!audioUrl) return msg.reply('《✧》 No se pudo obtener el audio de este video.')
          await sock.sendMessage(msg.chat, { audio: { url: audioUrl }, mimetype: 'audio/mp4', fileName: 'tiktok_audio.mp4' }, { quoted: msg })
          await msg.react('✔️')
          return
        }        
        const caption = buildCaption(data)
        if (data.type === 'image') {
          const medias = data.images.map(url => ({ type: 'image', data: { url }, caption }))
          await sock.sendAlbumMessage(msg.chat, medias, { quoted: msg })
          const audioUrl = await getTikTokAudio(cleanText)
          if (audioUrl) {
            await sock.sendMessage(msg.chat, { audio: { url: audioUrl }, mimetype: 'audio/mp4', fileName: 'tiktok_audio.mp4' }, { quoted: msg })
          }
        } else {
          await sock.sendMessage(msg.chat, { video: { url: data.url }, caption }, { quoted: msg })
        }
        await msg.react('✔️')
      } else {
        if (onlyAudio) return msg.reply('《✧》 El flag -audio/-mp3 solo funciona con enlaces directos de TikTok.')
        const results = await searchTikTok(cleanText)
        if (!results.length) return msg.reply('《✧》 No se encontraron resultados en TikTok.')
        const medias = results.slice(0, 10).map(v => ({ type: 'video', data: { url: v.url }, caption: buildCaption(v) }))
        await sock.sendAlbumMessage(msg.chat, medias, { quoted: msg })
        await msg.react('✔️')
      }
    } catch (e) {
      await msg.react('✖️')
      await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`)
    }
  },
}

function buildCaption(v) {
  return `ㅤ۟∩　ׅ　★ ໌　ׅ　🅣𝗂𝗄𝖳𝗈𝗄 🅓ownload　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ✎  ׄ ⬭ *Título:* ${v.title || 'Sin título'}\n𖣣ֶㅤ֯⌗ ꕥ  ׄ ⬭ *Autor:* ${v.author || 'Desconocido'}\n𖣣ֶㅤ֯⌗ ⴵ  ׄ ⬭ *Duración:* ${v.duration ?? 'N/A'}\n𖣣ֶㅤ֯⌗ ❖  ׄ ⬭ *Likes:* ${(v.likes || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ❀  ׄ ⬭ *Comentarios:* ${(v.comments || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ✿  ׄ ⬭ *Vistas:* ${(v.views || 0).toLocaleString()}\n𖣣ֶㅤ֯⌗ ☆  ׄ ⬭ *Compartidos:* ${(v.shares || 0).toLocaleString()}`.trim()
}

async function fetchTimeout(url, ms = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal }).then(r => r.json())
  } finally {
    clearTimeout(timer)
  }
}

async function getTikTokData(url) {
  const apis = [
    { endpoint: `${global.APIs.yuki.url}/dl/tiktok?url=${encodeURIComponent(url)}&key=${global.APIs.yuki.key}`, extractor: (res) => {
        const d = res?.data
        if (!res.status || !d?.dl) return null
        const stats = d.stats || {}
        const common = { title: d.title || null, author: d.author?.nickname ? `${d.author.nickname} (@${d.author.unique_id})` : null, duration: d.duration || null, likes: stats.likes ?? null, comments: stats.comments ?? null, views: stats.views ?? stats.plays ?? null, shares: stats.shares ?? null }
        if (d.type === 'image' && Array.isArray(d.dl)) {
          return { type: 'image', images: d.dl, ...common }
        }
        return { type: 'video', url: Array.isArray(d.dl) ? d.dl[0] : d.dl, ...common }
      }
    },
    { endpoint: `${global.APIs.yuki.url}/dl/tiktokv2?url=${encodeURIComponent(url)}&key=${global.APIs.yuki.key}`, extractor: (res) => {
        if (!res.status || !Array.isArray(res.data)) return null
        const best = res.data.find(x => x.type === 'nowatermark_hd') || res.data.find(x => x.type === 'nowatermark') || res.data[0]
        if (!best?.url) return null
        return { type: 'video', url: best.url, title: res.title || null, author: res.author?.nickname ? `${res.author.nickname} (@${res.author.fullname})` : null, duration: res.duration || null, likes: Number(res.stats?.likes) || null, comments: Number(res.stats?.comment) || null, views: Number(res.stats?.views) || null, shares: Number(res.stats?.share) || null }
      }
    }
  ]
  for (const { endpoint, extractor } of apis) {
    try {
      const res = await fetchTimeout(endpoint)
      const result = extractor(res)
      if (result) {
        if (result.type === 'image') {
          const audio = await getTikTokAudio(url)
          if (audio) result.audio = audio
        }
        return result
      }
    } catch {}
  }
  return null
}

async function getTikTokAudio(url) {
  try {
    const res = await fetchTimeout(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`)
    return res?.data?.play || null
  } catch {
    return null
  }
}

async function searchTikTok(query) {
  const endpoint = `${global.APIs.yuki.url}/search/tiktok?query=${encodeURIComponent(query)}&key=${global.APIs.yuki.key}`
  try {
    const res = await fetchTimeout(endpoint)
    if (!res.status || !Array.isArray(res.data)) return []
    return res.data.map(v => ({ url: v.dl, title: v.title || null, author: v.author?.nickname ? `${v.author.nickname} (@${v.author.unique_id})` : null, duration: v.duration || null, likes: v.stats?.likes ?? null, comments: v.stats?.comments ?? null, views: v.stats?.views ?? null, shares: v.stats?.shares ?? null })).filter(v => v.url)
  } catch {
    return []
  }
}
