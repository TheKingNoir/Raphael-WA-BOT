import { getUrlFromDirectPath } from 'baileys'
import _ from "lodash"

function formatParticipants(participants) {
  if (!participants || !participants.length) return "No encontrado";
  return participants.map((user, i) => `${i + 1}. @${user.id?.split("@")[0]}${user.admin === "superadmin" ? " (superadmin)" : user.admin === "admin" ? " (admin)" : ""}`).join("\n");
}

export default {
  command: ["inspect","inspeccionar"],
  category: "utils",
  description: 'Ver información de grupos y canales de WhatsApp.',
  run: async ({ msg, sock, args, usedPrefix, command, text, groupMetadata }) => {
    if (!text) {
      return sock.reply(msg.chat, `《✧》 Por favor, ingrese el enlace de grupo/comunidad o canal.`, msg);
    }
    let pp;
    let inviteCode;
    const channelUrl = text?.match(/(?:https:\/\/)?(?:www\.)?(?:chat\.|wa\.)?whatsapp\.com\/(?:channel\/|joinchat\/)?([0-9A-Za-z]{22,24})/i)?.[1];
    const MetadataGroupInfo = async (res) => {
      let nameCommunity = "";
      if (res.linkedParent) {
        let linkedGroupMeta = await sock.groupMetadata(res.linkedParent).catch(() => null);
        nameCommunity = linkedGroupMeta ? "`Nombre:` " + linkedGroupMeta.subject : "";
      }
      pp = await sock.profilePictureUrl(res.id, 'image').catch(() => null);
      inviteCode = await sock.groupInviteCode(msg.chat).catch(() => null);
      let caption = `\`☆ ⊹ ꕤ INFORMACIÓN DEL GRUPO ꕤ ⊹ ☆\`\n\n` +
        `𑁍ࠬܓ *Nombre* › ${res.subject || "No encontrado"}\n` +
        `𑁍ࠬܓ *Creado por* › ${res.owner ? `@${res.owner?.split("@")[0]}` : "No encontrado"} ${res.creation ? `el ${formatDate(res.creation)}` : "(Fecha no encontrada)"}\n` +
        `𑁍ࠬܓ *Nombre cambiado por* › ${res.subjectOwner ? `@${res.subjectOwner?.split("@")[0]}` : "No encontrado"} ${res.subjectTime ? `el ${formatDate(res.subjectTime)}` : "(Fecha no encontrada)"}\n` +
        `𑁍ࠬܓ *Autor* › ${res.author || "No encontrado"}\n` +
        `𑁍ࠬܓ *Usuarios en total* › ${res.size || "Cantidad no encontrada"}\n` +
        `\n\`☆ ⊹ ꕤ DESCRIPCIÓN ꕤ ⊹ ☆\`\n\n` +
        `${res.desc || "No encontrada"}\n\n` +
        `𑁍ࠬܓ *Descripción cambiada por* › ${res.descOwner ? `@${res.descOwner?.split("@")[0]}` : "No encontrado"}\n` +
        `𑁍ࠬܓ *Id de la descripción* › ${res.descId || "No encontrado"}\n` +
        `\n\`☆ ⊹ ꕤ ADMINISTRACIÓN ꕤ ⊹ ☆\`\n\n` +
        `𑁍ࠬܓ *Admins* › \n${formatParticipants(res.participants)}\n` +
        `\n\`☆ ⊹ ꕤ INFORMACIÓN AVANZADA ꕤ ⊹ ☆\`\n\n` +
        `𑁍ࠬܓ *Comunidad vinculada al grupo* › ${res.linkedParent ? "`Id:` " + res.linkedParent + (nameCommunity ? "\n" + nameCommunity : "") : res.isCommunity ? "Este grupo es una comunidad" : "No pertenece a ninguna comunidad"}\n` +
        `𑁍ࠬܓ *Restricciones* › ${res.restrict ? "Sí" : "No"}\n` +
        `𑁍ࠬܓ *Anuncios* › ${res.announce ? "Sí" : "No"}\n` +
        `𑁍ࠬܓ *¿Es comunidad?* › ${res.isCommunity ? "Sí" : "No"}\n` +
        `𑁍ࠬܓ *¿Es anuncio de comunidad?* › ${res.isCommunityAnnounce ? "Sí" : "No"}\n` +
        `𑁍ࠬܓ *Tiene aprobación de miembros* › ${res.joinApprovalMode ? "Sí" : "No"}\n` +
        `𑁍ࠬܓ *Puede agregar futuros miembros* › ${res.memberAddMode ? "Sí" : "No"}\n` +
        `\n\`☆ ⊹ ꕤ DATOS TÉCNICOS ꕤ ⊹ ☆\`\n\n` +
        `𑁍ࠬܓ *ID* › \`${res.id || "No encontrado"}\`\n` +
        `𑁍ࠬܓ *Imagen del grupo* › ${pp ? pp : "No se pudo obtener"}\n` +
        `𑁍ࠬܓ *Código de invitación* › ${res.inviteCode || inviteCode || "No disponible"}\n` +
        `𑁍ࠬܓ *Duración* › ${res.ephemeralDuration !== undefined ? `${res.ephemeralDuration} segundos` : "Desconocido"}\n`;
      return caption.trim();
    };
    const inviteGroupInfo = async (groupData) => {
      const { id, subject, subjectOwner, subjectTime, size, creation, owner, desc, descId, linkedParent, restrict, announce, isCommunity, isCommunityAnnounce, joinApprovalMode } = groupData;
      let nameCommunity = "";
      if (linkedParent) {
        let linkedGroupMeta = await sock.groupMetadata(linkedParent).catch(() => null);
        nameCommunity = linkedGroupMeta ? "`Nombre:` " + linkedGroupMeta.subject : "";
      }
      pp = await sock.profilePictureUrl(id, 'image').catch(() => null);
      let caption = `\`☆ ⊹ ꕤ INFORMACIÓN DEL GRUPO ꕤ ⊹ ☆\`\n\n` +
        `𑁍ࠬܓ *Nombre* › ${subject || "No encontrado"}\n` +
        `𑁍ࠬܓ *Creado por* › ${owner ? `@${owner?.split("@")[0]}` : "No encontrado"} ${creation ? `el ${formatDate(creation)}` : "(Fecha no encontrada)"}\n` +
        `𑁍ࠬܓ *Nombre cambiado por* › ${subjectOwner ? `@${subjectOwner?.split("@")[0]}` : "No encontrado"} ${subjectTime ? `el ${formatDate(subjectTime)}` : "(Fecha no encontrada)"}\n` +
        `𑁍ࠬܓ *Destacados total* › ${size || "Cantidad no encontrada"}\n` +
        `\n\`☆ ⊹ ꕤ DESCRIPCIÓN ꕤ ⊹ ☆\`\n\n` +
        `${desc || "No encontrada"}\n\n` +
        `𑁍ࠬܓ *ID de la descripción* › ${descId || "No encontrado"}\n` +
        `\n\`☆ ⊹ ꕤ MIEMBROS DESTACADOS ꕤ ⊹ ☆\`\n\n` +
        `𑁍ࠬܓ *Miembros* › \n${formatParticipants(groupData.participants)}\n` +
        `\n\`☆ ⊹ ꕤ INFORMACIÓN AVANZADA ꕤ ⊹ ☆\`\n\n` +
        `𑁍ࠬܓ *Comunidad vinculada al grupo* › ${linkedParent ? "`Id:` " + linkedParent + (nameCommunity ? "\n" + nameCommunity : "") : isCommunity ? "Este grupo es una comunidad" : "No pertenece a ninguna comunidad"}\n` +
        `𑁍ࠬܓ *Anuncios* › ${announce ? "Sí" : "No"}\n` +
        `𑁍ࠬܓ *¿Es comunidad?* › ${isCommunity ? "Sí" : "No"}\n` +
        `𑁍ࠬܓ *¿Es anuncio de comunidad?* › ${isCommunityAnnounce ? "Sí" : "No"}\n` +
        `𑁍ࠬܓ *Tiene aprobación de miembros* › ${joinApprovalMode ? "Sí" : "No"}\n` +
        `\n\`☆ ⊹ ꕤ DATOS TÉCNICOS ꕤ ⊹ ☆\`\n\n` +
        `𑁍ࠬܓ *ID* › \`${id || "No encontrado"}\`\n` +
        `𑁍ࠬܓ *Imagen del grupo* › ${pp ? pp : "No se pudo obtener"}\n`;
      return caption.trim();
    };
    let info;
    let res;
    let inviteInfo;
    try {
      res = text ? null : groupMetadata;
      info = await MetadataGroupInfo(res);
    } catch {
      const inviteUrl = text?.match(/(?:https:\/\/)?(?:www\.)?(?:chat\.|wa\.)?whatsapp\.com\/(?:invite\/|joinchat\/)?([0-9A-Za-z]{22,24})/i)?.[1];
      if (inviteUrl) {
        try {
          inviteInfo = await sock.groupGetInviteInfo(inviteUrl);
          info = await inviteGroupInfo(inviteInfo);
        } catch (e) {
          msg.reply('《✧》 Grupo no encontrado.');
          return;
        }
      }
    }
    if (info) {
      const mentions = (res?.participants || inviteInfo?.participants || []).filter(p => p && p.id && (p.admin === "admin" || p.admin === "superadmin" || p.id === (res?.owner || inviteInfo?.owner))).map(p => p.id).filter(id => id && typeof id === 'string' && id.includes('@'));
      await sock.sendMessage(msg.chat, { text: info, mentions, contextInfo: { mentionedJid: mentions }}, { quoted: msg });
    } else {
      let newsletterInfo;
      if (!channelUrl) {
        return sock.reply(msg.chat, "《✧》 Verifique que sea un enlace de canal de WhatsApp.", msg);
      }
      if (channelUrl) {
        try {
          newsletterInfo = await sock.newsletterMetadata("invite", channelUrl).catch(() => null);
          if (!newsletterInfo) {
            return sock.reply(msg.chat, "《✧》 No se encontró información del canal. Verifique que el enlace sea correcto.", msg);
          }
          let caption = `\`☆ ⊹ ꕤ INSPECTOR DE ENLACES DE CANALES ꕤ ⊹ ☆\`\n\n` + processObject(newsletterInfo, "", newsletterInfo?.preview);
          if (newsletterInfo?.preview) {
            pp = getUrlFromDirectPath(newsletterInfo.preview);
          } else {
            pp = null;
          }
          if (channelUrl && newsletterInfo) {
            await sock.sendMessage(msg.chat, { text: caption, mentions: Array.isArray(sock.parseMention(caption)) ? sock.parseMention(caption) : [], contextInfo: { mentionedJid: Array.isArray(sock.parseMention(caption)) ? sock.parseMention(caption) : [] }}, { quoted: msg }); }
          if (newsletterInfo.id) {
            sock.sendMessage(msg.chat, { text: newsletterInfo.id }, { quoted: null });
          }
        } catch (e) {
          await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
        }
      }
    }
  }
};

function formatDate(n, locale = "es", includeTime = true) {
  if (n > 1e12) {
    n = Math.floor(n / 1000);
  } else if (n < 1e10) {
    n = Math.floor(n * 1000);
  }
  const date = new Date(n);
  if (isNaN(date)) return "Fecha no válida";
  const optionsDate = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const formattedDate = date.toLocaleDateString(locale, optionsDate);
  if (!includeTime) return formattedDate;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const period = hours < 12 ? 'AM' : 'PM';
  const formattedTime = `${hours}:${minutes}:${seconds} ${period}`;
  return `${formattedDate}, ${formattedTime}`;
}

function newsletterKey(key) {
  return _.startCase(key.replace(/_/g, " ")).replace("Id", "Identificador").replace("State", "Estado").replace("Creation Time", "Fecha de creación").replace("Name Time", "Fecha de modificación del nombre").replace("Name", "Nombre").replace("Description Time", "Fecha de modificación de la descripción").replace("Description", "Descripción").replace("Invite", "Invitación").replace("Handle", "Alias").replace("Picture", "Imagen").replace("Preview", "Vista previa").replace("Reaction Codes", "Reacciones").replace("Subscribers", "Suscriptores").replace("Verification", "Verificación").replace("Viewer Metadata", "Datos avanzados");
}

function formatValue(key, value, preview) {
  switch (key) {
    case "subscribers":
      return value ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "No hay suscriptores";
    case "creation_time":
    case "nameTime":
    case "descriptionTime":
      return formatDate(value);
    case "description":
    case "name":
      return value || "No hay información disponible";
    case "state":
      switch (value) {
        case "ACTIVE": return "Activo";
        case "GEOSUSPENDED": return "Suspendido por región";
        case "SUSPENDED": return "Suspendido";
        default: return "Desconocido";
      }
    case "reaction_codes":
      switch (value) {
        case "ALL": return "Todas las reacciones permitidas";
        case "BASIC": return "Reacciones básicas permitidas";
        case "NONE": return "No se permiten reacciones";
        default: return "Desconocido";
      }
    case "verification":
      switch (value) {
        case "VERIFIED": return "Verificado";
        case "UNVERIFIED": return "No verificado";
        default: return "Desconocido";
      }
    case "mute":
      switch (value) {
        case "ON": return "Silenciado";
        case "OFF": return "No silenciado";
        case "UNDEFINED": return "Sin definir";
        default: return "Desconocido";
      }
    case "view_role":
      switch (value) {
        case "ADMIN": return "Administrador";
        case "OWNER": return "Propietario";
        case "SUBSCRIBER": return "Suscriptor";
        case "GUEST": return "Invitado";
        default: return "Desconocido";
      }
    case "picture":
      if (preview) {
        return getUrlFromDirectPath(preview);
      } else {
        return "No hay imagen disponible";
      }
    default:
      return value !== null && value !== undefined ? value.toString() : "No hay información disponible";
  }
}

function processObject(obj, prefix = "", preview) {
  let caption = "";
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (typeof value === "object" && value !== null) {
      if (Object.keys(value).length > 0) {
        const sectionName = newsletterKey(prefix + key);
        caption += `\n\`☆ ⊹ ꕤ ${sectionName.toUpperCase()} ꕤ ⊹ ☆\`\n\n`;
        caption += processObject(value, `${prefix}${key}_`);
      }
    } else {
      const shortKey = prefix ? prefix.split("_").pop() + "_" + key : key;
      const displayValue = formatValue(shortKey, value, preview);
      const translatedKey = newsletterKey(shortKey);
      caption += `𑁍ࠬܓ *${translatedKey}* › ${displayValue}\n`;
    }
  });
  return caption;
}
