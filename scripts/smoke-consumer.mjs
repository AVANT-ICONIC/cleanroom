import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packRaw = execFileSync('npm', ['pack', '--json'], { cwd: root, encoding: 'utf8' });
const packed = JSON.parse(packRaw)[0].filename;
const tarball = path.join(root, packed);
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'green-room-consumer-'));
try {
  fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', version: '1.0.0', private: true }, null, 2));
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball], { cwd: consumer, stdio: 'pipe' });
  const bin = path.join(consumer, 'node_modules', '.bin', process.platform === 'win32' ? 'greenroom.cmd' : 'greenroom');
  let r = spawnSync(bin, ['init', '--existing'], { cwd: consumer, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  fs.mkdirSync(path.join(consumer, 'src'), { recursive: true });
  fs.writeFileSync(path.join(consumer, 'src/index.ts'), 'export const ok = true;\n');
  r = spawnSync(bin, ['baseline'], { cwd: consumer, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  r = spawnSync(bin, ['check'], { cwd: consumer, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  fs.writeFileSync(path.join(consumer, 'src/hotfix-final.ts'), 'export const mess = true;\n');
  r = spawnSync(bin, ['check'], { cwd: consumer, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 1 || !r.stdout.includes('BLOCKED')) throw new Error(`Expected entropy block, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  console.log('Consumer smoke test: PASS');
  console.log('Packed artifact installed successfully and blocked a deliberately introduced regression.');
} finally {
  try { fs.unlinkSync(tarball); } catch {}
  try { fs.rmSync(consumer, { recursive: true, force: true }); } catch {}
}
