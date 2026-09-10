// Copy only the just-created, bucket-scoped R2 values through the owned UI.
// Secrets never appear in arguments/output, Expo config or tracked source.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
const root = '/Users/alipashaamidi/Dev/Furnio Mobile';
const path = resolve(root, '.env.staging-media.local');
const [mode] = process.argv.slice(2);
assert(['access-key', 'secret-key', 'install'].includes(mode));
const wrangler = '/Users/alipashaamidi/.npm/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js';
const cwd = '/Users/alipashaamidi/Dev/AI Virtual Staging/apps/api';
const common = ['--config', 'wrangler.mobile-staging.jsonc', '--env-file', '/dev/null'];
if (mode === 'install') {
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const values = parseEnv(readFileSync(path, 'utf8'));
  assert.equal(values.R2_BUCKET, 'furnio-mobile-staging-assets');
  assert.equal(values.R2_ACCOUNT_ID, '414fde01446debc02bbdd49e29e3a875');
  assert(/^[a-f0-9]{32}$/.test(values.R2_ACCESS_KEY_ID));
  assert(/^[a-f0-9]{64}$/.test(values.R2_SECRET_ACCESS_KEY));
  for (const name of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
    const result = spawnSync(process.execPath, [wrangler, 'secret', 'put', name, ...common], {
      cwd, input: values[name] + '\n', encoding: 'utf8', timeout: 60000,
    });
    assert.equal(result.status, 0, `Staging secret installation failed for ${name}; output withheld`);
    console.log(`Installed ${name} in customer staging Worker only`);
  }
} else {
  const clipboard = spawnSync('/usr/bin/pbpaste', [], {encoding: 'utf8'});
  assert.equal(clipboard.status, 0);
  const value = clipboard.stdout.trim();
  if (mode === 'access-key') {
    assert(/^[a-f0-9]{32}$/.test(value), 'Clipboard is not an R2 access key');
    writeFileSync(path, `R2_ACCOUNT_ID=414fde01446debc02bbdd49e29e3a875\nR2_BUCKET=furnio-mobile-staging-assets\nR2_ACCESS_KEY_ID=${value}\n`, {mode: 0o600, flag: 'wx'});
  } else {
    assert(/^[a-f0-9]{64}$/.test(value), 'Clipboard is not an R2 secret key');
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const existing = readFileSync(path, 'utf8');
    assert(!existing.includes('R2_SECRET_ACCESS_KEY='));
    writeFileSync(path, existing + `R2_SECRET_ACCESS_KEY=${value}\n`, {mode: 0o600});
  }
  spawnSync('/usr/bin/pbcopy', [], {input: ''});
  console.log(`Saved staging ${mode} in protected ignored file; clipboard cleared`);
}
