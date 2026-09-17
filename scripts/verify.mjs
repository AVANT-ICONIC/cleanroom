import { spawnSync } from 'node:child_process';

const testEnv = { ...process.env };
for (const key of Object.keys(testEnv)) {
  if (key.startsWith('GREENROOM_ALLOW_') || key === 'GREENROOM_COMPARE_REF' || key === 'GREENROOM_BASE_REF') delete testEnv[key];
}

const commands = [
  ['npm', ['test'], testEnv],
  ['npm', ['run', 'smoke:consumer'], testEnv],
  ['npm', ['run', 'benchmark'], testEnv],
  [process.execPath, ['src/cli.mjs', 'audit'], testEnv]
];
for (const [cmd, args, env] of commands) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const checkEnv = { ...testEnv };
if (process.env.GREENROOM_VERIFY_GOVERNANCE === '1') checkEnv.GREENROOM_ALLOW_GOVERNANCE_UPDATE = '1';
const check = spawnSync(process.execPath, ['src/cli.mjs', 'check'], { stdio: 'inherit', shell: process.platform === 'win32', env: checkEnv });
if (check.status !== 0) process.exit(check.status ?? 1);

console.log('\nGreen Room verification: PASS');
