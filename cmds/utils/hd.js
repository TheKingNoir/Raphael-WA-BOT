import fileTypePkg from 'file-type'
const { fileTypeFromBuffer } = fileTypePkg

export default {
  command: ['hd', 'enhance', 'remini'],
  category: 'utils',
  description: 'Mejorar la calidad de una imagen (2x).',
  run: async ({ msg, sock, usedPrefix, command, text }) => {
    try {
      const q = msg.quoted || msg
      const mime = q?.content?.mimetype || ''
      if (!mime) return msg.reply(`《✧》 Responde a una *imagen* con: *${usedPrefix + command} [art|photo]*`)
      if (!/^image\/(jpe?g|png|webp)$/i.test(mime)) return msg.reply(`《✧》 El formato *${mime}* no es compatible`)
      const style = (text || '').trim().toLowerCase() === 'photo' ? 'photo' : 'art'
      const buffer = await q.download?.()
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 10) return msg.reply('《✧》 No se pudo descargar la imagen')
      if (buffer.length > 5 * 1024 * 1024) return msg.reply(`《✧》 La imagen pesa *${(buffer.length / 1048576).toFixed(2)} MB*, el límite es de *5 MB*.`)
      const ft = await safeFileType(buffer)
      const resolvedMime = ft?.mime || mime
      if (!/^image\/(jpe?g|png|webp)$/i.test(resolvedMime)) return msg.reply(`《✧》 El formato *${resolvedMime}* no es compatible`)
      await msg.react('🕒')
      const resultUrl = await upscale(buffer, style)
      const outBuffer = await downloadResult(resultUrl)
      await sock.sendMessage(msg.chat, { image: outBuffer, caption: `ꕥ *Imagen mejorada 2x (${style})*\n> ${(outBuffer.length / 1048576).toFixed(2)} MB` }, { quoted: msg })
      await msg.react('✔️')
    } catch (e) {
      await msg.react('✖️')
      return msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  }
}

async function safeFileType(buf) {
  try {
    return await fileTypeFromBuffer(buf)
  } catch {
    return null
  }
}

function pageHeaders(extra = {}) {
  const origin = 'https://bigjpg.com'
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
  return { accept: '*/*', origin, referer: `${origin}/`, 'user-agent': ua, 'x-requested-with': 'XMLHttpRequest', ...extra }
}

async function upscale(imgBuffer, style) {
  const origin = 'https://bigjpg.com'
  const filename = 'image_' + Date.now() + '.png'
  const signRes = await fetch(`${origin}/api/sign_upload`, { method: 'POST', headers: pageHeaders({ 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' }), body: new URLSearchParams({ filename, filetype: 'image/png' }).toString() })
  const sign = await signRes.json()
  if (sign?.status !== 'ok' || !sign.url) throw new Error('no se pudo firmar la subida')
  const putRes = await fetch(sign.url, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: imgBuffer })
  if (!putRes.ok) throw new Error(`subida a OSS rechazada (HTTP ${putRes.status})`)
  const conf = { x2: '1', style, noise: '1', file_name: filename, files_size: imgBuffer.length, file_height: 0, file_width: 0, input: sign.fileurl }
  const taskRes = await fetch(`${origin}/task`, { method: 'POST', headers: pageHeaders({ 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' }), body: new URLSearchParams({ conf: JSON.stringify(conf) }).toString() })
  const task = await taskRes.json()
  const fid = task?.info
  if (task?.status !== 'ok' || !fid) throw new Error(task?.info || 'no se creó la tarea')
  for (let i = 0; i < 60; i++) {
    await sleep(3000)
    const url = `${origin}/free?fids=${encodeURIComponent(JSON.stringify([fid]))}&_=${Date.now()}`
    const res = await fetch(url, { headers: pageHeaders() })
    if (!res.ok) continue
    let data = null
    try { data = await res.json() } catch { continue }
    const entry = data?.[fid]
    if (!Array.isArray(entry)) continue
    const [estado, link] = entry
    if (estado === 'success' && link) return link
    if (estado === 'error' || estado === 'fail') throw new Error('la conversión falló')
  }
  throw new Error('la conversión tardó demasiado')
}

async function downloadResult(url) {
  const origin = 'https://bigjpg.com'
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
  const res = await fetch(url, { headers: { referer: `${origin}/`, 'user-agent': ua }, redirect: 'follow' })
  if (!res.ok) throw new Error(`no se pudo descargar el resultado (HTTP ${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 1024) throw new Error('resultado inválido')
  return buf
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}
