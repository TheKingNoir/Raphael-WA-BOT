import fetch from 'node-fetch'

export default {
  command: ['pinterest', 'pin'],
  category: 'downloads',
  description: 'Buscar y descargar imágenes y videos de Pinterest.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const text = args.join(' ')
    const isUrl = /^https?:\/\//.test(text)
    if (!text) return msg.reply('《✧》 Por favor, ingresa un término de búsqueda o un enlace de Pinterest.')
    try {
      if (isUrl) {
        const data = await getPinDownload(text)
        if (!data) return msg.reply('ꕥ No se pudo obtener el contenido.')
        const caption = `ㅤ۟∩　ׅ　★　ׅ　🅟𝖨𝖭 🅓ownload　ׄᰙ　\n\n${line('Título', data.title)}${line('Autor', data.author)}${line('Usuario', data.username)}${line('Fecha', data.uploadDate)}𖣣ֶㅤ֯⌗ ☆  ⬭ *Enlace* › ${text}`
        if (data.type === 'video') {
          await sock.sendMessage(msg.chat, { video: { url: data.url }, caption, mimetype: 'video/mp4', fileName: 'pin.mp4' }, { quoted: msg })
        } else {
          await sock.sendMessage(msg.chat, { image: { url: data.url }, caption }, { quoted: msg })
        }
      } else {
        const results = await searchPins(text)
        if (!results.length) return msg.reply(`《✧》 No se encontraron resultados para *${text}*.`)
        const medias = results.slice(0, 10).map(r => ({
          type: 'image',
          data: { url: r.url },
          caption: `ㅤ۟∩　ׅ　★　ׅ　🅟𝖨𝖭 🅢earch　ׄᰙ　\n\n${line('Título', r.title)}${line('Autor', r.author)}${line('Usuario', r.username)}${line('Seguidores', r.followers)}${line('Likes', r.likes)}`
        }))
        await sock.sendAlbumMessage(msg.chat, medias, { quoted: msg })
      }
    } catch (e) {
      await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`)
    }
  }
}

const line = (label, val) => val ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *${label}* › ${val}\n` : ''

async function fetchTimeout(url, ms = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal }).then(r => r.json())
  } finally {
    clearTimeout(timer)
  }
}

async function getPinDownload(url) {
  const apis = [
    { endpoint: `${global.APIs.evogb.url}/dl/pinterest?url=${encodeURIComponent(url)}&key=${global.APIs.evogb.key}`, extractor: (res) => {
        if (!res.status || !res.data?.dl) return null
        const d = res.data
        return { type: d.type || 'image', url: d.dl, title: d.title, author: d.author, username: d.username, uploadDate: d.uploadDate }
      }
    }
  ]
  for (const { endpoint, extractor } of apis) {
    try {
      const res = await fetchTimeout(endpoint)
      const result = extractor(res)
      if (result) return result
    } catch {}
  }
  return null
}

async function searchPins(query) {
  const apis = [
    { endpoint: `${global.APIs.yuki.url}/search/pinterest?query=${encodeURIComponent(query)}&key=${global.APIs.yuki.key}`, extractor: (res) => {
        if (!res.status || !Array.isArray(res.data)) return []
        return res.data.map(p => ({ url: p.hd || p.mini, title: p.title && p.title !== '-' ? p.title : null, author: p.full_name || null, username: p.username || null, followers: p.followers ?? null, likes: p.likes ?? null }))
      }
    }
  ]
  for (const { endpoint, extractor } of apis) {
    try {
      const res = await fetchTimeout(endpoint)
      const results = extractor(res).filter(r => r.url)
      if (results.length) return results
    } catch {}
  }
  return []
}