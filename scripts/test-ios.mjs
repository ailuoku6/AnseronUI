import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { command, withHTTPFixture } from './testing/process.mjs';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('iOS tests require an Apple Silicon Mac with Xcode.');
const devices = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { encoding: 'utf8' })).devices;
const available = Object.entries(devices).filter(([runtime]) => runtime.includes('.iOS-')).flatMap(([, devices]) => devices).filter(device => device.isAvailable && device.name.startsWith('iPhone'));
const requested = process.env.IOS_SIMULATOR_UDID;
const device = requested ? available.find(device => device.udid === requested) : available.find(device => device.state === 'Booted') ?? available[0];
if (!device) throw new Error('Install an iOS simulator runtime, or set IOS_SIMULATOR_UDID to an available iPhone.');
console.log(`Testing on ${device.name} (${device.udid})`);
if (device.state !== 'Booted') await command('xcrun', ['simctl', 'boot', device.udid]);
try {
  await command('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);
  await command('npm', ['run', 'build:ios']);
  await mkdir('.verification/tests/ios', { recursive: true });
  await withHTTPFixture(() => command('xcodebuild', ['-project', 'examples/native/ios/AnseronUIDemo.xcodeproj', '-scheme', 'AnseronUIDemo', '-configuration', 'Debug', '-destination', `platform=iOS Simulator,id=${device.udid}`, '-derivedDataPath', '.verification/ios-app', '-resultBundlePath', `.verification/tests/ios/Tests-${Date.now()}.xcresult`, '-parallel-testing-enabled', 'NO', 'ARCHS=arm64', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-', 'test']));
} finally {
  if (device.state !== 'Booted') await command('xcrun', ['simctl', 'shutdown', device.udid]);
}
