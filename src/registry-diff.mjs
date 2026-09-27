// Is this registry edit a DECLARATION, or an ARCHITECTURE CHANGE?
//
// WHY THIS EXISTS. `policy/registry-changed` fires on any byte-level difference
// in the canonical registry against the base branch. That is the right answer
// for an edit that rewrites what a responsibility owns, and the wrong answer for
// the only way the registry ever gets populated: adding a responsibility that
// did not exist.
//
// MEASURED 2026-09-17 in apex-nexus: the registry is
// `{"version":1,"responsibilities":{},"components":{}}` -- empty -- and 532
// files need declaring. Declaring them is roughly 34 pull requests. Under the
// byte rule every one of those is a governance PR needing
// GREENROOM_ALLOW_GOVERNANCE_UPDATE=1, and that flag switches off the policy,
// waiver, registry AND generated guards together. The rule as written pushes a
// project towards turning all four off for routine work, which is the opposite
// of what it is for.
//
// WHY ADDING IS SAFE TO WAVE THROUGH, AND CHANGING IS NOT. A new entry is not
// taken on trust. `analyzeRegistry` already judges it on its merits in the same
// run: `registry/duplicate-responsibility` rejects a second concept claiming a
// canonical path that is already spoken for, `registry/missing-canonical`
// rejects a canonical path that does not exist on disk, and
// `registry/noncanonical-component` rejects leaving a peer beside the canonical
// file. An addition therefore cannot quietly take ownership of anything, and
// cannot point at nothing. Those checks say nothing about an entry that was
// ALREADY there, so editing or deleting one stays exactly as blocked as before.
//
// RETIRING IS NOT REWRITING EITHER (2026-09-27). Deleting a dead module means
// deleting its entry too, or the registry points at nothing. A removed entry is
// a retirement when EVERY canonical path it claimed is gone from the tree and
// tombstoned by the project: the architecture already changed, in the same
// diff, and the project recorded why. The caller supplies that judgement as
// `isRetired(path)`; this module never touches the disk. A removed entry whose
// canonical is still on disk, or was never tombstoned, or that claimed no path
// at all, stays a mutation. MEASURED in apex-nexus #1778: six dead modules
// deleted, six entries retired, `policy/registry-changed` raised twice.
//
// This never opens a hole in the other three governance guards. It classifies
// one file, and only the registry.

import { canonicalPathsForEntry } from './analyzers/registry.mjs';

function parse(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value;
  } catch { return null; }
}

function section(registry, key) {
  const value = registry[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  }
  return value;
}

const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

/** Every top-level key that is not a bag of entries. Changing one is a mutation. */
function scalarKeys(registry) {
  return Object.keys(registry).filter((k) => k !== 'responsibilities' && k !== 'components');
}

/**
 * Classify a registry edit.
 *
 * Returns `kind`:
 *   'same'       identical, nothing to judge
 *   'additive'   entries were added; every entry that already existed is byte
 *                for byte what it was, and no other field moved
 *   'retiring'   as 'additive', and entries were removed whose every canonical
 *                path `isRetired` vouches for (listed in `retired`)
 *   'mutating'   an existing entry changed, an entry was removed that is not a
 *                retirement, or a top-level field outside the two entry bags
 *                moved
 *   'unreadable' either side is missing or is not a registry object
 *
 * 'unreadable' is its own answer and never collapses into 'additive'. A file we
 * cannot read is not a file we have judged, and the caller fails closed on it.
 */
export function classifyRegistryDiff(previousText, currentText, { isRetired = () => false } = {}) {
  const previous = parse(previousText);
  const current = parse(currentText);
  if (!previous || !current) {
    return { kind: 'unreadable', added: [], changed: [], removed: [], retired: [] };
  }

  const added = [];
  const changed = [];
  const removed = [];
  const retired = [];
  const retires = (key, value) => {
    const paths = canonicalPathsForEntry(key, value);
    return paths.length > 0 && paths.every((p) => isRetired(p));
  };

  for (const key of ['responsibilities', 'components']) {
    const before = section(previous, key);
    const after = section(current, key);
    for (const name of Object.keys(before)) {
      if (!(name in after)) (retires(key, before[name]) ? retired : removed).push(`${key}.${name}`);
      else if (!same(before[name], after[name])) changed.push(`${key}.${name}`);
    }
    for (const name of Object.keys(after)) {
      if (!(name in before)) added.push(`${key}.${name}`);
    }
  }

  // A top-level field outside the two entry bags is policy, not a declaration.
  // `version` going 1 -> 2 changes how every entry is read.
  const beforeKeys = scalarKeys(previous);
  const afterKeys = scalarKeys(current);
  const scalarMoved = beforeKeys.length !== afterKeys.length
    || beforeKeys.some((k) => !afterKeys.includes(k) || !same(previous[k], current[k]));
  if (scalarMoved) changed.push('(top-level)');

  const result = { added, changed, removed, retired };
  if (changed.length || removed.length) return { kind: 'mutating', ...result };
  if (retired.length) return { kind: 'retiring', ...result };
  if (added.length) return { kind: 'additive', ...result };
  return { kind: 'same', ...result };
}
