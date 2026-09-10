// Local screenshot-only demo builds; never run against a customer device.
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { resolve } from 'node:path';
const platform = process.argv[2];
if (!['ios', 'android', 'ipad'].includes(platform)) throw new Error('Specify ios, android or ipad');
const sim = platform === 'ipad' ? '6030D98F-47F7-4481-9D07-F2A21D4C06AE' : '890062D4-AB26-4389-94E5-043C1C95999D';
const adb = '/Users/alipashaamidi/Library/Android/sdk/platform-tools/adb';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', timeout: 60000 });
if (platform !== 'android') {
  try { run('xcrun', ['simctl', 'terminate', sim, 'ai.furnio.app']); } catch {}
  run('xcrun', ['simctl', 'launch', sim, 'ai.furnio.app']);
} else {
  run(adb, ['-s','emulator-5554','shell','am','force-stop','ai.furnio.app']);
  run(adb, ['-s','emulator-5554','shell','am','start','-n','ai.furnio.app/.MainActivity']);
}
await setTimeout(10000);
for (const name of ['home','services','staging','twilight','result','projects']) {
  const file = resolve(`store/captures/${platform}-${name}.png`);
  if (platform !== 'android') run('xcrun', ['simctl','io',sim,'screenshot',file]);
  else {
    run(adb, ['-s','emulator-5554','shell','screencap','-p','/sdcard/furnio-store.png']);
    run(adb, ['-s','emulator-5554','pull','/sdcard/furnio-store.png',file]);
  }
  console.log(`Captured ${platform} ${name}`);
  if (name !== 'projects') await setTimeout(15000);
}
