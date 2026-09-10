import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localBuildEnvironment } from './local-native-environment.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { mode, env } = localBuildEnvironment(root);
assert.equal(mode, 'production', 'Archive requires explicit --production.');
env.DEVELOPER_DIR = '/Applications/Xcode.app/Contents/Developer';
const version = execFileSync('/usr/bin/xcodebuild', ['-version'], { env, encoding: 'utf8' });
assert(!/beta/i.test(version), 'Use the release Xcode toolchain.');
assert(!readFileSync(resolve(root, 'src/config.ts'), 'utf8').includes('FURNIO_STORE_CAPTURE'), 'Remove store capture fixtures.');
const sourceInfo = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', resolve(root, 'ios/Furnio/Info.plist')], { encoding: 'utf8' }));
assert(['$(MARKETING_VERSION)', '1.0.0'].includes(sourceInfo.CFBundleShortVersionString), 'Regenerate the iOS project for version 1.0.0 before archiving.');
const stamp = new Date().toISOString().replaceAll(':', '-');
const output = resolve(root, 'output/store');
mkdirSync(output, { recursive: true });
const archive = resolve(output, `Furnio-${stamp}.xcarchive`);
const logPath = resolve(output, `ios-archive-${stamp}.log`);
const log = createWriteStream(logPath, { mode: 0o600 });
console.log(`Archiving production Furnio with ${version.trim()}. Log: ${logPath}`);
const child = spawn('/usr/bin/xcodebuild', [
  '-quiet', '-workspace', 'ios/Furnio.xcworkspace', '-scheme', 'Furnio',
  '-configuration', 'Release', '-destination', 'generic/platform=iOS',
  '-archivePath', archive, '-derivedDataPath', 'output/xcode-store',
  '-allowProvisioningUpdates', 'DEVELOPMENT_TEAM=5SY24C9RBH',
  'CODE_SIGN_STYLE=Automatic', 'MARKETING_VERSION=1.0.0', 'CURRENT_PROJECT_VERSION=2',
  'archive',
], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let tail = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  log.write(chunk); tail = (tail + chunk.toString()).slice(-7000);
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => {
  log.end();
  if (code !== 0) { console.error(tail); process.exitCode = 1; return; }
  try {
    const app = resolve(archive, 'Products/Applications/Furnio.app');
    const config = JSON.parse(readFileSync(resolve(app, 'EXConstants.bundle/app.config'), 'utf8'));
    assert.equal(config.extra?.furnioEnvironment, 'production');
    assert.equal(config.ios?.bundleIdentifier, 'ai.furnio.app');
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' });
    const info = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', resolve(app, 'Info.plist')], { encoding: 'utf8' }));
    assert.equal(info.CFBundleIdentifier, 'ai.furnio.app');
    assert.equal(info.CFBundleShortVersionString, '1.0.0');
    assert.equal(info.CFBundleVersion, '2');
    assert.equal(config.version, '1.0.0');
    console.log(`Verified signed archive: ${archive}. Export/upload and review gates remain separate.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
});
