import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { localBuildEnvironment } from './local-native-environment.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { mode, env } = localBuildEnvironment(root);
assert.equal(mode, 'production', 'Store bundles require explicit --production.');
assert(!readFileSync(resolve(root, 'src/config.ts'), 'utf8').includes('FURNIO_STORE_CAPTURE'), 'Remove capture fixtures before release.');
const signingDir = resolve(root, '.local-signing');
const credentialFile = resolve(signingDir, 'android-upload.json');
const keystore = resolve(signingDir, 'furnio-upload.jks');
mkdirSync(signingDir, { recursive: true, mode: 0o700 });
chmodSync(signingDir, 0o700);
assert.equal(existsSync(credentialFile), existsSync(keystore), 'Partial signing setup: recover existing credentials; do not replace the upload key.');
const keytool = '/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool';
assert(existsSync(keytool), 'Android Studio JDK is required.');
let credentials;
if (!existsSync(credentialFile)) {
  credentials = { alias: 'furnio-upload', password: randomBytes(32).toString('hex') };
  const result = spawnSync(keytool, ['-genkeypair', '-keystore', keystore, '-storetype', 'JKS',
    '-alias', credentials.alias, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-dname', 'CN=Furnio Upload', '-storepass:env', 'FURNIO_KEY_PASSWORD', '-keypass:env', 'FURNIO_KEY_PASSWORD'],
    { env: { ...env, FURNIO_KEY_PASSWORD: credentials.password }, encoding: 'utf8' });
  assert.equal(result.status, 0, 'Upload-key creation failed; inspect local keytool setup.');
  chmodSync(keystore, 0o600);
  writeFileSync(credentialFile, JSON.stringify(credentials), { flag: 'wx', mode: 0o600 });
} else credentials = JSON.parse(readFileSync(credentialFile, 'utf8'));
assert(credentials.alias && credentials.password, 'Incomplete upload credentials.');
Object.assign(env, {
  FURNIO_ANDROID_UPLOAD_STORE: keystore,
  FURNIO_ANDROID_UPLOAD_ALIAS: credentials.alias,
  FURNIO_ANDROID_UPLOAD_PASSWORD: credentials.password,
  JAVA_HOME: '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  CI: '1',
});
const gradleFile = resolve(root, 'android/app/build.gradle');
const require = createRequire(import.meta.url);
const { configureUploadSigning } = require('../plugins/with-android-upload-signing.cjs');
writeFileSync(gradleFile, configureUploadSigning(readFileSync(gradleFile, 'utf8')));
console.log('Building production Android bundle with dedicated upload signing. No upload or submission is performed.');
const result = spawnSync('./gradlew', [':app:createBundleReleaseJsAndAssets', '--rerun', ':app:bundleRelease',
  '--no-daemon', '--max-workers=2', '--console=plain'], {cwd:resolve(root,'android'), env, stdio:'inherit'});
assert.equal(result.status, 0, 'Android store build failed.');
const bundle = resolve(root, 'android/app/build/outputs/bundle/release/app-release.aab');
assert(existsSync(bundle), 'Expected signed bundle is missing.');
const embedded = spawnSync('unzip', ['-p', bundle, 'base/assets/app.config'], {encoding:'utf8'});
assert.equal(embedded.status, 0, 'Cannot inspect embedded app configuration.');
const configuration = JSON.parse(embedded.stdout);
assert.equal(configuration.extra?.furnioEnvironment, 'production', 'Bundle is not production.');
assert.equal(configuration.android?.package, 'ai.furnio.app', 'Unexpected Android package.');
const verification = spawnSync(resolve(dirname(keytool), 'jarsigner'), ['-verify', bundle], {env, encoding:'utf8'});
assert.equal(verification.status, 0, 'Bundle signature verification failed.');
assert(verification.stdout.includes('jar verified.'), 'Bundle is not signed.');
const certificate = spawnSync(keytool, ['-printcert', '-jarfile', bundle], {env, encoding:'utf8'});
const expected = spawnSync(keytool, ['-list', '-v', '-keystore', keystore, '-alias', credentials.alias,
  '-storepass:env', 'FURNIO_ANDROID_UPLOAD_PASSWORD'], {env, encoding:'utf8'});
const fingerprint = text => text.match(/SHA256:\s*([A-Fa-f0-9:]+)/)?.[1];
assert.equal(certificate.status, 0, 'Cannot read bundle signer.');
assert.equal(expected.status, 0, 'Cannot read upload certificate.');
assert(fingerprint(expected.stdout), 'Upload fingerprint missing.');
assert.equal(fingerprint(certificate.stdout), fingerprint(expected.stdout), 'Bundle uses the wrong signing key.');
const output = resolve(root, 'output/store');
mkdirSync(output, {recursive:true});
copyFileSync(bundle, resolve(output, 'furnio-production.aab'));
console.log('Signed bundle saved: output/store/furnio-production.aab. Back up .local-signing securely; never commit it.');
