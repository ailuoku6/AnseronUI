import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, withHTTPFixture } from './testing/process.mjs';
import { androidJava17 } from './testing/android-java.mjs';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const adb = sdk ? join(sdk, 'platform-tools/adb') : 'adb';
const output = args => execFileSync(adb, args, { encoding: 'utf8' }).trim();
const devices = output(['devices']).split(/\r?\n/).slice(1).map(line => line.split(/\s+/)).filter(([, state]) => state === 'device').map(([serial]) => serial);
const device = process.env.ANDROID_SERIAL ?? (devices.length === 1 ? devices[0] : undefined);
if (!device || !devices.includes(device)) throw new Error('Connect one arm64 Android device, or set ANDROID_SERIAL.');
if (!output(['-s', device, 'shell', 'getprop', 'ro.product.cpu.abilist']).split(',').includes('arm64-v8a')) throw new Error('The current Android Core requires arm64-v8a. An x86 emulator cannot execute it.');
const java = androidJava17();
const env = { ...process.env, ANDROID_SERIAL: device, JAVA_HOME: java };
await command('npm', ['run', 'build:android'], { env });
await withHTTPFixture(async () => {
  await command(adb, ['-s', device, 'reverse', 'tcp:5174', 'tcp:5174']);
  try { await command('examples/native/android/gradlew', ['-p', 'examples/native/android', ':app:connectedDebugAndroidTest', '--console=plain', '--no-daemon'], { env }); }
  finally { await command(adb, ['-s', device, 'reverse', '--remove', 'tcp:5174']); }
});
