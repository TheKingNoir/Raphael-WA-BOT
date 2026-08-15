import fetch from 'node-fetch';
import { getDevice, prepareWAMessageMedia } from 'baileys';
import moment from 'moment-timezone';
import { commands } from '#core/cmds';
import db from '#db';

const bodyMenu = `> ¡Hola! *@$sender*, Soy *$namebot* y aquí te dejo mi lista de comandos$cat ❥︎

╔ׄ─ְ─┅፝֟─ׅ━⃜─╱݃╳⵿╱⵿╲⵿╳݃╲─━ׅ⃜─፝֟┅─݄─ֺ╗
│</> *ᴅᴇᴠᴇʟᴏᴘᴇʀ ::* $owner
│☕︎ *ᴠᴇʀsɪᴏɴ ::* 1.0 - Latest
│𖢺 *sʏsᴛᴇᴍ/ᴏᴘʀ ::* $device
│○ *ᴛɪᴍᴇ ::* $tiempo, $tempo
│𓏸 *ᴜsᴇʀs ::* $users
│○ *ᴜʀʟ ::* $link
╚ֺ─ְ─┅፝֟─ׅ━⃜─╲݃╳⵿╲⵿╱⵿╳݃╱─━ׅ⃜─፝֟┅─݄─ֺ╝`;

const aliasMap = {
  economy: ['economy', 'economia', 'eco'],
  gacha: ['gacha', 'rpg'],
  downloads: ['downloads', 'descargas', 'dl'],
  profile: ['profile', 'perfil'],
  sockets: ['sockets', 'bots'],
  stickers: ['stickers', 'sticker'],
  utils: ['utils', 'utilidades', 'herramientas'],
  group: ['group', 'grupo'],
  nsfw: ['nsfw', '+18'],
  anime: ['anime', 'reacciones'],
};

function normalize(text = '') {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').replace(/s$/, '');
}

function buildCategorySection(cat, cmds, prefix) {
  const header = cmds.name;
  const desc = cmds.desc;
  let section = `╔═══ • ${header}• ═══ •☘︎• ══╗\n`;
  section += `> ✐ ${desc}\n`;
  for (const cmd of cmds.cmds) {
    const aliases = cmd.alias.map(a => `${prefix}${a}`).join(' › ');
    section += `➪ *${aliases}*${cmd.uso ? ` + ${cmd.uso}` : ''}\n`;
    section += `> ${cmd.desc}\n`;
  }
  section += `╚══ •☘︎• ══════ •☘︎• ══╝`;
  return section;
}

export default {
  command: ['allmenu', 'help', 'menu', 'ayuda'],
  category: 'main',
  description: 'Ver el menú de comandos.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const now = new Date();
      const colombianTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
      const tiempo = colombianTime.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/,/g, '');
      const tempo = moment.tz('America/Caracas').format('hh:mm A');
      const botId = sock?.user?.id.split(':')[0] + '@s.whatsapp.net';
      const botSettings = db.getSettings(botId) || {};
      const botname = botSettings.botname || '';
      const namebot = botSettings.namebot || '';
      const banner = botSettings.banner || '';
      const owner = botSettings.owner || '';
      const canalId = botSettings.newsletter_id || '';
      const canalName = botSettings.nameid || '';
      const prefix = botSettings.prefix;
      const link = botSettings.link || '';
      const users = db.getUser();
      const usersCount = users?.length || 0;
      const device = getDevice(msg.key.id);
      const userGlobal = db.getUser(msg.sender);
      const sender = userGlobal?.name || msg.pushName || 'Usuario';
      const time = sock.uptime ? formatearMs(Date.now() - sock.uptime) : 'Desconocido';
      const input = normalize(args[0] || '');
      const cat = Object.keys(aliasMap).find(k => aliasMap[k].map(normalize).includes(input));
      if (args[0] && !cat) {
        return msg.reply(`《✧》 La categoría *${args[0]}* no existe, las disponibles son: *${Object.keys(aliasMap).join(', ')}*.\n> Para ver todo escribe *${usedPrefix}menu*\n> Para ver una categoría escribe *${usedPrefix}menu [categoría]*\n> Ejemplo: *${usedPrefix}menu anime*`);
      }
      const category = cat ? ` para \`${cat}\`` : '. *(˶ᵔ ᵕ ᵔ˶)*';
      const content = cat ? buildCategorySection(cat, commands[cat], usedPrefix) : Object.entries(commands).map(([key, cmds]) => buildCategorySection(key, cmds, usedPrefix)).join('\n\n');
      let menu = bodyMenu + '\n\n' + content;
      const ownerDisplay = owner ? (!isNaN(Number(owner.replace(/@s\.whatsapp\.net$/, ''))) ? (db.getUser(owner))?.name || owner.split('@')[0] : owner) : 'Oculto por privacidad';
      const replacements = {
        $owner: ownerDisplay,
        $device: device,
        $tiempo: tiempo,
        $tempo: tempo,
        $users: usersCount.toLocaleString(),
        $link: link,
        $cat: category,
        $sender: sender,
        $botname: botname,
        $namebot: namebot,
        $prefix: usedPrefix,
        $uptime: time,
      };
      for (const [key, value] of Object.entries(replacements)) {
        menu = menu.replace(new RegExp(`\\${key}`, 'g'), value);
      }
      const isVideo = banner.includes('.mp4') || banner.includes('.webm');
      await sock.sendMessage(msg.chat, isVideo ? { video: { url: banner }, gifPlayback: true, caption: menu.trim(), contextInfo: { mentionedJid: [owner, msg.sender], isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: canalId, serverMessageId: '0', newsletterName: canalName } } } : { text: menu.trim(), linkPreview: link && banner ? (await prepareWAMessageMedia({ image: { url: banner } }, { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' }).then(({ imageMessage }) => ({ 'canonical-url': link, 'matched-text': link, title: botname, description: `mᥲძᥱ ᥕі𝗍һ ❤️ ᑲᥡ 𝗔̵⵿ܺ͟ꓤ࠘̈𝗘̸̶̿͞𝗦⃫̸⃜.  𝚯̶̷̸𖫲𝗟̶𝖨꯭̽ؓۜ𝗠⃫͇֣𝗣ۚ𝗨⃪̤𝖲̶ © ²⁰²⁶`, jpegThumbnail: imageMessage?.jpegThumbnail ? Buffer.from(imageMessage.jpegThumbnail) : undefined, highQualityThumbnail: imageMessage || undefined }))) : undefined, contextInfo: { mentionedJid: [owner, msg.sender], isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: canalId, serverMessageId: '0', newsletterName: canalName } } }, { quoted: msg });
    } catch (e) {
      await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  },
};

function formatearMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  return [d && `${d}d`, `${h % 24}h`, `${m % 60}m`, `${s % 60}s`].filter(Boolean).join(' ');
}