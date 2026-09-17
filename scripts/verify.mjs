import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function parseVerifyMode(argv = [], env = process.env) {
  const args = new Set(argv);
  const allowedArgs = new Set(['--governance']);
  const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

  if (unknownArgs.length > 0) {
    const error = new Error(`Unknown verify option(s): ${unknownArgs.join(', ')}`);
    error.exitCode = 2;
    throw error;
  }

  return args.has('--governance') || env.GREENROOM_VERIFY_GOVERNANCE === '1';
}

function runCommand(cmd, args, env) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env
  });

  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  let governanceVerification = false;

  try {
    governanceVerification = parseVerifyMode(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(error.message);
    process.exit(error.exitCode ?? 1);
  }

  const testEnv = { ...process.env };
  for (const key of Object.keys(testEnv)) {
    if (
      key.startsWith('GREENROOM_ALLOW_') ||
      key === 'GREENROOM_COMPARE_REF' ||
      key === 'GREENROOM_BASE_REF'
    ) {
      delete testEnv[key];
    }
  }

  const commands = [
    ['npm', ['test'], testEnv],
    ['npm', ['run', 'smoke:consumer'], testEnv],
    ['npm', ['run', 'benchmark'], testEnv],
    [process.execPath, ['src/cli.mjs', 'audit'], testEnv]
  ];

  for (const [cmd, args, env] of commands) runCommand(cmd, args, env);

  const checkEnv = { ...testEnv };
  if (governanceVerification) checkEnv.GREENROOM_ALLOW_GOVERNANCE_UPDATE = '1';

  runCommand(process.execPath, ['src/cli.mjs', 'check'], checkEnv);

  console.log(
    `\nGreen Room verification: PASS${governanceVerification ? ' (governance mode)' : ''}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
