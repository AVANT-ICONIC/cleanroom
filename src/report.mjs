export function groupByRule(violations) {
  const map = new Map();
  for (const v of violations) {
    if (!map.has(v.rule)) map.set(v.rule, []);
    map.get(v.rule).push(v);
  }
  return map;
}

export function auditText(result, { waived = [], expired = [] } = {}) {
  const lines = [];
  lines.push('GREEN ROOM AUDIT');
  lines.push('='.repeat(64));
  lines.push(`Source files scanned : ${result.files}`);
  lines.push(`Violations           : ${result.violations.length}`);
  lines.push(`Entropy score        : ${result.entropy}`);
  if (result.findings) lines.push(`Evidence findings    : ${result.findings.length}`);
  if (result.providers?.length) {
    const active = result.providers.map((p) => `${p.provider}:${p.status}(${p.findings || 0})`).join(', ');
    lines.push(`Evidence providers   : ${active}`);
  }
  if (waived.length) lines.push(`Active waivers       : ${waived.length}`);
  if (expired.length) lines.push(`Expired waivers      : ${expired.length}`);
  lines.push('');
  const groups = groupByRule(result.violations);
  if (!groups.size) lines.push('✓ Clean. No configured violations found.');
  for (const [rule, items] of groups) {
    lines.push(`${rule} (${items.length})`);
    for (const item of items.slice(0, 12)) lines.push(`  - [${item.id}] ${item.message}`);
    if (items.length > 12) lines.push(`  … ${items.length - 12} more`);
    lines.push('');
  }
  const evidenceOnly = (result.findings || []).filter((f) => !String(f.id).startsWith('v-'));
  if (evidenceOnly.length) {
    lines.push('EVIDENCE / REVIEW CANDIDATES');
    for (const item of evidenceOnly.slice(0, 16)) lines.push(`  - [${item.confidence}] ${item.kind}: ${item.message} [${item.id}]`);
    if (evidenceOnly.length > 16) lines.push(`  … ${evidenceOnly.length - 16} more`);
    lines.push('');
  }
  if (waived.length) {
    lines.push('WAIVED');
    for (const item of waived.slice(0, 12)) lines.push(`  - [${item.violation.id}] ${item.violation.message} — ${item.waiver.reason}`);
    if (waived.length > 12) lines.push(`  … ${waived.length - 12} more`);
    lines.push('');
  }
  return lines.join('\n');
}

export function checkText(current, reference, { referenceLabel = 'baseline', waived = [] } = {}) {
  const allowed = new Set((reference?.violations || []).map((v) => v.id));
  const currentIds = new Set(current.violations.map((x) => x.id));
  const fresh = current.violations.filter((v) => !allowed.has(v.id));
  const resolved = (reference?.violations || []).filter((v) => !currentIds.has(v.id));
  const lines = ['GREEN ROOM CHECK', '='.repeat(64)];
  lines.push(`Reference            : ${referenceLabel}`);
  lines.push(`Reference violations : ${reference?.violations?.length ?? 0}`);
  lines.push(`Current violations   : ${current.violations.length}`);
  lines.push(`Resolved             : ${resolved.length}`);
  lines.push(`Waived               : ${waived.length}`);
  lines.push(`NEW violations       : ${fresh.length}`);
  lines.push('');
  if (!fresh.length) lines.push('✓ PASS — no new entropy introduced.');
  else {
    lines.push('✗ BLOCKED — new entropy introduced:');
    for (const v of fresh) lines.push(`  - ${v.rule}: ${v.message} [${v.id}]`);
  }
  return { text: lines.join('\n'), fresh, resolved };
}
