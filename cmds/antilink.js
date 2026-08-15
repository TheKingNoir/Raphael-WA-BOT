import db from '#db';
const linkRegex = /(https?:\/\/)?(chat\.whatsapp\.com\/[0-9A-Za-z]{20,24}|whatsapp\.com\/channel\/[0-9A-Za-z]{20,24})/i;

function extractFullText(msg) {
  const message = msg?.message;
  if (!message) return msg.text || '';
  const types = ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'buttonsResponseMessage', 'listResponseMessage', 'templateButtonReplyMessage'];
  for (const t of types) {
    if (!message[t]) continue;
    const content = message[t];
    if (typeof content === 'string') return content;
    const text = content.text || content.caption || content.selectedDisplayText || '';
    if (text) return text;
  }
  return msg.text || '';
}

export async function before({ msg, sock, groupMetadata, participants, isAdmins, isBotAdmins }) {
  const text = extractFullText(msg);
  if (!msg.isGroup || !text) return;
  if (msg.isBot) return;
  if (!groupMetadata) return;
  const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
  const chat = db.getChat(msg.chat) || {};
  const settings = db.getSettings(botId) || {};
  const isSelf = settings.self ?? false;
  if (isSelf) return;
  const isGroupLink = linkRegex.test(text);
  const hasAllowedLink = global.links?.channel && text.includes(global.links.channel);
  const command = (msg.command || '').toLowerCase();
  if (hasAllowedLink || !isGroupLink || !chat?.antilinks || isAdmins || !isBotAdmins) return;
  if (/chat\.whatsapp\.com\//i.test(text)) {
    const ownCode = await sock.groupInviteCode(msg.chat).catch(() => null);
    if (ownCode && text.includes(`chat.whatsapp.com/${ownCode}`)) return;
  }
  await sock.sendMessage(msg.chat, { delete: { remoteJid: msg.chat, fromMe: false, id: msg.key.id, participant: msg.key.participant }});
  if (command !== 'invite') {
    const isChannelLink = /whatsapp\.com\/channel\//i.test(text);
    const user = db.getUser(msg.sender);
    const userName = user?.name || 'Usuario';
    await sock.reply(msg.chat, `> ꕥ Se ha eliminado a *${userName}* del grupo por \`Anti-Link\`, no permitimos enlaces de *${isChannelLink ? 'canales' : 'otros grupos'}*.`, null);
    await sock.groupParticipantsUpdate(msg.chat, [msg.sender], 'remove');
  }
}
