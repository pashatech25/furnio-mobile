import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Read-only source coverage gate. Does NOT connect to a database or generate
// deletion SQL. Full-schema/foreign-key/JSON/provider validation is still required.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inventory = JSON.parse(readFileSync(resolve(root, 'docs/account-data-inventory.json'), 'utf8'));
const snapshot = JSON.parse(readFileSync(resolve(root, 'docs/account-schema-baseline.json'), 'utf8'));
assert.equal(inventory.automaticDeletionEnabled, false, 'Do not repurpose this design inventory into executable deletion rules.');
const classified = inventory.groups.flatMap(group => group.tables);
assert.equal(new Set(classified).size, classified.length, 'Each table requires exactly one inventory category.');
const actual = new Set();
const changes = [];
for (const source of snapshot.sources) {
  const directory = resolve(root, source.directory);
  const filenames = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
  for (const filename of filenames) {
    const sql = readFileSync(resolve(directory, filename), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    if (source.files[filename] !== hash) changes.push(`${source.name}/${filename}`);
    for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?((?:public|private)\.[a-z_][a-z_0-9]*)\s*\(/gi)) actual.add(match[1].toLowerCase());
  }
  for (const filename of Object.keys(source.files)) if (!filenames.includes(filename)) changes.push(`${source.name}/${filename} (removed)`);
}
const missing = [...actual].filter(table => !classified.includes(table));
const stale = classified.filter(table => !actual.has(table));
assert.equal(missing.length, 0, `Unclassified tables: ${missing.join(', ')}`);
assert.equal(stale.length, 0, `Tables no longer found in source: ${stale.join(', ')}`);
assert.equal(changes.length, 0, `Schema source changed; review the deletion inventory (including altered columns/triggers) before updating its baseline: ${changes.join(', ')}`);
console.log(`Read-only inventory covers ${actual.size} declared tables across both repositories; migration hashes unchanged.`);
console.log('This is source coverage only. Cleanup implementation, live schema verification and retention approval remain pending.');
