// Exact existing web processors; only isolated staging resources are permitted.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
const root = '/Users/alipashaamidi/Dev/Furnio Mobile';
const main = '/Users/alipashaamidi/Dev/AI Virtual Staging/apps';
const wrangler = '/Users/alipashaamidi/.npm/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js';
assert.deepEqual(process.argv.slice(2), ['--staging-only']);
function secrets(file) {
  assert.equal(spawnSync('git', ['check-ignore', '-q', file], {cwd: root}).status, 0);
  assert.equal(statSync(`${root}/${file}`).mode & 0o777, 0o600);
  return parseEnv(readFileSync(`${root}/${file}`, 'utf8'));
}
const db = secrets('.env.staging-api.local');
const media = secrets('.env.staging-media.local');
assert.equal(db.SUPABASE_URL, 'https://bcrobmrimzkvfrnqarmv.supabase.co');
assert.equal(media.R2_BUCKET, 'furnio-mobile-staging-assets');
const values = {SUPABASE_SECRET_KEY: db.SUPABASE_SECRET_KEY,
  R2_ACCESS_KEY_ID: media.R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY: media.R2_SECRET_ACCESS_KEY};
for (const v of Object.values(values)) assert(typeof v === 'string' && v.length > 20);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(CLOUDFLARE_|CF_|WRANGLER_|FAL_|SUPABASE_|R2_)/.test(key)));
for (const [dir, suffix] of [['media-worker', 'media'], ['floorplan-worker', 'floorplan'], ['reference-furniture-worker', 'reference-furniture']]) {
  const cwd = `${main}/${dir}`;
  const config = JSON.parse(readFileSync(`${cwd}/wrangler.mobile-staging.jsonc`, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(config.name, `furnio-mobile-staging-${suffix}`);
  assert.equal(config.account_id, media.R2_ACCOUNT_ID);
  assert.equal(config.vars.SUPABASE_URL, db.SUPABASE_URL);
  assert.equal(config.vars.R2_BUCKET, media.R2_BUCKET);
  assert.deepEqual(config.r2_buckets, [{binding: 'R2', bucket_name: media.R2_BUCKET}]);
  assert.equal(config.workers_dev, false);
  assert.deepEqual(config.routes, []);
  for (const q of config.queues.consumers) {
    assert(q.queue.startsWith('furnio-mobile-staging-'));
    assert.equal(q.dead_letter_queue, `${q.queue}-dlq`);
  }
  for (const [command, input] of [[['deploy'], undefined], [['secret', 'bulk'], JSON.stringify(values)]]) {
    const result = spawnSync(process.execPath, [wrangler, ...command, '--config', 'wrangler.mobile-staging.jsonc', '--env-file', '/dev/null'],
      {cwd, env, input, encoding: 'utf8', timeout: 60000});
    assert.equal(result.status, 0, `${config.name} ${command.join(' ')} failed; raw output withheld`);
    console.log(`${config.name}: ${command.join(' ')} succeeded`);
    const version = result.stdout.match(/Current Version ID: ([a-f0-9-]+)/)?.[1];
    if (version) console.log(`Version: ${version}`);
  }
}
console.log('Three staging processors deployed. No FAL key, paid generation, production routes or production queues changed.');
