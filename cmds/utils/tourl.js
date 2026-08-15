import axios from "axios"
import FormData from "form-data"
import db from '#db'

function formatBytes(bytes) {
  if (bytes === 0) return "0 B"
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`
}

function generateUniqueFilename(mime) {
  const ext = mime.split("/")[1] || "bin"
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  const id = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  return `${id}.${ext}`
}

const uploadCatbox = async (buffer, mime) => {
  const form = new FormData()
  form.append("reqtype", "fileupload")
  form.append("userhash", "c9bc208e83a7dbc7c7cc68aff")
  form.append("fileToUpload", buffer, { filename: generateUniqueFilename(mime) })
  const res = await axios.post("https://catbox.moe/user/api.php", form, { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity })
  if (typeof res.data !== "string" || !res.data.startsWith("https://"))
    throw new Error("Respuesta inválida de Catbox: " + JSON.stringify(res.data))
  return res.data
}

const uploadUguu = async (buffer, mime) => {
  const form = new FormData()
  form.append("files[]", buffer, generateUniqueFilename(mime))
  const res = await axios.post("https://uguu.se/upload.php", form, { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity })
  const url = res.data?.files?.[0]?.url
  if (!url) throw new Error("Respuesta inválida de Uguu: " + JSON.stringify(res.data))
  return url
}

const uploadQuax = async (buffer, mime) => {
  const form = new FormData()
  form.append("file", buffer, { filename: generateUniqueFilename(mime), contentType: mime })
  const res = await axios.post("https://qu.ax/upload.php", form, { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity })
  if (!res.data?.files?.[0]?.url)
    throw new Error("Respuesta inválida de Quax: " + JSON.stringify(res.data))
  return res.data.files[0].url
}

const uploadAuto = async (buffer, mime) => {
  for (const [fn, name] of [
    [() => uploadCatbox(buffer, mime), "catbox"],
    [() => uploadUguu(buffer, mime), "uguu"],
    [() => uploadQuax(buffer, mime), "quax"]
  ]) {
    try { return { link: await fn(), server: name } } catch {}
  }
  throw new Error("Todos los servidores fallaron")
}

export default {
  command: ['tourl'],
  category: 'utils',
  description: 'Convertir una imagen en un enlace.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const q = msg.quoted || msg
    const mime = (q.content || q).mimetype || ''
    if (!mime) {
      return sock.reply(msg.chat, `《✧》 Por favor, responde a una imagen o video con *${usedPrefix + command} [servidor]* para convertirlo en URL.\n\n✿ Servidores disponibles:\n> › catbox (permanente)\n> › quax (permanente)\n> › uguu (temporal, 3h)\n> › auto (selecciona automáticamente)`, msg)
    }
    try {
      const media = await q.download()
      if (!media) return sock.reply(msg.chat, "ꕥ No se pudo descargar el archivo.", msg)
      const serverArg = args[0]?.toLowerCase() || "catbox"
      const servers = {
        catbox: () => uploadCatbox(media, mime).then(link => ({ link, server: "catbox" })),
        uguu: () => uploadUguu(media, mime).then(link => ({ link, server: "uguu" })),
        quax: () => uploadQuax(media, mime).then(link => ({ link, server: "quax" })),
        auto: () => uploadAuto(media, mime)
      }
      if (!servers[serverArg]) return sock.reply(msg.chat, `ꕥ Servidor no válido. Usa: catbox, quax, uguu o auto`, msg)
      const { link, server } = await servers[serverArg]()
      const user = db.getUser(msg.sender)
      await sock.reply(msg.chat, `𖹭 ❀ *Upload To ${server.toUpperCase()}*\n\nׅ  ׄ  ✿   ׅ り *Link ›* ${link}\nׅ  ׄ  ✿   ׅ り *Peso ›* ${formatBytes(media.length)}\nׅ  ׄ  ✿   ׅ り *Tipo ›* ${mime.split("/")[1].toUpperCase() || "UNKNOWN"}\nׅ  ׄ  ✿   ׅ り *Solicitado por ›* ${user?.name || msg.pushName || 'Usuario'}`, msg);
    } catch (e) {
      await sock.reply(msg.chat, `> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`, msg);
    }
  }
}