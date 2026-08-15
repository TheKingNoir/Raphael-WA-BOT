import fs from 'fs';

export default {
    command: ['wa', 'Wa'],
    category: 'grupo',
    help: ['Envía únicamente el audio de bienvenida.'],
    execute: async (sock, m, { text, args }) => {
        try {
            const chat = m.chat;
            const audioPath = './media/bienvenida.mp3';

            if (fs.existsSync(audioPath)) {
                const audioBuffer = fs.readFileSync(audioPath);
                await sock.sendMessage(chat, { 
                    audio: audioBuffer, 
                    mimetype: 'audio/mp4', 
                    ptt: true 
                }, { quoted: m });
            } else {
                await m.reply("El archivo de audio `./media/bienvenida.mp3` no se encontró.");
            }

        } catch (err) {
            console.log("Error en el comando de audio de bienvenida:", err);
            await m.reply("Ocurrió un error al enviar el audio.");
        }
    }
};