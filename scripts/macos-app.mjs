import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, cpSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { coreFingerprint } from './core-inputs.mjs';
import { generateAppIcons } from './app-icons.mjs';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  return result.stdout?.trim();
}
export function requireMacOS() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('macOS apps currently require an Apple Silicon Mac with Xcode (macOS 15+ build host).');
}
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Build a standard AppKit bundle with Apple's compiler; no project-generation dependency. */
export function buildMacOS({ framework, app, config, core, standalone = false }) {
  requireMacOS();
  const destination = join(app, '.verification/macos');
  const bundle = join(destination, 'App.app');
  // Never leave a previous successful application runnable after a failed build.
  rmSync(bundle, { recursive: true, force: true });
  const resources = join(bundle, 'Contents/Resources');
  const executable = join(bundle, 'Contents/MacOS/App');
  mkdirSync(resources, { recursive: true }); mkdirSync(join(bundle, 'Contents/MacOS'), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(core, 'manifest.json'), 'utf8'));
  if (manifest.target !== 'macos-arm64' || manifest.targetIdentity?.arch !== 'arm64') throw new Error('Core is not a macOS arm64 build.');
  const swift = join(framework, 'packages/render-macos/Sources/AnseronUIRenderMacOS');
  const native = join(framework, 'packages/core/native');
  const cache = join(destination, 'module-cache'); mkdirSync(cache, { recursive: true });
  const object = join(destination, 'transport.o');
  const sdk = run('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  run('xcrun', ['clang', '-arch','arm64','-mmacosx-version-min=14.0','-isysroot',sdk,'-I',join(native,'include'),'-c',join(native,'transport.c'),'-o',object]);
  const pluginDirectory = join(app, '.anseronui/plugins');
  const plugins = standalone ? JSON.parse(readFileSync(join(pluginDirectory,'macos.json'),'utf8')) : { sources: [], frameworks: [], infoPlist: {} };
  const sources = readdirSync(swift).filter(name => name.endsWith('.swift')).sort().map(name => join(swift,name));
  const entry = join(app, standalone ? 'platforms/macos/App.swift' : 'examples/native/macos/App.swift');
  if (!existsSync(entry)) throw new Error(`macOS host missing: ${entry}. Copy platforms/macos from a newly created app before building an older app.`);
  const hostSources = readdirSync(dirname(entry)).filter(name => name.endsWith('.swift')).sort().map(name => join(dirname(entry),name));
  const registry = standalone ? [join(pluginDirectory,'GeneratedMacOSPlugins.swift')] : [];
  const frameworks = [...new Set(['AppKit','AVFoundation','AVKit','QuartzCore',...plugins.frameworks])];
  try {
    const icon = generateAppIcons(app, config, 'macos');
    run('xcrun', ['swiftc','-swift-version','5','-target','arm64-apple-macosx14.0','-sdk',sdk,'-module-cache-path',cache,
      '-I',join(framework,'packages/render-macos/Sources/AnseronUICoreC'),'-parse-as-library',...sources,...plugins.sources,...registry,...hostSources,
      object,join(core,'entry.lib.a'),...frameworks.flatMap(name => ['-framework',name]),'-o',executable]);
    const info = {
      CFBundleIdentifier: config.app?.applicationId ?? 'org.anseronui.demo.macos',
      CFBundleName: config.app?.name ?? 'AnseronUI', CFBundleDisplayName: config.app?.name ?? 'AnseronUI',
      CFBundleExecutable:'App', CFBundlePackageType:'APPL', CFBundleVersion:'1', CFBundleShortVersionString:'0.1.0',
      LSMinimumSystemVersion:'14.0', NSHighResolutionCapable:true, NSPrincipalClass:'NSApplication', NSBluetoothAlwaysUsageDescription: "连接蓝牙设备并读取设备数据",
      ...(!standalone ? { NSLocationWhenInUseUsageDescription: "演示读取当前位置", NSLocationUsageDescription: "演示读取当前位置", NSCameraUsageDescription: "演示申请相机权限", NSMicrophoneUsageDescription: "演示申请麦克风权限", NSPhotoLibraryUsageDescription: "演示申请照片权限" } : {}),
      ...plugins.infoPlist,
      ...(icon.enabled ? { CFBundleIconFile: 'AppIcon.icns' } : {}),
    };
    const plist = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n' + Object.entries(info).map(([key,value]) => `<key>${xml(key)}</key>${typeof value === 'boolean' ? `<${value ? 'true' : 'false'}/>` : `<string>${xml(value)}</string>`}`).join('\n') + '\n</dict></plist>\n';
    writeFileSync(join(bundle,'Contents/Info.plist'),plist);
    if (icon.enabled) copyFileSync(icon.path, join(resources, 'AppIcon.icns'));
    copyFileSync(join(core,'manifest.json'),join(resources,'core.manifest.json'));
    const assets = join(app,standalone ? 'assets' : 'examples/components/assets');
    if (existsSync(assets)) cpSync(assets,join(resources,'assets'),{recursive:true});
    run('codesign',['--force','--sign','-',bundle]);
    run('xcrun',['--sdk','macosx','swiftc','-print-target-info'],{stdio:'ignore'});
    const build = { buildId:config.buildId, platform:'macos', arch:'arm64', sourceFingerprint:manifest.sourceFingerprint,
      executableSha256:digest(executable), coreSha256:digest(join(core,'entry.lib.a')), framework, configPath:manifest.configPath,
      inputs:[...sources,...plugins.sources,...registry,...hostSources,...icon.inputs,...(icon.enabled ? [join(resources,'AppIcon.icns')] : []),join(native,'transport.c'),join(native,'include/anseronui_transport.h'),join(framework,'scripts/macos-app.mjs'),join(framework,'scripts/app-icons.mjs')].map(path => ({path,sha256:digest(path)})) };
    writeFileSync(join(destination,'build.json'),JSON.stringify(build,null,2)+'\n');
    console.log(`Built macOS application: ${bundle}`);
    return bundle;
  } catch (error) { rmSync(bundle,{recursive:true,force:true}); throw error; }
}

export function validateMacOSBuild(app, buildId) {
  const directory = join(app,'.verification/macos');
  const bundle = join(directory,'App.app');
  const executable = join(bundle,'Contents/MacOS/App');
  if (!existsSync(executable) || !existsSync(join(directory,'build.json'))) throw new Error('macOS app missing. Run npm run build:macos first.');
  const stamp = JSON.parse(readFileSync(join(directory,'build.json'),'utf8'));
  if (stamp.buildId !== buildId || stamp.platform !== 'macos' || stamp.arch !== 'arm64' || stamp.executableSha256 !== digest(executable)) throw new Error('macOS app identity/hash mismatch; rebuild the application.');
  const manifest = JSON.parse(readFileSync(join(bundle,'Contents/Resources/core.manifest.json'),'utf8'));
  if (manifest.sourceFingerprint !== stamp.sourceFingerprint || manifest.buildId !== buildId || manifest.target !== 'macos-arm64') throw new Error('macOS Core manifest mismatch; rebuild the application.');
  for (const input of stamp.inputs ?? []) if (!existsSync(input.path) || digest(input.path) !== input.sha256) throw new Error('macOS host or plugin sources changed; rebuild the application.');
  if (!stamp.framework || coreFingerprint(stamp.framework,stamp.configPath) !== stamp.sourceFingerprint) throw new Error('macOS Core sources/config changed; rebuild the application.');
  return resolve(bundle);
}
