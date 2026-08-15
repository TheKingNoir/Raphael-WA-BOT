import moment from 'moment-timezone';
import db from '#db';
import fs from 'fs';

export default {
    command: ['testwelcome', 'testgoodbye'],
    category: 'group',
    description: 'Prueba el mensaje de bienvenida/despedida con audio.',
    run: async ({ msg, sock, usedPrefix, command, groupMetadata }) => {
        try {
            const isWelcome = command.includes('welcome') || command.includes('bienvenida');
            const tipo = isWelcome ? 'welcome' : 'goodbye';
            const chat = db.getChat(msg.chat) || {};
            const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const settings = db.getSettings(botId) || {};
            const config = tipo === 'welcome' ? chat?.welcome : chat?.goodbye;
            
            if (!config) return sock.reply(msg.chat, `⚠️ Las ${tipo === 'welcome' ? 'bienvenidas' : 'despedidas'} están desactivadas en este grupo.`);
            
            const jid = msg.sender;
            const phone = msg.sender.split('@')[0];
            
            let pp;
            try {
                pp = await sock.profilePictureUrl(jid, 'image');
            } catch {
                pp = 'https://cdn.yukiwabot.my.id/files/2PVh.jpeg';
            }

            const memberCount = groupMetadata?.participants?.length || 0;
            const tiempo = moment.tz('America/Bogota').format('DD/MM/YYYY').replace(/./g, ' ');
            const tiempo2 = moment.tz('America/Bogota').format('hh:mm A');
            const fakeContext = { mentions: [jid] };
            let caption;

            if (tipo === 'welcome') {
                if (chat.sWelcome && chat.sWelcome.trim() !== '') {
                    caption = chat.sWelcome.replace(/@user/g, `@${phone}`).replace(/@group/g, groupMetadata?.subject || 'Grupo').replace(/@desc/g, groupMetadata?.desc || 'Sin descripción').replace(/@members/g, memberCount).replace(/@time/g, `${tiempo}`).replace(/@tiempo2/g, `${tiempo2}`);
                } else {
                    caption = `┌─❖\n│ 👤 *Bienvenido/a* @${phone}\n└┬❖\n   │ • *Nombre:* @${phone}\n   │ • *Grupo:* ${groupMetadata?.subject || 'Grupo'}\n   │ • *Usa /menu para ver los comandos.*\n   │ • *Ahora somos ${memberCount} miembros.*\n└─┈─┈─┈─┈─┈─┈─┈─`;
                }
            } else {
                if (chat.sGoodbye && chat.sGoodbye.trim() !== '') {
                    caption = chat.sGoodbye.replace(/@user/g, `@${phone}`).replace(/@group/g, groupMetadata?.subject || 'Grupo').replace(/@desc/g, groupMetadata?.desc || 'Sin descripción').replace(/@members/g, memberCount).replace(/@time/g, `${tiempo}`).replace(/@tiempo2/g, `${tiempo2}`);
                } else {
                    caption = `┌─❖\n│ 👤 *Hasta pronto (╥﹏╥)*\n└┬❖\n   │ • *Nombre:* @${phone}\n   │ • *Grupo:* ${groupMetadata?.subject || 'Grupo'}\n   │ • *Ojalá que vuelva pronto.*\n   │ • *Ahora somos ${memberCount} miembros.*\n└─┈─┈─┈─┈─┈─┈─┈─
ᨳ︪︩፝֟͝    ␥ ⃟𝐑𝐚𝐩𝐡𝐚𝐞𝐥 ²⁰²⁶ ©`;
                }
            }

            // 1. Envía la imagen con el texto
            await sock.sendMessage(msg.chat, { image: { url: pp }, caption, ...fakeContext });

            // 2. Envía el audio correspondiente si es bienvenida
            if (tipo === 'welcome') {
                const audioPath = './media/bienvenida.mp3';
                if (fs.existsSync(audioPath)) {
                    await sock.sendMessage(msg.chat, { 
                        audio: { url: audioPath }, 
                        mimetype: 'audio/mp4', 
                        ptt: true 
                    });
                }
            }

        } catch (error) {
            sock.reply(msg.chat, `> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${error.message}*]`);
        }
    }
};