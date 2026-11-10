import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { build, createServer } from 'vite';
import { createStandalone } from './standalone-app.mjs';
import { generateNativePlugins } from './native-plugins.mjs';
import { validateIconConfig, generateAppIcons, integrateIOSIcons, integrateAndroidIcons, appIconWebPlugin, resizeIcon } from './app-icons.mjs';

const root = resolve('.');
const native = process.env.ANSERONUI_TEST_NATIVE_ICONS === '1';
const vector = '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#FFFFFFFF" android:pathData="M30,30h48v48h-48z"/></vector>';
function write(file, content) { mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, content); }
function fixture(t) {
  const app = mkdtempSync(join(tmpdir(), 'anseronui icons '));
  t.after(() => rmSync(app, { recursive: true, force: true }));
  const image = new PNG({ width: 1024, height: 1024 });
  for (let i = 0; i < image.data.length; i += 4) { image.data[i] = 50; image.data[i + 1] = 100; image.data[i + 2] = 200; image.data[i + 3] = 255; }
  write(join(app, 'assets/light.png'), PNG.sync.write(image));
  for (let i = 0; i < image.data.length; i += 4) image.data[i] = image.data[i + 1] = image.data[i + 2] = 100;
  write(join(app, 'assets/tinted.png'), PNG.sync.write(image));
  write(join(app, 'assets/mono.xml'), vector);
  return { app, config: { app: { icon: 'assets/light.png' } } };
}
function advanced() {
  return { app: { icon: {
    default: 'assets/light.png',
    ios: { type: 'images', dark: 'assets/tinted.png', tinted: 'assets/tinted.png' },
    android: { adaptive: { foreground: 'assets/light.png', background: { color: '#F4F6FA' }, monochrome: 'assets/mono.xml' }, night: { background: { image: 'assets/tinted.png' }, foreground: 'assets/mono.xml', monochrome: 'assets/mono.xml' } },
  } } };
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test('simple icon produces iOS, density-specific Android, PNG favicon and a valid macOS ICNS container', t => {
  const { app, config } = fixture(t);
  const ios = generateAppIcons(app, config, 'ios');
  const contents = JSON.parse(readFileSync(join(ios.path, 'AppIcon.appiconset/Contents.json')));
  assert.equal(contents.images[0].size, '1024x1024');
  const android = generateAppIcons(app, config, 'android');
  assert.equal(PNG.sync.read(readFileSync(join(android.res, 'mipmap-xxxhdpi/ic_launcher.png'))).width, 192);
  const web = generateAppIcons(app, config, 'web');
  assert.equal(PNG.sync.read(readFileSync(web.path)).width, 256);
  const mac = generateAppIcons(app, config, 'macos');
  const bytes = readFileSync(mac.path);
  assert.equal(bytes.toString('ascii', 0, 4), 'icns'); assert.equal(bytes.readUInt32BE(4), bytes.length);
  let offset = 8; const sizes = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset + 4);
    sizes.push(PNG.sync.read(bytes.subarray(offset + 8, offset + length)).width); offset += length;
  }
  assert.deepEqual(sizes, [16, 32, 64, 128, 256, 512, 1024, 32, 64, 256, 512]);
  assert.ok(existsSync(ios.path), 'building another platform must preserve iOS output');
});

test('advanced configuration maps dark/tinted appearances and adaptive/night/monochrome resources', t => {
  const { app } = fixture(t); const config = advanced();
  const ios = generateAppIcons(app, config, 'ios-device');
  const images = JSON.parse(readFileSync(join(ios.path, 'AppIcon.appiconset/Contents.json'))).images;
  assert.deepEqual(images.slice(1).map(image => image.appearances[0]), [{ appearance: 'luminosity', value: 'dark' }, { appearance: 'luminosity', value: 'tinted' }]);
  const { res } = generateAppIcons(app, config, 'android');
  assert.doesNotMatch(readFileSync(join(res, 'mipmap-anydpi-v26/ic_launcher.xml'), 'utf8'), /monochrome/);
  assert.match(readFileSync(join(res, 'mipmap-anydpi-v33/ic_launcher.xml'), 'utf8'), /monochrome/);
  assert.match(readFileSync(join(res, 'drawable-night/anseronui_icon_foreground.xml'), 'utf8'), /<vector/);
  assert.match(readFileSync(join(res, 'values-night/anseronui_icon.xml'), 'utf8'), /@drawable\/anseronui_icon_background_image/);
  assert.equal(PNG.sync.read(readFileSync(join(res, 'drawable-night-xxxhdpi/anseronui_icon_background_image.png'))).width, 432);
  assert.match(readFileSync(join(res, 'mipmap-night-anydpi-v26/ic_launcher.xml'), 'utf8'), /<adaptive-icon/);
  assert.match(readFileSync(join(res, 'mipmap-night-anydpi-v33/ic_launcher.xml'), 'utf8'), /<monochrome/);
});

test('configuration errors fail before replacing outputs, and removing configuration clears generated resources', t => {
  const { app, config } = fixture(t);
  const android = generateAppIcons(app, config, 'android');
  const original = readFileSync(join(android.res, 'mipmap-mdpi/ic_launcher.png'));
  const bad = advanced(); bad.app.icon.ios.tinted = 'assets/light.png';
  assert.throws(() => generateAppIcons(app, bad, 'android'), /grayscale/);
  assert.deepEqual(readFileSync(join(android.res, 'mipmap-mdpi/ic_launcher.png')), original);
  assert.throws(() => validateIconConfig(app, { app: { icon: { ios: { type: 'composer', source: 'missing.icon', dark: 'assets/tinted.png' } } } }), /cannot be combined/);
  assert.throws(() => validateIconConfig(app, { app: { icon: { android: { adaptive: { foreground: 'assets/mono.xml', background: { color: '#bad' } } } } } }), /RRGGBB/);
  assert.throws(() => validateIconConfig(app, { app: { icon: { android: { legacy: 'assets/light.png', night: { background: { color: '#000000' } } } } } }), /requires adaptive/);
  assert.throws(() => validateIconConfig(app, { app: { icon: { defualt: 'assets/light.png' } } }), /unknown field/);
  const generated = generateAppIcons(app, { app: {} }, 'android');
  assert.equal(generated.enabled, false);
  assert.ok(!existsSync(android.res));
  assert.doesNotMatch(readFileSync(join(app, '.anseronui/icons/android.gradle'), 'utf8'), /manifest.srcFile/);
});

test('validates PNG dimensions and iOS transparency while Android-only transparent artwork is accepted', t => {
  const { app } = fixture(t);
  const transparent = new PNG({ width: 1024, height: 1024 });
  write(join(app, 'assets/transparent.png'), PNG.sync.write(transparent));
  assert.throws(() => validateIconConfig(app, { app: { icon: 'assets/transparent.png' } }), /transparent/);
  assert.ok(validateIconConfig(app, { app: { icon: { android: { legacy: 'assets/transparent.png' } } } }).android);
  write(join(app, 'assets/small.png'), PNG.sync.write(new PNG({ width: 64, height: 64 })));
  assert.throws(() => validateIconConfig(app, { app: { icon: 'assets/small.png' } }), /1024/);
  write(join(app, 'assets/invalid.png'), 'not PNG');
  assert.throws(() => validateIconConfig(app, { app: { icon: 'assets/invalid.png' } }), /not a PNG/);
});

test('area resizing preserves a transparent glyph without adding dark fringes', t => {
  const { app } = fixture(t);
  const source = new PNG({ width: 2, height: 2 });
  source.data.set([255,255,255,255], 0);
  write(join(app, 'glyph.png'), PNG.sync.write(source));
  const pixel = PNG.sync.read(resizeIcon(join(app, 'glyph.png'), 1)).data;
  assert.deepEqual([...pixel], [255,255,255,64]);
});

test('accepts native icon directories and rejects incomplete or conflicting native declarations', t => {
  const { app } = fixture(t);
  write(join(app, 'native/App.icon/icon.json'), JSON.stringify({ layers: [] }));
  const composer = { app: { icon: { ios: { type: 'composer', source: 'native/App.icon' } } } };
  const ios = generateAppIcons(app, composer, 'ios');
  assert.equal(ios.fileType, 'folder.iconcomposer.icon');
  assert.ok(existsSync(join(ios.path, 'icon.json')));
  const set = join(app, 'native/App.appiconset');
  write(join(set, 'Contents.json'), JSON.stringify({ images: [{ filename: 'icon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { version: 1, author: 'xcode' } }));
  write(join(set, 'icon.png'), readFileSync(join(app, 'assets/light.png')));
  const copied = generateAppIcons(app, { app: { icon: { ios: { type: 'appiconset', source: 'native/App.appiconset' } } } }, 'ios');
  assert.ok(existsSync(join(copied.path, 'AppIcon.appiconset/icon.png')));
  write(join(app, 'native/res/mipmap-anydpi-v26/ic_launcher.xml'), '<adaptive-icon/>');
  const config = { app: { icon: { android: { resources: 'native/res' } } } };
  assert.ok(generateAppIcons(app, config, 'android').enabled);
  config.app.icon.android.legacy = 'assets/light.png';
  assert.throws(() => validateIconConfig(app, config), /cannot be combined/);
});

test('Android integration is idempotent and preserves custom host files; CLI check validates icon paths', t => {
  const { app } = fixture(t);
  const gradle = join(app, 'platforms/android/app/build.gradle');
  write(gradle, '// Custom application build\n');
  integrateAndroidIcons(app); integrateAndroidIcons(app);
  assert.equal(readFileSync(gradle, 'utf8').match(/AnseronUI app icon integration/g).length, 1);
  assert.match(readFileSync(gradle, 'utf8'), /Custom application build/);
  write(join(app, 'anseronui.config.json'), JSON.stringify({ buildId: 'icons', app: { icon: 'missing.png' }, pages: [{ source: 'page.tsx', export: 'page' }] }));
  const result = spawnSync(process.execPath, [join(root, 'scripts/anseronui.mjs'), 'check'], { cwd: app, encoding: 'utf8' });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /file not found: missing.png/);
});

test('Web build injects a base-aware favicon and removes it on a subsequent build without icons', async t => {
  const { app, config } = fixture(t);
  const web = join(app, 'web'), output = join(app, 'dist');
  write(join(web, 'index.html'), '<html><head><title>Example</title></head><body>App</body></html>');
  const options = { configFile: false, root: web, base: '/my-app/', logLevel: 'silent', build: { outDir: output, emptyOutDir: true } };
  await build({ ...options, plugins: [appIconWebPlugin(app, config)] });
  assert.match(readFileSync(join(output, 'index.html'), 'utf8'), /href="\/my-app\/anseronui-icon.png"/);
  assert.equal(PNG.sync.read(readFileSync(join(output, 'anseronui-icon.png'))).width, 256);
  await build({ ...options, plugins: [appIconWebPlugin(app, {})] });
  assert.doesNotMatch(readFileSync(join(output, 'index.html'), 'utf8'), /anseronui-icon/);
  assert.ok(!existsSync(join(output, 'anseronui-icon.png')));
});

test('Web development serves the configured icon under Vite base', async t => {
  const { app, config } = fixture(t);
  write(join(app, 'web/index.html'), '<html><head></head><body>App</body></html>');
  const plugin = appIconWebPlugin(app, config);
  const server = await createServer({ configFile: false, root: join(app, 'web'), base: '/demo/', logLevel: 'silent', server: { middlewareMode: true }, plugins: [plugin] });
  t.after(() => server.close());
  let middleware;
  plugin.configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  const headers = {};
  const bytes = await new Promise((resolve, reject) => middleware(
    { url: '/demo/anseronui-icon.png', method: 'GET', headers: {} },
    { setHeader(key, value) { headers[key] = value; }, end: resolve },
    error => reject(error ?? new Error('icon middleware did not serve the request')),
  ));
  assert.equal(headers['Content-Type'], 'image/png');
  assert.equal(PNG.sync.read(bytes).width, 256);
  const html = await server.transformIndexHtml('/demo/', readFileSync(join(app, 'web/index.html'), 'utf8'));
  assert.match(html, /href="\/demo\/anseronui-icon.png"/);
});

test('native Android resource compiler accepts density, adaptive, monochrome and night resources', { skip: !native }, t => {
  const { app } = fixture(t); const config = advanced();
  const { res } = generateAppIcons(app, config, 'android');
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Library/Android/sdk');
  const aapt = join(sdk, 'build-tools/35.0.0/aapt2');
  run(aapt, ['compile', '--dir', res, '-o', join(app, 'resources.zip')]);
  const manifest = join(app, 'AndroidManifest.xml');
  write(manifest, '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="org.anseronui.iconprobe"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="35"/><application android:icon="@mipmap/ic_launcher"/></manifest>');
  run(aapt, ['link', '-I', join(sdk, 'platforms/android-35/android.jar'), '--manifest', manifest, '-o', join(app, 'probe.apk'), join(app, 'resources.zip')]);
  assert.ok(existsSync(join(app, 'probe.apk')));
});

test('native iOS compiler accepts all appearances and generated projects include icon resources', { skip: !native || process.platform !== 'darwin' }, t => {
  const { app } = fixture(t);
  createStandalone(join(app, 'Host'), { name: 'IconHost', localFramework: true });
  const host = join(app, 'Host');
  generateNativePlugins(host, []);
  const config = { app: { icon: { ios: { light: '../assets/light.png', dark: '../assets/tinted.png', tinted: '../assets/tinted.png' } } } };
  const icon = generateAppIcons(host, config, 'ios');
  run('python3', [join(host, 'scripts/generate-ios-project.py')]);
  integrateIOSIcons(host, icon); integrateIOSIcons(host, icon);
  const project = JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', join(host, 'platforms/ios/App.xcodeproj/project.pbxproj')]));
  const refs = Object.values(project.objects).filter(value => value.lastKnownFileType === 'folder.assetcatalog');
  assert.equal(refs.length, 1);
  const configurations = Object.values(project.objects).filter(value => value.buildSettings?.PRODUCT_NAME === 'App');
  assert.ok(configurations.every(value => value.buildSettings.ASSETCATALOG_COMPILER_APPICON_NAME === 'AppIcon'));
  const output = join(app, 'compiled'); mkdirSync(output);
  run('xcrun', ['actool', icon.path, '--compile', output, '--platform', 'iphonesimulator', '--minimum-deployment-target', '15.0', '--app-icon', 'AppIcon', '--target-device', 'iphone', '--target-device', 'ipad', '--output-partial-info-plist', join(app, 'partial.plist')]);
  assert.ok(readdirSync(output).includes('Assets.car'));
});
