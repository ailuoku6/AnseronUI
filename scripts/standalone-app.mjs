import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, chmodSync, symlinkSync, realpathSync, rmSync, openSync, closeSync } from 'node:fs';
import { dirname, relative, resolve, join, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { copySDK, sdkFingerprint, toolchainHost, sdkAliases } from './sdk-files.mjs';
import { discoverNativePlugins, generateNativePlugins, pluginBuildConfig } from './native-plugins.mjs';

const framework = fileURLToPath(new URL('../', import.meta.url));
const templates = fileURLToPath(new URL('./templates/app/', import.meta.url));
const posix = value => value.split(sep).join('/');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: framework, stdio: 'inherit', ...options });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.stdout) process.stderr.write(result.stdout);
    throw new Error(`${command} failed (${result.signal ?? result.status})`);
  }
  return result.stdout?.trim();
}
const output = (command, args, options = {}) => run(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
function write(path, text) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); }
function tree(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(item => item.isDirectory() ? tree(join(path, item.name)) : [join(path, item.name)]);
}
function appContext(configPath) {
  const file = realpathSync(resolve(configPath));
  const config = json(file);
  if (!config.app) throw new Error('This command requires an independent app created with anseronui create.');
  const app = dirname(file);
  if (config.schemaVersion !== 2 && realpathSync(resolve(app, config.app.framework)) !== realpathSync(framework)) throw new Error('App points to a different framework. Use its configured framework CLI.');
  if (!/^[a-z][a-z0-9_-]{0,123}$/.test(config.buildId)) throw new Error('Invalid buildId');
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(config.app.applicationId)) throw new Error('Invalid applicationId');
  return { app, config, file };
}

export function createStandalone(targetPath, { name, applicationId, force = false, localFramework = false, packageSpec } = {}) {
  const requestedTarget = resolve(targetPath);
  const displayName = name ?? requestedTarget.split(sep).pop();
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(displayName)) throw new Error('App name must start with a letter and contain only letters, digits, underscores or hyphens (up to 80 characters).');
  const packageName = displayName.toLowerCase().replaceAll('_', '-');
  const identifier = applicationId ?? `com.${packageName.replaceAll('-', '')}.app`;
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(identifier)) throw new Error('Use a lowercase reverse-domain --application-id, e.g. com.example.myapp');
  // Resolve existing parent symlinks before checking for overlap with the framework.
  let ancestor = requestedTarget;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const physical = resolve(realpathSync(ancestor), relative(ancestor, requestedTarget));
  const target = physical;
  if (physical === realpathSync(framework) || relative(physical, realpathSync(framework)).split(sep)[0] !== '..' && !isAbsolute(relative(physical, realpathSync(framework)))) throw new Error('Target must not contain the framework itself.');
  if (existsSync(target) && readdirSync(target).length && !force) throw new Error(`Target is not empty: ${target}; use --force only to replace generated template files.`);
  const rel = posix(relative(framework, target));
  const config = {
    ...(!localFramework ? { schemaVersion: 2 } : {}),
    buildId: `${packageName}-app`,
    app: { name: displayName, applicationId: identifier, framework: localFramework ? posix(relative(target, framework)) || '.' : '.anseronui/sdk' },
    sourceDirs: [`${rel}/src`],
    pages: ['home', 'details'].map(page => ({ name: page, source: `${rel}/src/pages/${page}.tsx`, export: `${page}Page` })),
    web: { viteConfig: `${rel}/web/vite.config.ts`, publicDir: `${rel}/web/public` },
  };
  if (!localFramework) {
    config.sourceDirs = ['src'];
    config.pages.forEach(page => { page.source = `src/pages/${page.name}.tsx`; });
    config.web = { viteConfig: 'web/vite.config.ts', publicDir: 'web/public' };
  }
  const values = { __APP_NAME__: displayName, __APPLICATION_ID__: identifier, __BUILD_ID__: config.buildId };
  for (const source of tree(templates)) {
    const path = join(target, relative(templates, source).replace(/(^|[/\\])gitignore$/, '$1.gitignore'));
    mkdirSync(dirname(path), { recursive: true });
    if (source.endsWith('.jar')) copyFileSync(source, path);
    else {
      let contents = readFileSync(source, 'utf8').replace(/__APP_NAME__|__APPLICATION_ID__|__BUILD_ID__/g, token => values[token]);
      if (!localFramework) contents = contents.replaceAll('@anseronui/', 'anseronui/');
      writeFileSync(path, contents);
    }
  }
  if (localFramework) {
    // npm plugins use the public package name even while developing against a checkout.
    const aliases = { anseronui: resolve(framework, 'packages/ui/src/index.ts'),
      ...Object.fromEntries(Object.entries(sdkAliases).map(([name, path]) => [name.replace('@anseronui/', 'anseronui/'), resolve(framework, path)])) };
    const tsconfigPath = join(target, 'tsconfig.json');
    const tsconfig = json(tsconfigPath);
    tsconfig.compilerOptions.paths = Object.fromEntries(Object.entries(aliases).map(([name, path]) => [name, [path]]));
    write(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
    const vitePath = join(target, 'web/vite.config.ts');
    // Use exact RegExp aliases so the bare package alias cannot consume its subpaths.
    const viteAliases = Object.entries(aliases).map(([name, path]) => `{ find: new RegExp(${JSON.stringify('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')}), replacement: ${JSON.stringify(path)} }`).join(', ');
    write(vitePath, readFileSync(vitePath, 'utf8').replace('defineConfig({', `defineConfig({ resolve: { alias: [${viteAliases}] },`));
  }
  chmodSync(join(target, 'platforms/android/gradlew'), 0o755);
  write(join(target, 'anseronui.config.json'), JSON.stringify(config, null, 2) + '\n');
  const cli = posix(relative(target, join(framework, 'scripts/anseronui.mjs')));
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  const forward = localFramework ? `node ${quote(cli)}` : 'anseronui';
  const scripts = {
    setup: `${forward} setup`, check: `${forward} check`, typecheck: `${forward} typecheck`,
    'dev:web': `${forward} dev web`,
    ...Object.fromEntries(['web', 'ios', 'ios-device', 'android'].map(platform => [`build:${platform}`, `${forward} build ${platform}`])),
    ios: `${forward} run ios`, android: `${forward} run android`,
    'run:ios': `${forward} run ios`, 'run:android': `${forward} run android`,
  };
  write(join(target, 'package.json'), JSON.stringify({ name: packageName, version: '0.1.0', private: true, type: 'module', engines: { node: '>=24.0.0' }, scripts, ...(!localFramework ? { dependencies: { anseronui: packageSpec ?? json(join(framework, 'package.json')).version } } : {}) }, null, 2) + '\n');
  write(join(target, 'assets/.gitkeep'), '');
  // Gradle resolves these through its root project; paths work outside the framework too.
  write(join(target, 'platforms/android/settings.gradle'), `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }\nrootProject.name = '${displayName}'\ninclude ':app', ':render'\n`);
  const renderer = posix(relative(join(target, 'platforms/android'), resolve(target, config.app.framework, 'packages/render-android')));
  write(join(target, 'platforms/android/render/build.gradle'), `plugins { id 'com.android.library'; id 'org.jetbrains.kotlin.android' }\nandroid {\n namespace 'org.anseronui.render'\n compileSdk 35\n defaultConfig { minSdk 26 }\n compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }\n kotlinOptions { jvmTarget = '17' }\n sourceSets.main {\n  java.srcDirs = [rootProject.file(${JSON.stringify(renderer + '/src/main/java')})]\n  manifest.srcFile rootProject.file(${JSON.stringify(renderer + '/src/main/AndroidManifest.xml')})\n  jniLibs.srcDirs = [rootProject.file('../../.verification/android-jni')]\n }\n}\n`);
  write(join(target, 'README.md'), `# ${displayName}\n\nAnseronUI 跨平台应用，应用标识 \`${identifier}\`。\n\n\`npm install\` → \`npm run setup\` → \`npm run ios\` / \`npm run android\`。\n\nsetup 使用 npm 包内的固定版本编译器源码构建工具链，无需 Git。iOS 需要 macOS、Xcode、模拟器 runtime 和 Python 3。Android 需要 SDK 35、NDK、JDK 17–22 及 arm64-v8a 设备或模拟器。\n\n指定设备：\`npm run ios -- --device <UUID或名称>\`、\`npm run android -- --device <serial>\`，或 \`npm run android -- --avd <AVD名称>\`。\`--no-build\` 复用已有产物，\`--dry-run\` 预览操作。\n\n\`npm run check\` 检查配置；\`npm run typecheck\` 检查 TSX。\`npm run build:ios\` / \`npm run build:android\` 只构建；\`build:ios-device\` 生成未签名真机产物，需自行配置 Xcode 签名。\n\nWeb：\`npm run build:web\`，然后 \`npm run dev:web\`。修改 TSX 后需重新编译 Wasm。\n\n页面位于 \`src/pages\`；页面清单位于 \`anseronui.config.json\`。${localFramework ? '本地源码模式：页面路径相对于框架目录。' : '配置中的页面、源码及 Web 路径相对于本工程，可整体移动工程。npm 依赖固定版本，提交 package-lock.json 以锁定依赖。SDK 与编译器缓存位于 .anseronui/，构建产物位于 .verification/、platforms/android/app/build/ 和 dist/web/。无需框架源码仓库。'}\n\n三端仅显示 TSX 页面，系统栏背景跟随页面根节点 backgroundColor。\n\n原生插件：使用 \`npm install <插件包>\` 安装到生产依赖，\`npm run check\` 查看已发现插件，再重新构建目标平台。构建自动接入包内的原生源码和注册表；生成文件位于 \`.anseronui/plugins/\`，请勿手动修改。插件发布协议见 AnseronUI 框架 README。\n`);
  generateNativePlugins(target, []);
  console.log(`Created independent AnseronUI app: ${target}\nApplication ID: ${identifier}\nNext: cd ${JSON.stringify(target)}${localFramework ? '' : ' && npm install'} && npm run setup && npm run ios\nAndroid: npm run android`);
}

export function setupStandalone(configPath, { prepareCompiler = false } = {}) {
  const ctx = appContext(configPath);
  if (ctx.config.schemaVersion !== 2) {
    if (!existsSync(join(framework, 'node_modules/.bin/tsc'))) throw new Error('Install framework dependencies first: npm ci --ignore-scripts');
    const modules = join(ctx.app, 'node_modules');
    if (!existsSync(modules)) symlinkSync(join(framework, 'node_modules'), modules, 'dir');
    const plugins = discoverNativePlugins(ctx.app);
    generateNativePlugins(ctx.app, plugins);
    const config = pluginBuildConfig(ctx.config, framework, plugins);
    const file = join(ctx.app, '.anseronui/build.config.json');
    write(file, JSON.stringify(config, null, 2) + '\n');
    return { ...ctx, framework, config, file };
  }
  // The package is immutable. Each app owns its SDK, compiler sources and AOT staging.
  if (ctx.config.app.framework !== '.anseronui/sdk') throw new Error('schemaVersion 2 requires app.framework = .anseronui/sdk');
  const sdk = join(ctx.app, '.anseronui/sdk');
  const stamp = join(sdk, '.sdk-fingerprint');
  const fingerprint = sdkFingerprint(framework);
  const require = createRequire(join(ctx.app, 'package.json'));
  let installed;
  try { installed = require.resolve('anseronui/package.json'); }
  catch { throw new Error('Install app dependencies first: npm install'); }
  const sdkRequire = createRequire(installed);
  const scriptcManifest = sdkRequire.resolve('scriptc/package.json');
  const scriptcRequire = createRequire(scriptcManifest);
  const resolvers = [sdkRequire, scriptcRequire];
  for (const name of Object.keys(json(scriptcManifest).optionalDependencies ?? {})) {
    try { resolvers.push(createRequire(scriptcRequire.resolve(`${name}/package.json`))); } catch { /* Other host platforms are absent. */ }
  }
  function dependencyDirectory(name) {
    for (const resolver of resolvers) {
      try { return dirname(resolver.resolve(name === 'pnpm' ? name : `${name}/package.json`)); } catch { /* Try the next npm dependency tree. */ }
    }
    throw new Error(`Missing dependency ${name}; reinstall app dependencies with optional dependencies enabled.`);
  }
  // Resolve actual dependency locations, including nested node_modules trees.
  const dependencyPaths = ['typescript', 'tsx', 'vite', 'scriptc', 'pnpm', '@types/node',
    `@scriptc/llvm-${toolchainHost}`, `@scriptc/runtime-${toolchainHost}`, '@scriptc/runtime-wasm32-wasi']
    .flatMap(name => {
      try { return [[name, dependencyDirectory(name)]]; }
      catch (error) { if (name.startsWith('@scriptc/runtime-') && name !== '@scriptc/runtime-wasm32-wasi') return []; throw error; }
    });
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== fingerprint) {
    // Replace sources on upgrades, including old SDKs that downloaded a Git checkout.
    for (const directory of ['packages', 'scripts', 'internal']) rmSync(join(sdk, directory), { recursive: true, force: true });
    copySDK(framework, sdk);
    write(stamp, fingerprint);
  }
  const modules = join(sdk, 'node_modules');
  mkdirSync(modules, { recursive: true });
  for (const [name, path] of dependencyPaths) {
    const link = join(modules, name);
    if (existsSync(link) && realpathSync(link) === realpathSync(path)) continue;
    rmSync(link, { recursive: true, force: true });
    mkdirSync(dirname(link), { recursive: true }); symlinkSync(path, link, 'dir');
  }
  const plugins = discoverNativePlugins(ctx.app);
  generateNativePlugins(ctx.app, plugins);
  const config = structuredClone(ctx.config);
  const sdkPath = path => posix(relative(sdk, resolve(ctx.app, path)));
  config.sourceDirs = config.sourceDirs.map(sdkPath);
  config.pages.forEach(page => { page.source = sdkPath(page.source); });
  config.web = { ...config.web, viteConfig: sdkPath(config.web.viteConfig), publicDir: sdkPath(config.web.publicDir) };
  const file = join(ctx.app, '.anseronui/build.config.json');
  const buildConfig = pluginBuildConfig(config, sdk, plugins);
  const text = JSON.stringify(buildConfig, null, 2) + '\n';
  if (!existsSync(file) || readFileSync(file, 'utf8') !== text) write(file, text);
  const compilerStamp = join(sdk, '.compiler-fingerprint');
  if (prepareCompiler && (!existsSync(compilerStamp) || readFileSync(compilerStamp, 'utf8') !== fingerprint || !existsSync(join(sdk, 'internal/toolchain/scriptc/packages/compiler/dist/index.js')))) {
    run(process.execPath, ['scripts/prepare-compiler.mjs'], { cwd: sdk, env: { ...process.env, ANSERONUI_SDK_WORKSPACE: '1' } });
    write(compilerStamp, fingerprint);
  }
  return { ...ctx, config: buildConfig, file, framework: sdk };
}
function androidEnvironment() {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk');
  return { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
}
function javaEnvironment(env) {
  function compatible(home) {
    if (!home) return false;
    const result = spawnSync(join(home, 'bin/java'), ['-version'], { encoding: 'utf8' });
    const version = Number(((result.stderr ?? '') + (result.stdout ?? '')).match(/version "(\d+)/)?.[1]);
    return result.status === 0 && version >= 17 && version <= 22;
  }
  const candidates = [env.JAVA_HOME];
  if (process.platform === 'darwin') {
    const java = spawnSync('/usr/libexec/java_home', ['-v', '17'], { encoding: 'utf8' });
    candidates.push(java.stdout?.trim(), '/Applications/Android Studio.app/Contents/jbr/Contents/Home');
  }
  const home = candidates.find(compatible);
  if (!home) throw new Error('Set JAVA_HOME to JDK 17–22 (recommended 17); Android Studio JBR 21 is also supported.');
  return { ...env, JAVA_HOME: home };
}
export function buildStandalone(configPath, target) {
  if (!['web', 'ios', 'ios-device', 'android'].includes(target)) throw new Error('Expected web, ios, ios-device, or android');
  if (target.startsWith('ios') && process.platform !== 'darwin') throw new Error('iOS builds require macOS and Xcode.');
  const ctx = setupStandalone(configPath);
  const { app, config, file, framework } = ctx;
  generateNativePlugins(app, discoverNativePlugins(app), target);
  if (config.schemaVersion === 2 && (!existsSync(join(framework, '.compiler-fingerprint')) || readFileSync(join(framework, '.compiler-fingerprint'), 'utf8') !== readFileSync(join(framework, '.sdk-fingerprint'), 'utf8'))) throw new Error('SDK changed; run npm run setup before building.');
  if (!existsSync(join(framework, 'internal/toolchain/scriptc/packages/compiler/dist/index.js'))) throw new Error('Run npm run setup from the app first.');
  const env = target === 'android' ? javaEnvironment(androidEnvironment()) : process.env;
  mkdirSync(join(framework, '.verification'), { recursive: true });
  const lock = join(framework, '.verification/app-build.lock');
  let fd;
  try { fd = openSync(lock, 'wx'); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`Another app build holds ${lock}. Run builds serially; remove a stale lock only after confirming the owning build has stopped.`);
  }
  writeFileSync(fd, JSON.stringify({ pid: process.pid, config: file }));
  try {
    const coreTarget = { web: 'wasm', ios: 'ios-simulator', 'ios-device': 'ios-device', android: 'android' }[target];
    run(process.execPath, ['scripts/build-core.mjs', coreTarget, file], { env, cwd: framework });
    const core = join(framework, '.verification/core-' + coreTarget);
    const localCore = join(app, '.verification/core-' + coreTarget);
    mkdirSync(localCore, { recursive: true });
    const localArtifact = target === 'web' ? 'entry.wasm' : 'entry.lib.a';
    copyFileSync(join(core, localArtifact), join(localCore, localArtifact));
    const manifest = json(join(core, 'manifest.json'));
    manifest.localArtifactSha256 = createHash('sha256').update(readFileSync(join(localCore, localArtifact))).digest('hex');
    write(join(localCore, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (target === 'web') run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', resolve(framework, config.web.viteConfig)], { cwd: framework });
    else if (target === 'android') {
      const native = join(app, 'platforms/android');
      write(join(native, 'app/src/main/assets/core.manifest.json'), readFileSync(join(core, 'manifest.json')));
      const jni = join(app, '.verification/android-jni/arm64-v8a'); mkdirSync(jni, { recursive: true });
      copyFileSync(join(framework, 'packages/render-android/src/main/jniLibs/arm64-v8a/libanseronui.so'), join(jni, 'libanseronui.so'));
      run(join(native, 'gradlew'), ['-p', native, ':app:assembleDebug', '--console=plain'], { env });
    } else {
      const ios = join(app, 'platforms/ios');
      write(join(ios, 'core.manifest.json'), readFileSync(join(core, 'manifest.json')));
      run('python3', [join(app, 'scripts/generate-ios-project.py')]);
      run('xcodebuild', ['-project', join(ios, 'App.xcodeproj'), '-scheme', 'App', '-configuration', 'Debug', '-sdk', target === 'ios' ? 'iphonesimulator' : 'iphoneos', '-derivedDataPath', join(app, '.verification/' + target), 'CODE_SIGNING_ALLOWED=NO', 'ARCHS=arm64', 'build']);
    }
  } finally { closeSync(fd); rmSync(lock); }
}
export function typecheckStandalone(configPath) {
  const { app, framework } = setupStandalone(configPath);
  run(process.execPath, [join(framework, 'node_modules/typescript/bin/tsc'), '-p', join(app, 'tsconfig.json')]);
}
export function devStandalone(configPath) {
  const { app, config, framework } = setupStandalone(configPath);
  if (!existsSync(resolve(framework, config.web.publicDir, 'core.wasm'))) throw new Error('Run npm run build:web first; TSX changes require an AOT rebuild.');
  run(process.execPath, [join(framework, 'node_modules/vite/bin/vite.js'), '--config', resolve(framework, config.web.viteConfig)], { cwd: app });
}
export function selectIOS(devices, requested) {
  const available = Object.values(devices).flat().filter(device => device.isAvailable);
  if (requested) {
    const matches = available.filter(device => device.udid === requested || device.name === requested);
    if (matches.length !== 1) throw new Error(`iOS device is missing or ambiguous: ${requested}. Use a UUID from xcrun simctl list devices available.`);
    return matches[0];
  }
  const booted = available.filter(device => device.state === 'Booted');
  if (booted.length > 1) throw new Error('Multiple iOS simulators are booted; specify --device <UUID>.');
  if (booted.length === 1) return booted[0];
  const phone = available.find(device => device.name.startsWith('iPhone'));
  if (!phone) throw new Error('No available iPhone simulator. Install an iOS runtime and create a device in Xcode Device Hub.');
  return phone;
}
export function selectAndroid(devices, requested) {
  const rows = devices.split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(parts => parts.length >= 2 && !parts[0].startsWith('List') && !parts[0].startsWith('*'));
  if (requested) {
    const row = rows.find(([serial]) => serial === requested);
    if (!row || row[1] !== 'device') throw new Error(`Android device ${requested} is ${row?.[1] ?? 'not connected'}. Check adb devices and authorize USB debugging.`);
    return requested;
  }
  const ready = rows.filter(([, state]) => state === 'device');
  if (ready.length > 1) throw new Error('Multiple Android devices connected; specify --device <serial>.');
  if (ready.length === 1) return ready[0][0];
  if (rows.length) throw new Error('Android devices are offline or unauthorized. Check adb devices before retrying.');
  return null;
}
async function untilReady(check, description, timeout = 180000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (check()) return; await delay(1000); }
  throw new Error(`Timed out waiting for ${description}.`);
}
export async function runStandalone(configPath, target, options = {}) {
  if (!['ios', 'android'].includes(target)) throw new Error('run supports ios (simulator) or android.');
  if (options.device && options.avd) throw new Error('Choose --device or --avd, not both.');
  if (target === 'ios' && options.avd) throw new Error('--avd is Android-only.');
  const { app, config } = appContext(configPath);
  if (options['dry-run']) {
    console.log(JSON.stringify({ platform: target, build: !options['no-build'], applicationId: config.app.applicationId, device: options.device ?? 'auto', avd: options.avd ?? null, steps: ['select/boot device', ...(!options['no-build'] ? ['build'] : []), 'install', 'launch'] }, null, 2));
    return;
  }
  if (target === 'ios') {
    if (process.platform !== 'darwin') throw new Error('iOS requires macOS and Xcode.');
    const device = selectIOS(JSON.parse(output('xcrun', ['simctl', 'list', 'devices', 'available', '--json'])).devices, options.device);
    console.log(`iOS simulator: ${device.name} (${device.udid})`);
    if (device.state !== 'Booted') run('xcrun', ['simctl', 'boot', device.udid]);
    await untilReady(() => {
      const devices = JSON.parse(output('xcrun', ['simctl', 'list', 'devices', '--json'])).devices;
      return Object.values(devices).flat().some(item => item.udid === device.udid && item.state === 'Booted');
    }, 'iOS simulator boot');
    // Simulator.app was replaced by Device Hub in newer Xcode releases.
    spawnSync('open', ['-a', 'Simulator'], { stdio: 'ignore' }).status === 0 || spawnSync('open', ['-b', 'com.apple.dt.Devices'], { stdio: 'ignore' });
    if (!options['no-build']) buildStandalone(configPath, target);
    const artifact = join(app, '.verification/ios/Build/Products/Debug-iphonesimulator/App.app');
    if (!existsSync(artifact)) throw new Error('iOS app missing. Run npm run build:ios first.');
    run('xcrun', ['simctl', 'install', device.udid, artifact]);
    run('xcrun', ['simctl', 'launch', '--terminate-running-process', device.udid, config.app.applicationId]);
  } else {
    const env = androidEnvironment();
    const adb = join(env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
    const emulator = join(env.ANDROID_HOME, 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator');
    if (!existsSync(adb)) throw new Error(`adb not found at ${adb}. Set ANDROID_HOME to your SDK.`);
    const adbOut = args => output(adb, args, { env });
    let serial = options.avd ? null : selectAndroid(adbOut(['devices']), options.device);
    if (options.avd || !serial) {
      const avds = output(emulator, ['-list-avds'], { env }).split(/\r?\n/).filter(Boolean);
      const name = options.avd ?? (avds.length === 1 ? avds[0] : null);
      if (!name || !avds.includes(name)) throw new Error(`Select an available AVD with --avd <name>: ${avds.join(', ') || '(none; create one in Android Studio)'}`);
      const running = adbOut(['devices']).split(/\r?\n/).filter(line => /^emulator-\d+\s+device/.test(line)).map(line => line.split(/\s+/)[0]);
      serial = running.find(id => adbOut(['-s', id, 'emu', 'avd', 'name']).split(/\r?\n/)[0] === name);
      if (!serial) {
        console.log(`Starting Android AVD: ${name}`);
        const logPath = join(app, '.verification/emulator.log'); mkdirSync(dirname(logPath), { recursive: true });
        const log = openSync(logPath, 'a');
        const child = spawn(emulator, ['-avd', name, '-no-snapshot-save'], { env, detached: true, stdio: ['ignore', log, log] });
        let startError;
        child.on('error', error => { startError = error; });
        child.on('exit', (code, signal) => { startError = new Error(`Emulator exited (${signal ?? code}); see ${logPath}`); });
        child.unref(); closeSync(log);
        await untilReady(() => {
          if (startError) throw startError;
          const devices = adbOut(['devices']).split(/\r?\n/).filter(line => /^emulator-\d+\s+device/.test(line)).map(line => line.split(/\s+/)[0]);
          serial = devices.find(id => adbOut(['-s', id, 'emu', 'avd', 'name']).split(/\r?\n/)[0] === name);
          return !!serial;
        }, `Android AVD ${name}; see ${logPath}`);
      }
    }
    console.log(`Android device: ${serial}`);
    await untilReady(() => adbOut(['-s', serial, 'shell', 'getprop', 'sys.boot_completed']) === '1', 'Android boot');
    const abi = adbOut(['-s', serial, 'shell', 'getprop', 'ro.product.cpu.abilist']);
    if (!abi.split(',').includes('arm64-v8a')) throw new Error(`This framework builds arm64-v8a; device ABIs are ${abi}. Use an ARM64 device/emulator.`);
    if (!options['no-build']) buildStandalone(configPath, target);
    const apk = join(app, 'platforms/android/app/build/outputs/apk/debug/app-debug.apk');
    if (!existsSync(apk)) throw new Error('APK missing. Run npm run build:android first.');
    run(adb, ['-s', serial, 'install', '-r', apk], { env });
    const result = output(adb, ['-s', serial, 'shell', 'am', 'start', '-W', '-S', '-n', `${config.app.applicationId}/.MainActivity`], { env });
    if (/Error:|Status:\s*(?!ok)\w+/i.test(result)) throw new Error(result);
    console.log(result);
  }
  console.log(`Launched ${config.app.name} (${config.app.applicationId}) on ${target}.`);
}
