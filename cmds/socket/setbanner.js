import fs from 'fs'
import path from 'path'
import db from '#db'

const bannersDir = path.join(process.cwd(), 'core', 'banners')
if (!fs.existsSync(bannersDir)) fs.mkdirSync(bannersDir, { recursive: true })

function sanitizeBotId(idBot) {
  return idBot.replace(/[^a-zA-Z0-9]/g, '_')
}

function saveBannerLocally(idBot, buffer, mime) {
  const ext = (mime.split('/')[1] || 'bin').replace('jpeg', 'jpg')
  const baseName = sanitizeBotId(idBot)
  for (const file of fs.readdirSync(bannersDir)) {
    if (file.startsWith(`${baseName}.`)) fs.unlinkSync(path.join(bannersDir, file))
  }
  const filePath = path.join(bannersDir, `${baseName}.${ext}`)
  fs.writeFileSync(filePath, buffer)
  return filePath
}

export default {
  command: ['setbanner', 'setbotbanner'],
  category: 'socket',
  description: 'Cambiar el banner del menú.',
  run: async ({ msg, sock, args, isROwner }) => {
    if (!isROwner) return msg.reply(global.mess.socket);
    const idBot = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const config = db.getSettings(idBot) || {};
    const value = args.join(' ').trim()
    if (!value && !msg.quoted && !msg.message?.imageMessage && !msg.message?.videoMessage) {
      return msg.reply('✎ Debes enviar o citar una imagen o video para cambiar el banner del bot.')
    }
    if (value && value.startsWith('http')) {
      db.setSettings(idBot, 'banner', value)
      return msg.reply(`✿ Se ha actualizado el banner de *${config.namebot || 'Bot'}*!`)
    }
    const q = msg.quoted || msg
    const mime = (q.content || q).mimetype || q.mediaType || ''
    if (!/image\/(png|jpe?g|gif)|video\/mp4/.test(mime)) {
      return msg.reply('✎ Responde a una imagen válida.')
    }
    const media = await q.download()
    if (!media) return msg.reply('✎ No se pudo descargar la imagen.')
    const localPath = saveBannerLocally(idBot, media, mime)
    db.setSettings(idBot, 'banner', localPath)
    return msg.reply(`✿ Se ha actualizado el banner de *${config.namebot || 'Bot'}*!`)
  }
}