import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(".");
const sandbox = resolve(".verification/anseronui-cli-test");
function run(...args) {
  return spawnSync(process.execPath, ["scripts/anseronui.mjs", ...args], { cwd: root, encoding: "utf8" });
}

test("CLI creates and checks a new app, and scaffolds existing app integration", () => {
  rmSync(sandbox, { recursive: true, force: true });
  mkdirSync(sandbox, { recursive: true });
  const created = join(sandbox, "new-app");
  const create = run("create", created, "--name", "new-app", "--local-framework");
  assert.equal(create.status, 0, create.stderr || create.stdout);
  const check = run("check", "--config", join(created, "anseronui.config.json"));
  assert.equal(check.status, 0, check.stderr || check.stdout);
  assert.ok(existsSync(join(created, "src/pages/home.tsx")));
  assert.ok(existsSync(join(created, "web/vite.config.ts")));
  const config = JSON.parse(readFileSync(join(created, "anseronui.config.json"), "utf8"));
  assert.deepEqual(config.pages.map(page => page.name), ["home", "details"]);
  assert.match(readFileSync(join(created, "web/main.ts"), "utf8"), /handleBackPress/);
  const generatedPackage = JSON.parse(readFileSync(join(created, "package.json"), "utf8"));
  assert.equal(typeof generatedPackage.scripts["build:ios"], "string");
  assert.equal(typeof generatedPackage.scripts["build:android"], "string");
  const existing = join(sandbox, "existing-app"); mkdirSync(existing);
  const integrate = run("integrate", existing, "--name", "existing-app");
  assert.equal(integrate.status, 0, integrate.stderr || integrate.stdout);
  assert.ok(existsSync(join(existing, "anseronui.config.json")));
  assert.ok(existsSync(join(existing, "ANSERONUI_INTEGRATION.md")));
  rmSync(sandbox, { recursive: true, force: true });
});

// Exercise the public CLI with fake device tools: no simulator or SDK is needed.
import { mkdtempSync, writeFileSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { selectIOS, selectAndroid } from './standalone-app.mjs';
import { validateIconConfig, generateAppIcons } from './app-icons.mjs';
import { PNG } from 'pngjs';

const cli = join(root, 'scripts/anseronui.mjs');
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'anseronui standalone '));
  const app = join(directory, 'MyApp');
  const result = run('create', app, '--name', 'MyApp', '--application-id', 'com.example.myapp', '--local-framework');
  assert.equal(result.status, 0, result.stderr);
  const config = join(app, 'anseronui.config.json');
  return { directory, app, config, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
function fakeTools(f) {
  const bin = join(f.directory, 'bin');
  const sdk = join(f.directory, 'sdk');
  mkdirSync(bin); mkdirSync(join(sdk, 'platform-tools'), { recursive: true }); mkdirSync(join(sdk, 'emulator'));
  const script = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CLI_TEST_LOG, JSON.stringify({tool,args})+'\\n');
if (tool === 'xcrun') {
  if (args.includes('list')) console.log(JSON.stringify({devices:{iOS:[{name:'Test iPhone',udid:'test-ios',isAvailable:true,state:process.env.CLI_TEST_IOS_SHUTDOWN && !fs.existsSync(process.env.CLI_TEST_LOG+'.boot')?'Shutdown':'Booted'}]}}));
  else if (args.includes('boot')) fs.writeFileSync(process.env.CLI_TEST_LOG+'.boot','1');
  else if (args.includes('install') && process.env.CLI_TEST_INSTALL_FAIL) process.exit(1);
} else if (tool === 'adb') {
  if (args[0] === 'devices') console.log(process.env.CLI_TEST_AUTO_AVD
    ? (fs.existsSync(process.env.CLI_TEST_LOG+'.avd') ? 'List of devices attached\\nemulator-5554\\tdevice' : 'List of devices attached')
    : process.env.CLI_TEST_DEVICES ?? 'List of devices attached\\nemulator-5554\\tdevice');
  else if (args.includes('emu')) console.log((args[1] === 'emulator-5554' ? 'TestAVD' : 'OtherAVD')+'\\nOK');
  else if (args.includes('sys.boot_completed')) console.log('1');
  else if (args.includes('ro.product.cpu.abilist')) console.log(process.env.CLI_TEST_ABI ?? 'arm64-v8a');
  else if (args.includes('install') && process.env.CLI_TEST_INSTALL_FAIL) process.exit(1);
  else if (args.includes('start')) console.log('Status: ok');
} else if (tool === 'emulator') {
  if (args.includes('-list-avds')) console.log('TestAVD');
  else { fs.writeFileSync(process.env.CLI_TEST_LOG+'.avd','1'); setTimeout(() => {}, 3000); }
}
`;
  for (const file of [join(bin, 'xcrun'), join(bin, 'open'), join(sdk, 'platform-tools/adb'), join(sdk, 'emulator/emulator')]) {
    writeFileSync(file, script); chmodSync(file, 0o755);
  }
  const log = join(f.directory, 'calls.jsonl');
  return { log, env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, PATH: bin + ':' + process.env.PATH, CLI_TEST_LOG: log }, calls: () => readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) };
}
function appCLI(f, args, env = process.env) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: f.app, encoding: 'utf8', env });
}

test('create supports an external directory with spaces, keeps its identity and refuses overwrite', () => {
  const f = fixture();
  try {
    const config = JSON.parse(readFileSync(f.config, 'utf8'));
    assert.equal(config.app.name, 'MyApp'); assert.equal(config.app.applicationId, 'com.example.myapp');
    assert.equal(resolve(realpathSync(f.app), config.app.framework), root);
    const icons = validateIconConfig(f.app, config);
    assert.ok(icons.ios.dark && icons.ios.tinted && icons.android.adaptive.monochrome && icons.web && icons.macos);
    assert.deepEqual(readFileSync(join(f.app, config.app.icon.default)), readFileSync(join(root, 'assets/icons/app.png')));
    for (const target of ['ios', 'android', 'web', 'macos']) {
      const generated = generateAppIcons(f.app, config, target);
      assert.ok(generated.enabled);
      assert.ok(existsSync(generated.path ?? generated.res));
    }
    assert.equal(PNG.sync.read(readFileSync(join(f.app, '.anseronui/icons/web/anseronui-icon.png'))).width, 256);
    assert.ok(existsSync(resolve(root, config.pages[0].source)));
    assert.ok(existsSync(join(f.app, 'platforms/android/gradle/wrapper/gradle-wrapper.jar')));
    assert.ok(existsSync(join(f.app, 'platforms/ios/App.swift')));
    assert.equal(appCLI(f, ['check']).status, 0);
    // The generated npm forwarding script must resolve the CLI from the app cwd.
    const check = spawnSync('npm', ['run', 'check'], { cwd: f.app, encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);
    const again = run('create', f.app);
    assert.notEqual(again.status, 0); assert.match(again.stderr, /not empty/);
    const before = readFileSync(f.config, 'utf8');
    const invalid = run('create', f.app, '--force', '--application-id', "com.invalid';app");
    assert.notEqual(invalid.status, 0); assert.equal(readFileSync(f.config, 'utf8'), before);
  } finally { f.cleanup(); }
});

test('device selection rejects ambiguity, unavailable simulators and unauthorized Android devices', () => {
  assert.throws(() => selectIOS({iOS:[{name:'iPhone',udid:'a',isAvailable:true,state:'Booted'},{name:'iPhone',udid:'b',isAvailable:true,state:'Booted'}]}), /Multiple/);
  assert.throws(() => selectIOS({iOS:[{name:'iPhone',udid:'a',isAvailable:false,state:'Booted'}]}, 'a'), /missing/);
  assert.equal(selectIOS({iOS:[{name:'iPhone',udid:'a',isAvailable:true,state:'Shutdown'}]}).udid, 'a');
  assert.throws(() => selectAndroid('List of devices attached\na\tdevice\nb\tdevice'), /Multiple/);
  assert.throws(() => selectAndroid('List of devices attached\na\tunauthorized', 'a'), /unauthorized/);
  assert.equal(selectAndroid('List of devices attached\na\tdevice\nb\tdevice', 'b'), 'b');
});

test('run dry-run performs no setup, device calls or build; unknown platforms and conflicting selectors fail', () => {
  const f = fixture();
  try {
    const result = appCLI(f, ['run', 'ios', '--dry-run', '--device', 'example']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).device, 'example');
    assert.ok(!existsSync(join(f.app, 'node_modules')));
    assert.ok(!existsSync(join(f.app, '.verification')));
    assert.notEqual(appCLI(f, ['run', 'web', '--dry-run']).status, 0);
    assert.notEqual(appCLI(f, ['run', 'android', '--dry-run', '--device', 'a', '--avd', 'b']).status, 0);
  } finally { f.cleanup(); }
});

test('Android run targets the chosen serial for install and launch, and stops on install failure or incompatible ABI', () => {
  const f = fixture(); const fake = fakeTools(f);
  try {
    const apk = join(f.app, 'platforms/android/app/build/outputs/apk/debug'); mkdirSync(apk, { recursive: true }); writeFileSync(join(apk, 'app-debug.apk'), 'fixture');
    const result = appCLI(f, ['run', 'android', '--no-build', '--device', 'emulator-5554'], fake.env);
    assert.equal(result.status, 0, result.stderr);
    const calls = fake.calls().filter(item => item.tool === 'adb');
    const install = calls.find(item => item.args.includes('install'));
    assert.deepEqual(install.args.slice(0, 4), ['-s','emulator-5554','install','-r']);
    const launch = calls.find(item => item.args.includes('start'));
    assert.equal(launch.args.at(-1), 'com.example.myapp/.MainActivity');
    assert.ok(!calls.some(item => item.args.includes('build')));
    writeFileSync(fake.log, '');
    const failed = appCLI(f, ['run', 'android', '--no-build'], { ...fake.env, CLI_TEST_INSTALL_FAIL: '1' });
    assert.notEqual(failed.status, 0);
    assert.ok(!fake.calls().some(item => item.args.includes('start')));
    writeFileSync(fake.log, '');
    const abi = appCLI(f, ['run', 'android', '--no-build'], { ...fake.env, CLI_TEST_ABI: 'x86_64' });
    assert.notEqual(abi.status, 0); assert.match(abi.stderr, /arm64-v8a/);
    assert.ok(!fake.calls().some(item => item.args.includes('install')));
  } finally { f.cleanup(); }
});

test('iOS run installs and launches the selected simulator, and stops when install fails', { skip: process.platform !== 'darwin' }, () => {
  const f = fixture(); const fake = fakeTools(f);
  try {
    mkdirSync(join(f.app, '.verification/ios/Build/Products/Debug-iphonesimulator/App.app'), { recursive: true });
    const result = appCLI(f, ['run', 'ios', '--no-build', '--device', 'test-ios'], fake.env);
    assert.equal(result.status, 0, result.stderr);
    const calls = fake.calls().filter(item => item.tool === 'xcrun');
    assert.deepEqual(calls.find(item => item.args.includes('install')).args.slice(0,3), ['simctl','install','test-ios']);
    assert.deepEqual(calls.find(item => item.args.includes('launch')).args, ['simctl','launch','--terminate-running-process','test-ios','com.example.myapp']);
    writeFileSync(fake.log, '');
    const failed = appCLI(f, ['run', 'ios', '--no-build', '--device', 'test-ios'], { ...fake.env, CLI_TEST_INSTALL_FAIL: '1' });
    assert.notEqual(failed.status, 0);
    assert.ok(!fake.calls().some(item => item.args.includes('launch')));
  } finally { f.cleanup(); }
});

test('Android explicit AVD selects that emulator even with multiple connected devices', () => {
  const f = fixture(); const fake = fakeTools(f);
  try {
    const apk = join(f.app, 'platforms/android/app/build/outputs/apk/debug'); mkdirSync(apk, { recursive: true }); writeFileSync(join(apk, 'app-debug.apk'), 'fixture');
    const result = appCLI(f, ['run', 'android', '--no-build', '--avd', 'TestAVD'], { ...fake.env, CLI_TEST_DEVICES: 'List of devices attached\nemulator-5554\tdevice\nemulator-5556\tdevice' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fake.calls().find(item => item.args.includes('install')).args[1], 'emulator-5554');
  } finally { f.cleanup(); }
});

test('Android run boots the only AVD when no devices are connected', () => {
  const f = fixture(); const fake = fakeTools(f);
  try {
    const apk = join(f.app, 'platforms/android/app/build/outputs/apk/debug'); mkdirSync(apk, { recursive: true }); writeFileSync(join(apk, 'app-debug.apk'), 'fixture');
    const result = appCLI(f, ['run', 'android', '--no-build'], { ...fake.env, CLI_TEST_AUTO_AVD: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fake.calls().find(item => item.tool === 'emulator' && item.args.includes('-avd')).args, ['-avd','TestAVD','-no-snapshot-save']);
    assert.ok(fake.calls().some(item => item.args.includes('install')));
  } finally { f.cleanup(); }
});

test('iOS run boots a selected shutdown simulator before installing', { skip: process.platform !== 'darwin' }, () => {
  const f = fixture(); const fake = fakeTools(f);
  try {
    mkdirSync(join(f.app, '.verification/ios/Build/Products/Debug-iphonesimulator/App.app'), { recursive: true });
    const result = appCLI(f, ['run', 'ios', '--no-build', '--device', 'test-ios'], { ...fake.env, CLI_TEST_IOS_SHUTDOWN: '1' });
    assert.equal(result.status, 0, result.stderr);
    const calls = fake.calls().filter(item => item.tool === 'xcrun');
    const boot = calls.findIndex(item => item.args.includes('boot'));
    const install = calls.findIndex(item => item.args.includes('install'));
    assert.ok(boot >= 0 && install > boot);
  } finally { f.cleanup(); }
});

test('macOS scaffolds an AppKit host and runs locally with explicit artifact validation', () => {
  const f = fixture();
  try {
    assert.ok(existsSync(join(f.app,'platforms/macos/App.swift')));
    const pkg = JSON.parse(readFileSync(join(f.app,'package.json'),'utf8'));
    assert.match(pkg.scripts['build:macos'],/build macos/);
    assert.match(pkg.scripts.macos,/run macos/);
    const preview = appCLI(f,['run','macos','--dry-run','--no-build']);
    assert.equal(preview.status,0,preview.stderr);
    assert.deepEqual(JSON.parse(preview.stdout).steps,['validate app','launch locally']);
    const device = appCLI(f,['run','macos','--device','unexpected','--dry-run']);
    assert.notEqual(device.status,0); assert.match(device.stderr,/runs locally/);
    if (process.platform === 'darwin' && process.arch === 'arm64') {
      const absent = appCLI(f,['run','macos','--no-build']);
      assert.notEqual(absent.status,0); assert.match(absent.stderr,/app missing/);
    }
  } finally { f.cleanup(); }
});
