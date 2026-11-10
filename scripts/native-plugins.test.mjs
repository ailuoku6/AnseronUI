import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { discoverNativePlugins, generateNativePlugins, pluginBuildConfig } from './native-plugins.mjs';
import { coreFingerprint } from './core-inputs.mjs';
import { createStandalone, setupStandalone } from './standalone-app.mjs';
const root = resolve('.');
function write(file, text) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, typeof text === 'string' ? text : JSON.stringify(text, null, 2)); }
function fixture() {
  const app = realpathSync(mkdtempSync(join(tmpdir(), 'anseronui plugins ')));
  const config = { app: { framework: root }, sourceDirs: [], pages: [] };
  write(join(app, 'anseronui.config.json'), config);
  write(join(app, 'package.json'), { dependencies: { '@test/device': '1.0.0' } });
  const plugin = join(app, 'node_modules/@test/device');
  const manifest = {
    name: '@test/device', version: '1.0.0', exports: './src/index.ts',
    anseronui: { schemaVersion: 1, typescript: 'src/index.ts',
      ios: { sources: ['ios'], factory: 'DevicePlugin', frameworks: ['UIKit'], infoPlist: { NSCameraUsageDescription: 'Scan a code' } },
      android: { sources: ['android'], factory: 'example.DevicePlugin', dependencies: ['androidx.core:core-ktx:1.15.0'], permissions: ['android.permission.CAMERA'] },
      web: { entry: 'web/index.ts' },
    },
  };
  write(join(plugin, 'package.json'), manifest);
  write(join(plugin, 'src/index.ts'), `import { useServices } from 'anseronui/ui';\nexport function useDevice() { return useServices(); }\n`);
  write(join(plugin, 'ios/DevicePlugin.swift'), `import UIKit\n@MainActor enum DevicePlugin {\n static func createExtensions() -> IOSPlatformExtensions {\n  IOSPlatformExtensions(modules: ["device": { _, _, complete in complete(.success("iOS")); return nil }])\n }\n}\n`);
  write(join(plugin, 'android/DevicePlugin.kt'), `package example\nimport android.content.Context\nimport org.anseronui.render.*\nobject DevicePlugin { fun createExtensions(context: Context) = AndroidPlatformExtensions() }\n`);
  write(join(plugin, 'web/index.ts'), 'export function createExtensions() { return {modules: {device() {return "web";}}}; }');
  return { app, plugin, manifest, config, cleanup: () => rmSync(app, { recursive: true, force: true }) };
}

test('discovers scoped/export-restricted and transitive packages once, ignores dev deps, detects missing production packages', () => {
  const f = fixture();
  try {
    write(join(f.app, 'package.json'), { dependencies: { wrapper: '1' }, devDependencies: { absent: '1' }, optionalDependencies: { 'absent-optional': '1' } });
    write(join(f.app, 'node_modules/wrapper/package.json'), { name: 'wrapper', dependencies: { '@test/device': '1' } });
    assert.deepEqual(discoverNativePlugins(f.app).map(plugin => plugin.name), ['@test/device']);
    write(join(f.app, 'package.json'), { dependencies: { absent: '1' } });
    assert.throws(() => discoverNativePlugins(f.app), /missing dependency absent/);
  } finally { f.cleanup(); }
});

test('generates platform factories, sources, permissions, dependencies and removes uninstalled plugins', () => {
  const f = fixture();
  try {
    const plugins = discoverNativePlugins(f.app);
    const directory = generateNativePlugins(f.app, plugins, 'ios-device');
    assert.match(readFileSync(join(directory, 'GeneratedPlugins.swift'), 'utf8'), /DevicePlugin.createExtensions/);
    assert.match(readFileSync(join(directory, 'GeneratedPlugins.kt'), 'utf8'), /example.DevicePlugin.createExtensions\(context\)/);
    const android = JSON.parse(readFileSync(join(directory, 'android.json')));
    assert.deepEqual(android.permissions, ['android.permission.CAMERA']);
    assert.deepEqual(android.dependencies, ['androidx.core:core-ktx:1.15.0']);
    assert.match(readFileSync(join(directory, 'web.ts'), 'utf8'), /createExtensions as plugin0/);
    const config = pluginBuildConfig(f.config, root, plugins);
    assert.equal(config.npmPlugins[0].name, '@test/device');
    assert.equal(resolve(root, config.npmPlugins[0].entry), join(f.plugin, 'src/index.ts'));
    generateNativePlugins(f.app, []);
    assert.doesNotMatch(readFileSync(join(directory, 'GeneratedPlugins.swift'), 'utf8'), /DevicePlugin/);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, 'android.json'))).sources, []);
  } finally { f.cleanup(); }
});

test('rejects invalid schemas, missing sources, escaping paths and unsupported targets before generating', () => {
  const f = fixture();
  try {
    for (const mutate of [
      spec => { spec.schemaVersion = 3; },
      spec => { spec.ios.factory = 'Bad();'; },
      spec => { delete spec.ios.factory; },
      spec => { spec.android.permissions = ['camera"/>']; },
      spec => { spec.ios.sources = ['missing']; },
      spec => { spec.typescript = '../../outside.ts'; },
      spec => { spec.unknown = true; },
    ]) {
      const manifest = structuredClone(f.manifest); mutate(manifest.anseronui);
      write(join(f.plugin, 'package.json'), manifest);
      assert.throws(() => discoverNativePlugins(f.app));
    }
    write(join(f.plugin, 'package.json'), f.manifest);
    const plugins = discoverNativePlugins(f.app); delete plugins[0].web;
    assert.throws(() => generateNativePlugins(f.app, plugins, 'web'), /does not support web/);
    assert.equal(existsSync(join(f.app, '.anseronui/plugins')), false);
    symlinkSync(root, join(f.plugin, 'external'));
    f.manifest.anseronui.ios.sources = ['external'];
    write(join(f.plugin, 'package.json'), f.manifest);
    assert.throws(() => discoverNativePlugins(f.app), /escapes package/);
  } finally { f.cleanup(); }
});

test('iOS descriptions conflict explicitly; app descriptions override defaults without changing source plist', () => {
  const f = fixture();
  try {
    const plugins = discoverNativePlugins(f.app);
    assert.throws(() => generateNativePlugins(f.app, [...plugins, {ios: {infoPlist: {NSCameraUsageDescription: 'Other'}}}]), /conflicting/);
    generateNativePlugins(f.app, plugins);
    mkdirSync(join(f.app, 'platforms/ios'), {recursive:true});
    write(join(f.app, 'platforms/ios/Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>NSCameraUsageDescription</key><string>App camera</string></dict></plist>');
    // Use the same generator shipped in npm apps.
    const script = join(f.app, 'scripts/generate-ios-project.py');
    write(script, readFileSync('scripts/templates/app/scripts/generate-ios-project.py', 'utf8'));
    f.config.app.applicationId = 'com.test.app'; write(join(f.app, 'anseronui.config.json'), f.config);
    const result = spawnSync('python3', [script], {encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(f.app, 'platforms/ios/App.xcodeproj/project.pbxproj'), 'utf8'), /DevicePlugin.swift/);
    assert.match(readFileSync(join(f.app, '.anseronui/plugins/Info.plist'), 'utf8'), /App camera/);
    assert.doesNotMatch(readFileSync(join(f.app, 'platforms/ios/Info.plist'), 'utf8'), /Scan a code/);
  } finally { f.cleanup(); }
});

test('local standalone setup stages npm TS imports and plugin changes invalidate Core fingerprints', () => {
  const f = fixture();
  try {
    const app = join(f.app, 'App');
    createStandalone(app, {name:'PluginApp', localFramework:true});
    write(join(app, 'package.json'), {dependencies:{'@test/device':'1'}});
    const ctx = setupStandalone(join(app, 'anseronui.config.json'));
    const config = JSON.parse(readFileSync(ctx.file));
    assert.equal(config.npmPlugins[0].name, '@test/device');
    const page = join(app, 'src/pages/home.tsx');
    write(page, `import { Text, definePage } from '@anseronui/ui';\nimport { useDevice } from '@test/device';\nfunction Home() { useDevice(); return <Text>Test</Text>; }\nexport const homePage = definePage('home', Home);\n`);
    const typecheck = spawnSync(process.execPath, ['scripts/anseronui.mjs', 'typecheck', '--config', join(app, 'anseronui.config.json')], {cwd:root, encoding:'utf8'});
    assert.equal(typecheck.status, 0, typecheck.stderr + typecheck.stdout);
    const before = coreFingerprint(root, ctx.file);
    write(join(f.plugin, 'src/index.ts'), readFileSync(join(f.plugin, 'src/index.ts'), 'utf8') + '\n// upgraded plugin\n');
    assert.notEqual(coreFingerprint(root, ctx.file), before);
    const result = spawnSync(process.execPath, ['--import','tsx','scripts/stage-core.mjs', ctx.file, 'business'], {cwd:root, encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const stage = result.stdout.trim();
    const entry = readFileSync(join(stage, 'entry.ts'), 'utf8');
    const homePath = entry.match(/from '\.\/(.*home.js)'/)[1].replace(/\.js$/, '.ts');
    const home = readFileSync(join(stage, homePath), 'utf8');
    assert.doesNotMatch(home, /from ['"]@test\/device/);
    const importPath = home.match(/import \{ useDevice \} from ['"]([^'"]+)/)[1];
    assert.match(readFileSync(resolve(dirname(join(stage, homePath)), importPath.replace(/\.js$/, '.ts')), 'utf8'), /function useDevice/);
  } finally { f.cleanup(); }
});

test('example plugin survives npm pack and offline tarball installation with all platform implementations', () => {
  const app = realpathSync(mkdtempSync(join(tmpdir(), 'anseronui packed plugin ')));
  try {
    const cache = join(app, 'cache');
    const pack = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--cache', cache, '--pack-destination', app], {cwd: join(root, 'examples/native-plugin'), encoding:'utf8'});
    assert.equal(pack.status, 0, pack.stderr);
    const [metadata] = JSON.parse(pack.stdout);
    for (const file of ['macos/DevicePlugin.swift', 'src/index.ts', 'ios/DevicePlugin.swift', 'android/DevicePlugin.kt', 'web/index.ts']) assert.ok(metadata.files.some(entry => entry.path === file), file);
    write(join(app, 'package.json'), {name:'plugin-consumer', private:true});
    write(join(app, 'anseronui.config.json'), {schemaVersion:2});
    const install = spawnSync('npm', ['install', join(app, metadata.filename), '--offline', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--cache', cache], {cwd:app, encoding:'utf8'});
    assert.equal(install.status, 0, install.stderr);
    const plugins = discoverNativePlugins(app);
    assert.deepEqual(plugins.map(plugin => plugin.name), ['@anseronui/example-device']);
    for (const target of ['ios', 'android', 'web', 'macos']) generateNativePlugins(app, plugins, target);
  } finally { rmSync(app, {recursive:true, force:true}); }
});

test('generated Web registry runs adapters and rejects duplicate or reserved registrations', () => {
  const f = fixture();
  try {
    const plugins = discoverNativePlugins(f.app);
    const directory = generateNativePlugins(f.app, plugins);
    const script = `import {createPluginExtensions} from ${JSON.stringify(join(directory,'web.ts'))}; const extensions = createPluginExtensions(); console.log(extensions.modules.device('info', null, new AbortController().signal));`;
    const run = () => spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {cwd:root, encoding:'utf8'});
    assert.equal(run().stdout.trim(), 'web');
    generateNativePlugins(f.app, [...plugins, ...plugins]);
    const duplicate = run(); assert.notEqual(duplicate.status, 0); assert.match(duplicate.stderr, /Duplicate or reserved native module: device/);
    write(join(f.plugin, 'web/index.ts'), 'export function createExtensions() { return { modules: {http() {return null;}}}; }');
    generateNativePlugins(f.app, plugins);
    const reserved = run(); assert.notEqual(reserved.status, 0); assert.match(reserved.stderr, /Duplicate or reserved native module: http/);
    write(join(f.plugin, 'web/index.ts'), "export function createExtensions() { return { modules: {device(){return 'web'}}, subscriptions: {'demo.tick': emit => {emit({value:42});return ()=>{};}}}; }");
    generateNativePlugins(f.app, plugins);
    const subscriptionScript = `import {createPluginExtensions} from ${JSON.stringify(join(directory,'web.ts'))};createPluginExtensions().subscriptions['demo.tick'](result=>console.log(result.value));`;
    const subscription = spawnSync(process.execPath, ['--import','tsx','--input-type=module','-e',subscriptionScript], {cwd:root,encoding:'utf8'});
    assert.equal(subscription.status, 0, subscription.stderr); assert.equal(subscription.stdout.trim(), '42');
    write(join(f.plugin, 'web/index.ts'), "export function createExtensions() { return { subscriptions: {'demo.tick': () => ()=>{}}}; }");
    generateNativePlugins(f.app, [...plugins, ...plugins]);
    const duplicateSource = run(); assert.notEqual(duplicateSource.status, 0); assert.match(duplicateSource.stderr, /Duplicate native subscription: demo.tick/);

  } finally { f.cleanup(); }
});

test('schema 2 explicitly registers AppKit plugins while schema 1 keeps its original boundary', () => {
  const f = fixture();
  try {
    write(join(f.plugin,'macos/DevicePlugin.swift'), 'import AppKit\n@MainActor enum MacDevicePlugin { static func createExtensions() -> MacOSPlatformExtensions { MacOSPlatformExtensions() } }');
    f.manifest.anseronui.macos = { sources:['macos'], factory:'MacDevicePlugin', frameworks:['AppKit'], infoPlist:{NSCameraUsageDescription:'Mac camera'} };
    write(join(f.plugin,'package.json'),f.manifest);
    assert.throws(() => discoverNativePlugins(f.app), /unknown field macos/);
    f.manifest.anseronui.schemaVersion = 2;
    write(join(f.plugin,'package.json'),f.manifest);
    const plugins = discoverNativePlugins(f.app);
    const directory = generateNativePlugins(f.app,plugins,'macos');
    assert.match(readFileSync(join(directory,'GeneratedMacOSPlugins.swift'),'utf8'),/MacDevicePlugin.createExtensions/);
    assert.match(readFileSync(join(directory,'GeneratedMacOSPlugins.swift'),'utf8'),/MacOSPlatformExtensions/);
    const config = JSON.parse(readFileSync(join(directory,'macos.json'),'utf8'));
    assert.deepEqual(config.frameworks,['AppKit']);
    assert.equal(config.infoPlist.NSCameraUsageDescription,'Mac camera');
    assert.equal(config.sources[0],join(f.plugin,'macos/DevicePlugin.swift'));
    delete plugins[0].macos;
    assert.throws(() => generateNativePlugins(f.app,plugins,'macos'),/does not support macos/);
    generateNativePlugins(f.app,[],'macos');
    assert.doesNotMatch(readFileSync(join(directory,'GeneratedMacOSPlugins.swift'),'utf8'),/MacDevicePlugin/);
  } finally { f.cleanup(); }
});
