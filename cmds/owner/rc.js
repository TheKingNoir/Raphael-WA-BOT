import { promises as fs } from 'fs';
import db from '#db';

const charactersFilePath = './core/characters.json';
async function loadCharacters() {
  const data = await fs.readFile(charactersFilePath, 'utf-8');
  return JSON.parse(data);
}

function flattenCharacters(structure) {
  return Object.values(structure).flatMap(s => Array.isArray(s.characters) ? s.characters : []);
}

function findCharacterByNameOrTag(allCharacters, nameQuery) {
  const q = nameQuery.toLowerCase().trim();
  return allCharacters.find(c => String(c.name).toLowerCase() === q) || allCharacters.find(c => String(c.name).toLowerCase().includes(q) || (Array.isArray(c.tags) && c.tags.some(tag => tag.toLowerCase().includes(q)))) || allCharacters.find(c => q.split(' ').some(e => String(c.name).toLowerCase().includes(e) || (Array.isArray(c.tags) && c.tags.some(tag => tag.toLowerCase().includes(e)))));
}

export default {
  command: ['rc', 'rclaim', 'delc', 'delclaim'],
  category: 'owner',
  description: 'Gestionar claims de personajes (owner).',
  isOwner: true,
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const structure = await loadCharacters();
      const allCharacters = flattenCharacters(structure);
      const targetId = msg.mentionedJid?.[0] || msg.quoted?.sender || msg.sender;
      let chat = db.getChat(msg.chat);
      let userGlobal = db.getUser(targetId);
      let displayName = userGlobal?.name || targetId.split('@')[0];      
      switch (command) {
        case 'rclaim': case 'rc': {
          const receiverId = msg.sender;
          let receiver = db.getChatUser(msg.chat, receiverId);
          if (!args.length) {
            return sock.reply(msg.chat, `✦ Debes escribir el nombre o ID del personaje.\nEjemplo: *${usedPrefix + command} Sakura* o *${usedPrefix + command} 001 @usuario*`, msg);
          }
          const inputText = args.join(' ').trim();
          const isAll = args[0] && args[0].toLowerCase() === 'all' && targetId;
          if (isAll) {
            let donor = db.getChatUser(msg.chat, targetId);
            if (!Array.isArray(donor.characters) || donor.characters.length === 0) {
              return sock.reply(msg.chat, '❀ El usuario no tiene personajes reclamados.', msg);
            }
            for (let i = 0; i < donor.characters.length; i++) {
              const id = donor.characters[i];
              let character = db.getCharacter(id);
              if (!character || character.user !== targetId) continue;
              character.user = receiverId;
              character.claimedAt = Date.now();
              db.setCharacter(id, character);
              if (donor.favorite === id) {
                db.setChatUser(msg.chat, targetId, 'favorite', '');
                db.setUser(targetId, 'favorite', '');
              }
              if (chat.sales && chat.sales[id]?.user === targetId) {
                delete chat.sales[id];
                db.setChat(msg.chat, 'sales', chat.sales);
              }
              if (!receiver.characters.includes(id)) receiver.characters.push(id);
            }
            donor.characters = [];
            db.setChatUser(msg.chat, targetId, 'characters', donor.characters);
            db.setChatUser(msg.chat, receiverId, 'characters', receiver.characters);
            await sock.reply(msg.chat, `❀ Se han transferido todas las waifus de *${targetId.split('@')[0]}* a ti.`, msg);
          } else if (inputText.includes('/')) {
            const queries = inputText.split('/').map(q => q.trim()).filter(q => q);
            const claimed = [], already = [], notFound = [];
            for (const input of queries) {
              let sourceData = allCharacters.find(c => c.id === input);
              if (!sourceData) sourceData = findCharacterByNameOrTag(allCharacters, input);
              if (!sourceData) { notFound.push(input); continue; }
              const id = sourceData.id;
              let donor = db.getChatUser(msg.chat, targetId);
              let character = db.getCharacter(id);
              if (!character) {
                character = { name: sourceData.name, value: sourceData.value || 0, votes: 0 };
              }
              const previousOwner = character.user;
              const isTransfer = previousOwner && previousOwner !== targetId;
              if (!isTransfer && character.user) {
                already.push(character.name);
                continue;
              }
              if (isTransfer && previousOwner) {
                let prevUser = db.getChatUser(msg.chat, previousOwner);
                prevUser.characters = prevUser.characters.filter(cid => cid !== id);
                db.setChatUser(msg.chat, previousOwner, 'characters', prevUser.characters);
                if (prevUser.favorite === id) {
                  db.setChatUser(msg.chat, previousOwner, 'favorite', '');
                  db.setUser(previousOwner, 'favorite', '');
                }
                if (chat.sales && chat.sales[id]?.user === previousOwner) {
                  delete chat.sales[id];
                  db.setChat(msg.chat, 'sales', chat.sales);
                }
              }
              character.user = targetId;
              character.claimedAt = Date.now();
              if (character.reservedBy) delete character.reservedBy;
              if (character.reservedUntil) delete character.reservedUntil;
              db.setCharacter(id, character);
              if (!donor.characters.includes(id)) donor.characters.push(id);
              db.setChatUser(msg.chat, targetId, 'characters', donor.characters);
              claimed.push(character.name);
            }
            let replyText = '❀ *Informacion sobre personajes recibidos:*\n';
            if (claimed.length) replyText += `\n❀ *Reclamados (${claimed.length}):*\n  • ${claimed.join('\n  • ')}\n`;
            if (already.length) replyText += `\n❀ *Ya reclamados (${already.length}):*\n  • ${already.join('\n  • ')}\n`;
            if (notFound.length) replyText += `\n❀ *No encontrados (${notFound.length}):*\n  • ${notFound.join('\n  • ')}\n`;
            await sock.reply(msg.chat, replyText, msg);
          } else {
            let sourceData = allCharacters.find(c => c.id === inputText);
            if (!sourceData) sourceData = findCharacterByNameOrTag(allCharacters, inputText);
            if (!sourceData) {
              return sock.reply(msg.chat, 'ꕥ Personaje no encontrado en characters.json', msg);
            }
            const id = sourceData.id;
            let donor = db.getChatUser(msg.chat, targetId);
            let character = db.getCharacter(id);
            if (!character) {
              character = { name: sourceData.name, value: sourceData.value || 0, votes: 0 };
            }
            const previousOwner = character.user;
            const isTransfer = previousOwner && previousOwner !== targetId;
            if (!isTransfer && character.user) {
              let ownerGlobal = db.getUser(character.user);
              let ownerName = ownerGlobal?.name || character.user.split('@')[0];
              return sock.reply(msg.chat, `ꕥ El personaje *${character.name}* ya ha sido reclamado por *${ownerName}*`, msg);
            }
            if (isTransfer && previousOwner) {
              let prevUser = db.getChatUser(msg.chat, previousOwner);
              prevUser.characters = prevUser.characters.filter(cid => cid !== id);
              db.setChatUser(msg.chat, previousOwner, 'characters', prevUser.characters);
              if (prevUser.favorite === id) {
                db.setChatUser(msg.chat, previousOwner, 'favorite', '');
                db.setUser(previousOwner, 'favorite', '');
              }
              if (chat.sales && chat.sales[id]?.user === previousOwner) {
                delete chat.sales[id];
                db.setChat(msg.chat, 'sales', chat.sales);
              }
            }
            character.user = targetId;
            character.claimedAt = Date.now();
            if (character.reservedBy) delete character.reservedBy;
            if (character.reservedUntil) delete character.reservedUntil;
            db.setCharacter(id, character);
            if (!donor.characters.includes(id)) donor.characters.push(id);
            db.setChatUser(msg.chat, targetId, 'characters', donor.characters);
            const characterName = character.name;
            const userWithMessage = db.getUser(targetId);
            const custom = userWithMessage?.claimMessage;
            const finalMessage = custom ? custom.replace(/€user/g, `*${displayName}*`).replace(/€character/g, `*${characterName}*`) : `*${characterName}* ha sido reclamado por *${displayName}*`;
            await sock.reply(msg.chat, `❀ ${finalMessage}`, msg);
          }
          break;
        }
        case 'delclaim': case 'delc': {
          let targetUser = db.getChatUser(msg.chat, targetId);
          if (!args.length) {
            return sock.reply(msg.chat, `❀ Debes especificar un personaje para eliminar.\n> Ejemplo » *${usedPrefix + command} Anya Alstreim* o *${usedPrefix + command} 001 @usuario*`, msg);
          }
          const inputText = args.join(' ').trim();
          const isAll = args[0] && args[0].toLowerCase() === 'all' && targetId;
          if (isAll) {
            if (!Array.isArray(targetUser.characters) || targetUser.characters.length === 0) {
              return sock.reply(msg.chat, '❀ El usuario no tiene personajes reclamados.', msg);
            }
            for (let i = 0; i < targetUser.characters.length; i++) {
              const id = targetUser.characters[i];
              let character = db.getCharacter(id);
              if (!character || character.user !== targetId) continue;
              delete character.user;
              delete character.claimedAt;
              db.setCharacter(id, character);
              if (chat.sales && chat.sales[id]?.user === targetId) {
                delete chat.sales[id];
              }
              if (targetUser.favorite === id) {
                db.setChatUser(msg.chat, targetId, 'favorite', '');
                db.setUser(targetId, 'favorite', '');
              }
            }
            targetUser.characters = [];
            db.setChatUser(msg.chat, targetId, 'characters', targetUser.characters);
            if (chat.sales) db.setChat(msg.chat, 'sales', chat.sales);
            await sock.reply(msg.chat, `❀ Se han eliminado todas las waifus de *${targetId.split('@')[0]}*`, msg);
          } else if (inputText.includes('/')) {
            const queries = inputText.split('/').map(q => q.trim()).filter(q => q);
            const deleted = [], notOwned = [], notFound = [];
            for (const input of queries) {
              let character = allCharacters.find(c => c.id === input);
              if (!character) character = findCharacterByNameOrTag(allCharacters, input);
              if (!character) { notFound.push(input); continue; }
              const id = character.id;
              let charData = db.getCharacter(id);
              if (!charData || charData.user !== targetId || !targetUser.characters.includes(id)) {
                notOwned.push(character.name);
                continue;
              }
              delete charData.user;
              delete charData.claimedAt;
              db.setCharacter(id, charData);
              targetUser.characters = targetUser.characters.filter(cid => cid !== id);
              if (chat.sales && chat.sales[id]?.user === targetId) {
                delete chat.sales[id];
              }
              if (targetUser.favorite === id) {
                db.setChatUser(msg.chat, targetId, 'favorite', '');
                db.setUser(targetId, 'favorite', '');
              }
              deleted.push(character.name);
            }
            db.setChatUser(msg.chat, targetId, 'characters', targetUser.characters);
            if (chat.sales) db.setChat(msg.chat, 'sales', chat.sales);
            let replyText2 = '❀ *Resultado de eliminación múltiple:*\n';
            if (deleted.length) replyText2 += `\n❀ *Eliminados (${deleted.length}):*\n  • ${deleted.join('\n  • ')}\n`;
            if (notOwned.length) replyText2 += `\n❀ *No pertenecían al usuario (${notOwned.length}):*\n  • ${notOwned.join('\n  • ')}\n`;
            if (notFound.length) replyText2 += `\n❀ *No encontrados (${notFound.length}):*\n  • ${notFound.join('\n  • ')}\n`;
            await sock.reply(msg.chat, replyText2, msg);
          } else {
            let character = allCharacters.find(c => c.id === inputText);
            if (!character) character = findCharacterByNameOrTag(allCharacters, inputText);
            if (!character) {
              return sock.reply(msg.chat, `ꕥ No se ha encontrado ningún personaje con el nombre o ID *${inputText}*`, msg);
            }
            const id = character.id;
            let charData = db.getCharacter(id);
            if (!charData || charData.user !== targetId || !targetUser.characters.includes(id)) {
              return sock.reply(msg.chat, `ꕥ *${character.name}* no está reclamado por ese usuario.`, msg);
            }
            delete charData.user;
            delete charData.claimedAt;
            db.setCharacter(id, charData);
            targetUser.characters = targetUser.characters.filter(cid => cid !== id);
            db.setChatUser(msg.chat, targetId, 'characters', targetUser.characters);
            if (chat.sales && chat.sales[id]?.user === targetId) {
              delete chat.sales[id];
              db.setChat(msg.chat, 'sales', chat.sales);
            }
            if (targetUser.favorite === id) {
              db.setChatUser(msg.chat, targetId, 'favorite', '');
              db.setUser(targetId, 'favorite', '');
            }
            await sock.reply(msg.chat, `❀ *${character.name}* ha sido eliminado de la lista de *${displayName}*`, msg);
          }
          break;
        }
      }
    } catch (e) {
      await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  }
};