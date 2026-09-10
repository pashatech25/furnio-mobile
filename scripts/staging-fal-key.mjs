// Capture the owner's newly created inference-only key via its UI Copy button.
// Never prints it or adds credentials to the native app.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
const root = '/Users/alipashaamidi/Dev/Furnio Mobile';
const file = '.env.staging-fal.local';
const [mode] = process.argv.slice(2);
assert.equal(process.argv.length, 3);
assert(['--copy', '--install'].includes(mode));
assert.equal(spawnSync('git', ['check-ignore', '-q', file], {cwd:root}).status,0);
if (mode === '--copy') {
  const clipboard = spawnSync('/usr/bin/pbpaste', [], {encoding:'utf8'});
  assert.equal(clipboard.status,0);
  const key = clipboard.stdout.trim();
  assert(/^[A-Za-z0-9_-]{20,128}:[A-Za-z0-9_-]{20,128}$/.test(key), 'Clipboard is not a FAL credential; content withheld');
  writeFileSync(`${root}/${file}`, `FAL_KEY=${key}\n`, {mode:0o600,flag:'wx'});
  spawnSync('/usr/bin/pbcopy', [], {input:''});
  console.log('Saved owner-created FAL key in ignored protected file; clipboard cleared.');
} else {
  assert.equal(statSync(`${root}/${file}`).mode & 0o777,0o600);
  const key = parseEnv(readFileSync(`${root}/${file}`,'utf8')).FAL_KEY;
  assert(/^[A-Za-z0-9_-]{20,128}:[A-Za-z0-9_-]{20,128}$/.test(key));
  const wrangler='/Users/alipashaamidi/.npm/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js';
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(CF_|CLOUDFLARE_|WRANGLER_|FAL_|SUPABASE_|R2_)/.test(k)));
  // Install consumers first, customer entrypoint last.
  for(const [dir,name] of [['media-worker','furnio-mobile-staging-media'],['floorplan-worker','furnio-mobile-staging-floorplan'],
    ['reference-furniture-worker','furnio-mobile-staging-reference-furniture'],['api','furnio-api-mobile-staging']]) {
    const cwd=`/Users/alipashaamidi/Dev/AI Virtual Staging/apps/${dir}`;
    const config=JSON.parse(readFileSync(`${cwd}/wrangler.mobile-staging.jsonc`,'utf8').replace(/^\s*\/\/.*$/gm,''));
    assert.equal(config.name,name);
    assert.equal(config.account_id,'414fde01446debc02bbdd49e29e3a875');
    assert.equal(config.vars.SUPABASE_URL,'https://bcrobmrimzkvfrnqarmv.supabase.co');
    assert.equal(config.vars.R2_BUCKET,'furnio-mobile-staging-assets');
    assert.deepEqual(config.routes,[]);
    const r=spawnSync(process.execPath,[wrangler,'secret','put','FAL_KEY','--config','wrangler.mobile-staging.jsonc','--env-file','/dev/null'],
      {cwd,env,input:key+'\n',encoding:'utf8',timeout:60000});
    assert.equal(r.status,0,`${name} installation failed; output withheld`);
    console.log(`Installed FAL_KEY: ${name}`);
  }
  console.log('FAL connected to staging only. No generation submitted.');
}
