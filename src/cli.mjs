#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig } from './config.mjs';
import { initialize } from './init.mjs';
import { scan } from './scanner.mjs';
import { auditText } from './report.mjs';
import { makeBaseline, loadBaseline } from './baseline.mjs';
import { sourceFiles } from './lib/fs.mjs';
import { doctor, doctorText } from './doctor.mjs';
import { createPlan, writePlan, nextCleanupBatch, verifyCampaign, approveCampaign } from './plan.mjs';
import { registerCanonical } from './register.mjs';
import { loadWaivers, applyWaivers, addWaiver, removeWaiver } from './waivers.mjs';
import { evaluateCheck } from './check.mjs';
import { VERSION } from './version.mjs';
import { scanProviders, describeProviders } from './providers/index.mjs';
import { responsibilityMap } from './analyzers/registry.mjs';
import { exportCampaignToOpenSpec } from './openspec.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'help';

function option(name, fallback = null) {
  const eq = args.find((x) => x.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
}
function flag(name) { return args.includes(`--${name}`); }
function positional(start = 1) {
  const out = [];
  for (let i = start; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      if (!args[i].includes('=') && args[i + 1] && !args[i + 1].startsWith('--') && ['root','against','reason','owner','expires','alias','batch-size','provider','entrypoint','test','replace','forbid','status','canonical','preserve','doc','generated','caller','directory','history','name'].includes(args[i].slice(2))) i++;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

const root = path.resolve(option('root', process.cwd()));
const json = flag('json');

function printJson(value) {
  console.log(JSON.stringify(value, (_k,v) => v instanceof Map ? Object.fromEntries([...v].map(([k,s]) => [k, s instanceof Set ? [...s] : s])) : v instanceof Set ? [...v] : v, 2));
}
function help() {
  console.log(`Green Room ${VERSION} — repository anti-entropy control plane

Commands:
  greenroom init [--existing] [--baseline]
  greenroom audit [--provider=fallow|knip|project-native] [--json]
  greenroom providers [--provider=fallow|knip|project-native] [--json]
  greenroom baseline [--force --reason="..."]
  greenroom check [--against=<git-ref>] [--json]
  greenroom doctor "task" [--json]
  greenroom find "query" [--json]
  greenroom explain <finding-id> [--json]
  greenroom responsibility list [--json]
  greenroom responsibility show <id> [--json]
  greenroom register <responsibility|component> <name> <path> [--alias=a,b] [--owner=x]
  greenroom clean [--batch-size=12] [--json]
  greenroom cleanup plan [--batch-size=12] [--json]
  greenroom cleanup approve <campaign-id> --owner=x --reason="..." [--canonical=path|none] [--preserve=a,b]
  greenroom cleanup verify <campaign-id> [--no-run] [--json]
  greenroom cleanup openspec <campaign-id> [--name=change-name] [--no-validate] [--json]
  greenroom next [--batch-size=12] [--json]
  greenroom waive <violation-id> --reason="..." --owner=name --expires=YYYY-MM-DD
  greenroom unwaive <violation-id>
  greenroom version

Options:
  --root=/path/to/repo
  --json

Exit codes:
  0 success / entropy gate pass
  1 entropy gate blocked
  2 invalid usage, configuration, or missing adoption baseline
`);
}

function appendGovernanceLog(root, entry) {
  const file = path.join(root, '.greenroom/governance.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

try {
  if (command === 'help' || command === '--help' || command === '-h') { help(); process.exit(0); }
  if (command === 'version' || command === '--version' || command === '-v') { console.log(VERSION); process.exit(0); }

  if (command === 'init') {
    const existing = flag('existing');
    const r = initialize(root, { existing });
    console.log(`Green Room initialized in ${root}`);
    for (const x of r.created) console.log(`  + ${x}`);
    for (const x of r.updated) console.log(`  ~ ${x}`);
    if (!r.created.length && !r.updated.length) console.log('  ✓ managed files already current');
    const config = loadConfig(root);
    const baseline = loadBaseline(root, config);
    if (!baseline && existing && !flag('baseline')) {
      console.log('  ! Brownfield mode: baseline intentionally not created. Tune policy, run `greenroom audit`, register canonical paths, then run `greenroom baseline`.');
      process.exit(0);
    }
    if (!baseline) {
      const initial = scan(root, config);
      if (!existing && initial.violations.length) {
        console.error('\nGreenfield initialization found existing entropy and will not grandfather it automatically.');
        console.error(auditText(initial));
        console.error('\nFix these violations, or re-run `greenroom init --existing` if this is actually a brownfield repository.');
        process.exit(1);
      }
      const b = makeBaseline(root, config, initial);
      console.log(`  ✓ adoption baseline created (${b.violations.length} violation(s) grandfathered)`);
    }
    process.exit(0);
  }

  const config = loadConfig(root);
  const providerOpt = option('provider');
  if (providerOpt && !['fallow','knip','project-native'].includes(providerOpt)) throw new Error(`Unknown provider: ${providerOpt}`);
  const includeProviders = ['audit','clean','plan','next','cleanup','explain'].includes(command);
  const result = scan(root, config, { includeProviders, onlyProviders: providerOpt ? [providerOpt] : null });

  if (command === 'providers') {
    const p = scanProviders(root, config, { only: providerOpt ? [providerOpt] : null });
    if (json) printJson(p);
    else {
      console.log('GREEN ROOM PROVIDERS\n' + '='.repeat(64));
      for (const item of p.statuses) console.log(`  ${item.provider.padEnd(14)} ${item.status.padEnd(12)} findings=${item.findings || 0}  capabilities=${(item.capabilities||[]).join(',')}${item.command ? `  command=${item.command}` : ''}`);
    }
    process.exit(0);
  }

  if (command === 'audit') {
    const applied = applyWaivers(result.violations, loadWaivers(root, config));
    if (json) printJson({ ...result, waivers: { active: applied.waived, expired: applied.expired } });
    else console.log(auditText(result, { waived: applied.waived, expired: applied.expired }));
    process.exit(0);
  }

  if (command === 'baseline') {
    const existingBaseline = loadBaseline(root, config);
    if (existingBaseline && !flag('force')) {
      console.error('A baseline already exists. Routine work must not re-baseline. Intentional governance updates require `greenroom baseline --force --reason="..."`.');
      process.exit(2);
    }
    if (existingBaseline && flag('force') && !option('reason')) {
      console.error('Forced re-baselining requires --reason="..." so the governance change is auditable.');
      process.exit(2);
    }
    const b = makeBaseline(root, config, result);
    if (existingBaseline) appendGovernanceLog(root, { action: 'rebaseline', reason: option('reason'), beforeEntropy: existingBaseline.entropy, afterEntropy: b.entropy });
    console.log(`Baseline saved: ${config.baselineFile}\n${b.violations.length} existing violation(s) grandfathered.\nRoutine changes may introduce 0 new violations.`);
    process.exit(0);
  }

  if (command === 'check') {
    const evaluated = evaluateCheck(root, { explicitCompareRef: option('against') });
    if (evaluated.error) { console.error(evaluated.error); process.exit(evaluated.exitCode); }
    if (json) printJson(evaluated); else console.log(evaluated.text);
    process.exit(evaluated.exitCode);
  }

  if (command === 'register') {
    const [kind, name, canonical] = positional(1);
    if (!kind || !name || !canonical) { console.error('Usage: greenroom register <responsibility|component> <name> <path> [--alias=a,b] [--allow-missing]'); process.exit(2); }
    const split = (name) => String(option(name, '')).split(',').map((x) => x.trim()).filter(Boolean);
    const aliases = split('alias');
    const metadata = { owner: option('owner',''), status: option('status',''), entrypoints: split('entrypoint'), tests: split('test'), docs: split('doc'), generated: split('generated'), replaces: split('replace'), allowedCallers: split('caller'), allowedDirectories: split('directory'), forbiddenPatterns: split('forbid'), cleanupHistory: split('history') };
    const value = registerCanonical(root, config, kind, name, canonical, aliases, { allowMissing: flag('allow-missing'), metadata });
    console.log(`Registered ${kind} ${name} -> ${value.canonical}`);
    if (loadBaseline(root, config)) console.log('This modifies the canonical architecture registry after adoption and therefore requires a human governance PR.');
    process.exit(0);
  }


  if (command === 'responsibility') {
    const [sub, name] = positional(1);
    const map = responsibilityMap(root, config);
    if (sub === 'list') {
      const values = Object.values(map).sort((a,b) => a.name.localeCompare(b.name));
      if (json) printJson(values); else {
        console.log('GREEN ROOM RESPONSIBILITIES\n' + '='.repeat(64));
        if (!values.length) console.log('  (none registered)');
        for (const r of values) console.log(`  ${r.name} -> ${r.canonical.join(', ') || '(unknown)'}${r.owner ? `  owner=${r.owner}` : ''}`);
      }
      process.exit(0);
    }
    if (sub === 'show' && name) {
      const r = map[name];
      if (!r) { console.error(`Unknown responsibility: ${name}`); process.exit(2); }
      if (json) printJson(r); else console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    }
    console.error('Usage: greenroom responsibility list | greenroom responsibility show <id>'); process.exit(2);
  }

  if (command === 'explain') {
    const id = positional(1)[0];
    if (!id) { console.error('Usage: greenroom explain <finding-id>'); process.exit(2); }
    const item = result.findings?.find((x) => x.id === id) || result.violations.find((x) => x.id === id);
    if (!item) { console.error(`Finding not found: ${id}`); process.exit(2); }
    if (json) printJson(item); else console.log(JSON.stringify(item, null, 2));
    process.exit(0);
  }

  if (command === 'doctor' || command === 'find') {
    const query = positional(1).join(' ').trim();
    if (!query) { console.error(`Usage: greenroom ${command} "task description"`); process.exit(2); }
    const r = doctor(query, root, config, result, sourceFiles(root, config));
    if (json) printJson(r); else console.log(doctorText(r));
    process.exit(0);
  }

  if (command === 'cleanup' && positional(1)[0] === 'approve') {
    const campaignId = positional(1)[1];
    if (!campaignId) { console.error('Usage: greenroom cleanup approve <campaign-id> --owner=x --reason="..." [--canonical=path|none] [--preserve=a,b]'); process.exit(2); }
    const preserve = String(option('preserve','')).split(',').map((x)=>x.trim()).filter(Boolean);
    const approved = approveCampaign(root, campaignId, { owner: option('owner'), reason: option('reason'), canonicalDecision: option('canonical',''), behaviorMustSurvive: preserve });
    console.log(`Cleanup campaign approved: ${approved.id} by ${approved.approval.owner}`);
    process.exit(0);
  }

  if (command === 'cleanup' && positional(1)[0] === 'verify') {
    const campaignId = positional(1)[1];
    if (!campaignId) { console.error('Usage: greenroom cleanup verify <campaign-id> [--no-run]'); process.exit(2); }
    const verified = verifyCampaign(root, config, campaignId, { runCommands: !flag('no-run') });
    if (json) printJson(verified); else console.log(JSON.stringify(verified, null, 2));
    process.exit(verified.ok ? 0 : 1);
  }

  if (command === 'cleanup' && positional(1)[0] === 'openspec') {
    const campaignId = positional(1)[1];
    if (!campaignId) { console.error('Usage: greenroom cleanup openspec <campaign-id> [--name=change-name] [--no-validate]'); process.exit(2); }
    const exported = exportCampaignToOpenSpec(root, campaignId, { name: option('name',''), validate: !flag('no-validate') });
    if (json) printJson(exported);
    else {
      console.log(`OpenSpec cleanup change created: ${exported.path}`);
      if (exported.validation?.installed) console.log(`OpenSpec validation: ${exported.validation.validated ? 'PASS' : 'FAIL'} (${exported.validation.version || 'version unknown'})`);
      else if (exported.validation?.skipped) console.log('OpenSpec validation: skipped by --no-validate');
      else console.log('OpenSpec validation: OpenSpec CLI not installed; generated artifacts were not externally validated.');
      console.log('This bridge is for behavior-preserving cleanup. If cleanup changes product behavior, author real OpenSpec delta specs instead of using skip_specs.');
    }
    process.exit(0);
  }

  if (command === 'clean' || command === 'plan' || command === 'next' || (command === 'cleanup' && positional(1)[0] === 'plan')) {
    const batchSize = Number.parseInt(option('batch-size', '12'), 10);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) { console.error('--batch-size must be an integer from 1 to 100'); process.exit(2); }
    const p = createPlan(result, { batchSize, root });
    if (command === 'next') {
      const next = nextCleanupBatch(p);
      if (json) printJson(next || { clean: true });
      else if (!next) console.log('✓ No cleanup batch. The configured audit is clean.');
      else {
        console.log(`GREEN ROOM NEXT CLEANUP BATCH\n${'='.repeat(64)}\n${next.phase.title}\n${next.batch.id}\n\n${next.batch.goal}\n\nPaths:\n${next.batch.paths.map((x) => `  - ${x}`).join('\n')}\n\nViolations:\n${next.batch.items.map((x) => `  - [${x.id}] ${x.message}`).join('\n')}\n\nDefinition of done:\n${next.batch.definitionOfDone.map((x) => `  - ${x}`).join('\n')}`);
      }
      process.exit(0);
    }
    writePlan(root, p);
    if (json) printJson(p);
    else console.log(`Cleanup campaign written:\n  .greenroom/cleanup-plan.md\n  .greenroom/cleanup-plan.json\n\n${p.phases.length} phases · ${p.totalViolations} violations · entropy ${p.entropy}\nNo source files were modified.`);
    process.exit(0);
  }

  if (command === 'waive') {
    const id = positional(1)[0];
    if (!id) { console.error('Usage: greenroom waive <violation-id> --reason="..." --owner=name --expires=YYYY-MM-DD'); process.exit(2); }
    const target = result.violations.find((v) => v.id === id);
    if (!target) { console.error(`Violation not found in current audit: ${id}`); process.exit(2); }
    const waiver = addWaiver(root, config, target, { reason: option('reason'), owner: option('owner', ''), expiresAt: option('expires', '') });
    appendGovernanceLog(root, { action: 'waive', id, rule: target.rule, reason: waiver.reason, owner: waiver.owner, expiresAt: waiver.expiresAt || null });
    console.log(`Waiver recorded for ${id}.\nThis is a governance change. CI will reject it unless GREENROOM_ALLOW_GOVERNANCE_UPDATE=1 is explicitly enabled for the governance PR, and the adoption baseline governance hashes are updated.`);
    process.exit(0);
  }

  if (command === 'unwaive') {
    const id = positional(1)[0];
    if (!id) { console.error('Usage: greenroom unwaive <violation-id>'); process.exit(2); }
    const removed = removeWaiver(root, config, id);
    if (!removed) { console.error(`No waiver found for ${id}`); process.exit(2); }
    appendGovernanceLog(root, { action: 'unwaive', id });
    console.log(`Waiver removed: ${id}`);
    process.exit(0);
  }

  help(); process.exit(2);
} catch (err) {
  console.error(`Green Room failed: ${err?.stack || err}`);
  process.exit(2);
}
