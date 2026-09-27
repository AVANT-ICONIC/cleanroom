// What a project deleted ON PURPOSE, as far as the registry needs to know.
//
// WHY THIS EXISTS. Retiring a dead module means deleting its file AND the
// registry entry that pointed at it. Keeping the entry would point the registry
// at nothing (`registry/missing-canonical`); removing it read as an architecture
// change (`policy/registry-changed`). A project with no live caller for a module
// had no way to delete it without GREENROOM_ALLOW_GOVERNANCE_UPDATE=1, the flag
// that switches four guards off together. MEASURED 2026-09-27 in apex-nexus
// #1778: six dead modules, six retired entries, the gate red twice.
//
// A tombstone is the project's own record of a deliberate deletion: an object
// with a `path` string (plus whatever reason/commit fields the project keeps).
// Two layouts are read, both beside the registry file:
//
//   <registry dir>/tombstones/*.json   one record (or an array) per file
//   <registry dir>/tombstones.json     an array, or { "tombstones": [...] }
//
// WHY NOT A CONFIG KEY. policyHash hashes the MERGED config, defaults included,
// so a new default key would move every consumer's policy hash and raise
// policy/config-changed against every existing baseline.
//
// UNREADABLE MEANS NO TOMBSTONES. A record we cannot parse is not a deletion we
// have seen decided. The only thing this set can do is exempt a removal, so
// the answer that claims least is the empty set, and the gate blocks as before.
import fs from 'node:fs';
import path from 'node:path';

function recordsIn(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(value.tombstones)) return value.tombstones;
  if (value && typeof value === 'object') return [value];
  return null;
}

function readRecords(file) {
  try { return recordsIn(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { return null; }
}

/** Every path the project tombstoned. Empty on any unreadable record. */
export function tombstonedPaths(root, config) {
  const dir = path.dirname(config.registryFile);
  const files = [];
  const monolith = path.join(root, dir, 'tombstones.json');
  if (fs.existsSync(monolith)) files.push(monolith);
  const folder = path.join(root, dir, 'tombstones');
  if (fs.existsSync(folder)) {
    let names;
    try { names = fs.readdirSync(folder); } catch { return new Set(); }
    for (const name of names.sort()) if (name.endsWith('.json')) files.push(path.join(folder, name));
  }
  const out = new Set();
  for (const file of files) {
    const records = readRecords(file);
    if (records == null) return new Set();
    for (const record of records) {
      if (record && typeof record.path === 'string' && record.path) out.add(record.path);
    }
  }
  return out;
}
