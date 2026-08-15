import fetch from 'node-fetch'

export default {
  command: ['drive', 'gdrive'],
  category: 'downloads',
  description: 'Descargar un archivo de Google Drive.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    if (!args[0]) {
      return msg.reply('《✧》 Por favor, ingresa un link de Google Drive.')
    }
    const url = args[0]
    if (!url.match(/drive\.google\.com\/(file\/d\/|open\?id=|uc\?id=)/)) {
      return msg.reply('《✧》 La URL no parece válida de Google Drive.')
    }
    try {
      const result = await resolveDrive(url)
      const caption = `۟　ꕥ ᩧ　𓈒　ׄ　𝖦oogle 𝖣𝗋𝗂𝗏𝖾　ׅ　✿۟\n\n ׄ ﹙ׅ☆﹚ּ *Nombre* › ${result.fileName}\n ׄ ﹙ׅ☆﹚ּ *Tamaño* › ${formatBytes(result.size)}\n ׄ ﹙ׅ☆﹚ּ *Tipo* › ${result.mimetype}\n\n𖣣ֶㅤ֯⌗ ☆  ⬭ *Enlace* › ${url}`
      await sock.sendMessage(msg.chat, { document: { url: result.downloadUrl }, mimetype: result.mimetype, fileName: result.fileName, caption }, { quoted: msg })
    } catch (e) {
      return msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`)
    }
  }
}

function formatBytes(bytes) {
  if (!bytes) return 'Desconocido'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(2)} ${units[i]}`
}

function getDriveId(url = '') {
  return String(url).match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]+)/)?.[1] || ''
}

async function resolveDrive(url) {
  const id = getDriveId(url)
  if (!id) throw new Error('No se encontró el ID del archivo.')
  const endpoint = `https://drive.google.com/uc?export=download&id=${id}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  let response
  try {
    response = await fetch(endpoint, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' }, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) throw new Error(`Google Drive respondió ${response.status}.`)
  const disposition = response.headers.get('content-disposition') || ''
  const utfName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const basicName = disposition.match(/filename="?([^";]+)"?/i)?.[1]
  const fileName = decodeURIComponent(utfName || basicName || `drive-${id}`)
  const size = Number(response.headers.get('content-length') || 0)
  const mimetype = response.headers.get('content-type') || 'application/octet-stream'
  if (/text\/html/i.test(mimetype)) {
    const html = await response.text()
    const confirm = html.match(/confirm=([0-9A-Za-z_-]+)/)?.[1]
    if (!confirm) throw new Error('El archivo es privado, excedió el límite de Drive o necesita confirmación manual.')
    return { downloadUrl: `https://drive.google.com/uc?export=download&confirm=${confirm}&id=${id}`, fileName, size, mimetype: 'application/octet-stream' }
  }
  return { downloadUrl: response.url, fileName, size, mimetype }
}
