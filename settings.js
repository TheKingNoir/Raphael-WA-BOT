import { watchFile, unwatchFile, mkdirSync } from "fs";
import chalk from "chalk";
import { fileURLToPath } from "url";
import path from "path";

const tmpPath = path.resolve(process.cwd(), 'tmp');
mkdirSync(tmpPath, { recursive: true });
process.env.TMPDIR = tmpPath;

global.owner = ['584220049667', '584125891414'];

global.links = {
  host: 'https://komodo-host.site',
  channel: "https://whatsapp.com/channel/0029Vb8e0XzJENxsFEtxBE25",
  gmail: "Raphaelbotwa@gmail.com"
}

global.APIs = { 
  yuki: { url: "https://api.yuki-wabot.my.id", key: "Yuki-WaBot" },
  evogb: { url: "https://api.evogb.org", key: "Yuki-WaBot" },
  siputzx: { url: "https://api.siputzx.my.id", key: null },
  neoapis: { url: "https://www.neoapis.xyz", key: null }
};

global.mess = {
  socket: '《✧》 Este comando solo puede ser ejecutado por un Socket.',
  admin: '《✧》 Este comando solo puede ser ejecutado por los Administradores del Grupo.',
  botAdmin: '《✧》 Este comando solo puede ser ejecutado si el Socket es Administrador del Grupo.'
};

let file = fileURLToPath(import.meta.url);
watchFile(file, () => {
  unwatchFile(file);
  import(`${file}?update=${Date.now()}`);
});