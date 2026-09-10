// Real hosted storage test, no FAL calls, purchases, customer photos or SMS.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { root, stagingRef } from './staging-db.mjs';
assert.deepEqual(process.argv.slice(2), ['--staging-only']);
const keys = parseEnv(readFileSync(`${root}/.env.staging-api.local`, 'utf8'));
const fixtures = JSON.parse(readFileSync(`${root}/output/staging-customers.json`, 'utf8'));
assert.equal(keys.SUPABASE_PROJECT_REF, stagingRef);
assert.equal(fixtures.projectRef, stagingRef);
const authOptions = {auth: {persistSession: false, autoRefreshToken: false}};
const admin = createClient(`https://${stagingRef}.supabase.co`, keys.SUPABASE_SECRET_KEY, authOptions);
const sessions = [];
const checks = [];
function pass(label) { checks.push(label); console.log(`PASS: ${label}`); }
async function fixtureSession(label) {
  const fixture = fixtures.customers.find(c => c.label === label);
  assert.equal(fixture.email, `mobile-${label}@example.invalid`);
  const user = await admin.auth.admin.getUserById(fixture.id);
  assert(!user.error && user.data.user.app_metadata.furnio_staging_fixture === true);
  // Admin-generated test links stay in memory and send no email. This is not
  // represented as acceptance of user-facing password/OTP sign-in.
  const generated = await admin.auth.admin.generateLink({type: 'magiclink', email: fixture.email});
  assert(!generated.error && generated.data.properties?.hashed_token, 'Fixture link failed');
  const client = createClient(`https://${stagingRef}.supabase.co`, keys.SUPABASE_PUBLISHABLE_KEY, authOptions);
  const verified = await client.auth.verifyOtp({type: 'magiclink', token_hash: generated.data.properties.hashed_token});
  assert(!verified.error && verified.data.user?.id === fixture.id && verified.data.session, 'Fixture session failed');
  sessions.push(client);
  return verified.data.session.access_token;
}
const platform = 'https://furnio-api-mobile-staging.amidi-alipasha.workers.dev';
async function api(path, expected, token, body) {
  const result = await fetch(platform + path, {method: body === undefined ? 'GET' : 'POST',
    headers: {...(token ? {Authorization: `Bearer ${token}`} : {}), 'Content-Type': 'application/json'},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), redirect: 'error', signal: AbortSignal.timeout(30000)});
  const json = await result.json();
  assert.equal(result.status, expected, `Unexpected status at ${path}: ${result.status}; ${typeof json.error === 'string' ? json.error : 'details withheld'}`);
  return json;
}
function storageUrl(raw) {
  const url = new URL(raw);
  assert.equal(url.origin, 'https://414fde01446debc02bbdd49e29e3a875.r2.cloudflarestorage.com');
  assert(url.pathname.startsWith('/furnio-mobile-staging-assets/'));
  return url;
}
try {
  const owner = await fixtureSession('owner');
  const other = await fixtureSession('other');
  const pending = await fixtureSession('pending-phone');
  const balance = await api('/api/credits/balance', 200, owner);
  await api('/api/uploads/presign', 401, undefined, {});
  await api('/api/uploads/presign', 403, pending, {});
  await api('/api/uploads/presign', 400, owner, {contentType: 'text/html'});
  pass('Unsigned, phone-unverified and malformed uploads rejected');
  const {project} = await api('/api/projects', 201, owner, {
    name: 'Staging media acceptance — synthetic', address: '10 Test Street, Toronto, ON, Canada',
    addressLine1: '10 Test Street', countryCode: 'CA', locality: 'Toronto', region: 'ON',
  });
  const bytes = readFileSync(`${root}/assets/before.jpg`);
  const input = {projectId: project.id, featureSlug: 'virtual_staging', fileName: 'synthetic-before.jpg',
    contentLength: bytes.length, contentType: 'image/jpeg', outputCount: 1};
  await api('/api/uploads/presign', 404, other, input);
  const signed = await api('/api/uploads/presign', 201, owner, input);
  const target = storageUrl(signed.uploadUrl);
  assert(!Object.keys(signed.headers).some(h => /authorization|cookie/i.test(h)));
  const upload = await fetch(target, {method: 'PUT', headers: signed.headers, body: bytes, redirect: 'error', signal: AbortSignal.timeout(60000)});
  assert.equal(upload.status, 200, 'Private staging S3 PUT failed');
  const unsigned = await fetch(new URL(target.pathname, target.origin), {redirect: 'error'});
  assert([400,401,403].includes(unsigned.status), 'Unsigned storage unexpectedly public');
  await unsigned.body?.cancel();
  pass('Signed JPEG uploaded to private staging bucket; foreign project and unsigned storage denied');
  await api(`/api/uploads/${signed.assetId}/complete`, 404, other, {});
  const complete = await api(`/api/uploads/${signed.assetId}/complete`, 200, owner, {});
  assert.equal(complete.status, 'ready');
  assert(complete.width > 0 && complete.height > 0);
  const preview = await fetch(storageUrl(complete.previewUrl), {redirect: 'error', signal: AbortSignal.timeout(30000)});
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('Content-Type'), 'image/jpeg');
  const previewBytes = Buffer.from(await preview.arrayBuffer());
  assert.equal(previewBytes[0], 255); assert.equal(previewBytes[1], 216);
  writeFileSync(`${root}/output/staging-upload-preview.jpg`, previewBytes);
  await api(`/api/assets/${signed.assetId}/preview`, 404, other);
  await api(`/api/assets/${signed.assetId}/preview`, 200, owner);
  const replay = await api(`/api/uploads/${signed.assetId}/complete`, 200, owner, {});
  assert.equal(replay.assetId, signed.assetId);
  assert.deepEqual(await api('/api/credits/balance', 200, owner), balance);
  await api('/api/mobile/v1/jobs/stage', 503, owner, {});
  pass('Existing completion validates image, creates watermarked preview, supports repeat completion and preserves credits');
  pass('Cross-account completion/preview denied; FAL generation remains gated');
  writeFileSync(`${root}/output/staging-media-acceptance.json`, JSON.stringify({at: new Date().toISOString(), checks,
    projectId: project.id, assetId: signed.assetId, width: complete.width, height: complete.height,
    noGeneration: true, noProduction: true}, null, 2));
} finally {
  await Promise.all(sessions.map(client => client.auth.signOut({scope: 'local'})));
}
