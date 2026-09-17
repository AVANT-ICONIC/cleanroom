import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../src/defaults.mjs';
import { scanProviders, describeProviders } from '../src/providers/index.mjs';
import { corroborate } from '../src/corroboration.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'greenroom-provider-contract-'));

function write(file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

write('package.json', JSON.stringify({
  name: 'greenroom-provider-contract-fixture',
  private: true,
  type: 'module',
  main: 'src/index.js',
  scripts: { start: 'node src/index.js' }
}, null, 2));
write('src/index.js', "import { live } from './live.js';\nconsole.log(live());\n");
write('src/live.js', "export function live() { return 'live'; }\n");
write('src/dead.js', "export function dead() { return 'dead'; }\n");

const config = structuredClone(DEFAULT_CONFIG);
config.providers.fallow.enabled = true;
config.providers.knip.enabled = true;
config.providers.projectNative.enabled = false;
config.rules.rawDesignValues = false;
config.entrypoints = ['src/index.js'];

const availability = describeProviders(root, config).filter((item) => ['fallow', 'knip'].includes(item.provider));
for (const item of availability) {
  if (!item.available) {
    throw new Error(`${item.provider} is unavailable in provider-contract job: ${(item.errors || []).join('; ')}`);
  }
}

const result = scanProviders(root, config, { only: ['fallow', 'knip'] });
for (const provider of ['fallow', 'knip']) {
  const status = result.statuses.find((item) => item.provider === provider);
  if (!status || status.status !== 'ok') {
    throw new Error(`${provider} provider failed: ${(status?.errors || []).join('; ') || 'no status'}`);
  }
  if (status.findings < 1) throw new Error(`${provider} produced no findings for an intentionally dirty fixture`);
}

const deadEvidence = result.findings.filter((item) => item.kind === 'unused-file' && item.scope.files.includes('src/dead.js'));
if (!deadEvidence.length) {
  throw new Error(`Expected unused-file evidence for src/dead.js; got ${JSON.stringify(result.findings.map((f) => ({ kind: f.kind, files: f.scope.files, evidence: f.evidence.map((e) => e.provider) })))}`);
}

const deadProviders = new Set(deadEvidence.flatMap((item) => item.evidence.map((e) => e.provider)));
if (!deadProviders.has('fallow') || !deadProviders.has('knip')) {
  throw new Error(`Expected Fallow and Knip to corroborate src/dead.js; got ${[...deadProviders].join(', ')}`);
}

const groups = corroborate(result.findings);
const corroboratedDead = groups.find((group) => group.family === 'reachability' && group.file === 'src/dead.js');
if (!corroboratedDead || corroboratedDead.status !== 'corroborated' || corroboratedDead.providers.length < 2) {
  throw new Error('Green Room corroboration did not preserve both real provider oracles for src/dead.js');
}

console.log(JSON.stringify({
  fixture: 'provider-contract',
  providers: result.statuses.map((s) => ({ provider: s.provider, status: s.status, findings: s.findings })),
  corroborated: {
    family: corroboratedDead.family,
    file: corroboratedDead.file,
    providers: corroboratedDead.providers,
    status: corroboratedDead.status
  }
}, null, 2));
console.log('Provider integration contract: PASS');
