import cp, { exec as _exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { rescan } from '#core/cmdsLoader';

const exec = promisify(_exec).bind(cp);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(__dirname, '../..');
const git = (cmd) => exec(cmd, { cwd: raiz, maxBuffer: 10 * 1024 * 1024 });
const TIPOS = { M: { icon: '✎', label: 'Modificado' }, A: { icon: '✔', label: 'Nuevo' }, D: { icon: '✖', label: 'Eliminado' }, R: { icon: '↺', label: 'Renombrado' } };

function parseChanges(diffRaw) {
  return diffRaw.split('\n').map((l) => l.trim()).filter(Boolean).map((linea) => {
    const [estado, a, b] = linea.split('\t');
    const tipo = estado.startsWith('R') ? 'R' : TIPOS[estado] ? estado : 'M';
    return tipo === 'R' ? { tipo, ruta: b, desde: a } : { tipo, ruta: a };
  });
}

const isCmd = (ruta = '') => ruta.startsWith('cmds/') && ruta.endsWith('.ts');
const toPaths = (changes) => changes.flatMap((c) => c.desde ? [c.desde, c.ruta] : [c.ruta]);
function detail(changes) {
  return changes.map((c) => `${TIPOS[c.tipo].icon} ${TIPOS[c.tipo].label}: ${c.tipo === 'R' ? `${c.desde} → ${c.ruta}` : c.ruta}`).join('\n');
}

async function diffDependencies(git, hashBefore, hashAfter) {
  const readPkg = async (hash) => {
    try {
      const { stdout } = await git(`git show ${hash}:package.json`);
      return JSON.parse(stdout);
    } catch {
      return {};
    }
  };
  const [before, after] = await Promise.all([readPkg(hashBefore), readPkg(hashAfter)]);
  const beforeDeps = { ...before.dependencies, ...before.devDependencies };
  const afterDeps = { ...after.dependencies, ...after.devDependencies };
  const added = Object.keys(afterDeps).filter((k) => !(k in beforeDeps));
  const removed = Object.keys(beforeDeps).filter((k) => !(k in afterDeps));
  if (!added.length && !removed.length) return '✔ Dependencias sincronizadas, sin cambios en el listado.';
  const partes = [];
  if (added.length) partes.push(`✔ Instaladas: ${added.join(', ')}`);
  if (removed.length) partes.push(`✖ Eliminadas: ${removed.join(', ')}`);
  return partes.join('\n');
}

export default {
  command: ['fix', 'update'],
  category: 'owner',
  description: 'Actualizar y recargar los comandos del bot.',
  isOwner: true,
  run: async ({ msg, sock, usedPrefix, command }) => {
    try {
      await msg.react('🕒');
      const hashBefore = (await git('git rev-parse HEAD')).stdout.trim();
      const { stdout: pullOut } = await git('git pull --ff-only');
      if (pullOut.includes('Already up to date.')) {
        await msg.react('✔️');
        return sock.reply(msg.chat, '✿ *Ya estás en la última versión*, no había nada nuevo que traer.', msg);
      }
      const hashAfter = (await git('git rev-parse HEAD')).stdout.trim();
      const { stdout: diffRaw } = await git(`git diff --name-status -M ${hashBefore} ${hashAfter}`);
      const changes = parseChanges(diffRaw);
      const cmds = changes.filter((c) => isCmd(c.ruta) || isCmd(c.desde));
      const otros = changes.filter((c) => !cmds.includes(c));
      let report = '✿ *Actualización completada*\n\n';
      if (changes.length) report += detail(changes) + '\n';
      report += `\n\`\`\`${pullOut.trim()}\`\`\`\n`;
      const paths = toPaths(changes);
      if (paths.includes('package.json') || paths.includes('package-lock.json')) {
        const depMsg = await diffDependencies(git, hashBefore, hashAfter);
        await exec('npm install', { cwd: raiz, maxBuffer: 20 * 1024 * 1024 });
        await exec('npm prune', { cwd: raiz, maxBuffer: 20 * 1024 * 1024 });
        report += '\n' + depMsg;
      }
      if (cmds.length) {
        const { total, errors } = await rescan(toPaths(cmds));
        report += errors ? `\n⚠ Se recargaron ${total} comandos, pero *${errors}* fallaron. Revisa la consola.` : `\n✔ ${total} comando${total > 1 ? 's' : ''} recargado${total > 1 ? 's' : ''} sin errores.`;
      }
      if (otros.length) {
        report += `\n⚠ Esto no se aplica solo recargando comandos, hay que reiniciar. Usa *restart*.`;
      }
      await msg.react('✔️');
      await sock.reply(msg.chat, report, msg);
    } catch (e) {
      await msg.react('✖️');
      await sock.reply(msg.chat, `> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.stderr || e.message}*]`, msg);
    }
  }
};
