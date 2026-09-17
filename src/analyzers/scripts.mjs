import path from 'node:path';
import { readJson, readText, isInsideAny, walk } from '../lib/fs.mjs';
import { violation } from '../violations.mjs';
import { buildGraph } from './imports.mjs';

function normalizedScriptPath(value) { return value.replace(/^\.\//, '').replaceAll('\\', '/'); }
function lifecycleAllowed(name, ref, config) {
  if (!config.scripts.allowLifecycleHooks) return false;
  return name === `pre${ref}` || name === `post${ref}`;
}

function packageScriptViolations(root, config) {
  const out = [];
  const packages = walk(root, config).filter((f) => path.basename(f.rel) === 'package.json');
  if (!packages.some((f) => f.rel === 'package.json')) packages.unshift({ rel: 'package.json', abs: path.join(root, 'package.json') });
  const allowedPackage = new Set(config.scripts.allowPackageChains || []);
  for (const pkgFile of packages) {
    const pkg = readJson(pkgFile.abs, null);
    if (!pkg || typeof pkg !== 'object') continue;
    const scripts = pkg.scripts || {};
    for (const [name, cmd] of Object.entries(scripts)) {
      const refs = [...String(cmd).matchAll(/(?:npm|pnpm|yarn)\s+(?:run\s+)?([\w:-]+)/g)].map((m) => m[1]);
      for (const ref of refs) {
        const edge = `${name}->${ref}`;
        if (scripts[ref] && !lifecycleAllowed(name, ref, config) && !allowedPackage.has(edge) && !allowedPackage.has(`${pkgFile.rel}:${edge}`)) {
          out.push(violation('scripts/chain', [pkgFile.rel], `Package script "${name}" chains to "${ref}" in ${pkgFile.rel}`, `${pkgFile.rel}:${edge}`));
        }
      }
    }
  }
  return out;
}

export function analyzeScripts(root, files, config) {
  if (!config.rules.scriptChains) return [];
  const out = [];
  const scriptFiles = files.filter((f) => isInsideAny(f.rel, config.scriptRoots || []));
  const scriptSet = new Set(scriptFiles.map((f) => f.rel));
  const graph = buildGraph(root, files);
  const allowed = new Set(config.scripts.allowScriptImports || []);
  for (const f of scriptFiles) {
    for (const dep of graph.get(f.rel) || []) {
      if (scriptSet.has(dep) && !allowed.has(`${f.rel}->${dep}`)) out.push(violation('scripts/chain', [f.rel, dep], `Script imports another script: ${f.rel} -> ${dep}`, `${f.rel}->${dep}`));
    }
    const text = readText(f.abs);
    for (const target of scriptSet) {
      if (target === f.rel) continue;
      const bareTarget = normalizedScriptPath(target);
      const relativeFromScript = normalizedScriptPath(path.posix.relative(path.posix.dirname(f.rel), target));
      const variants = new Set([bareTarget, `./${bareTarget}`, relativeFromScript, `./${relativeFromScript}`]);
      if ([...variants].some((candidate) => candidate && text.includes(candidate)) && !allowed.has(`${f.rel}->${target}`)) out.push(violation('scripts/chain', [f.rel, target], `Script invokes another script path: ${f.rel} -> ${target}`, `${f.rel}->${target}`));
    }
  }
  out.push(...packageScriptViolations(root, config));
  return out;
}
