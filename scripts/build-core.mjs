import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { coreFingerprint, frameworkFingerprint, businessFingerprint } from './core-inputs.mjs';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const rawArgs = process.argv.slice(2);
const frameworkOnly = rawArgs.includes('--framework-only');
const businessOnly = rawArgs.includes('--business-only');
if (frameworkOnly && businessOnly) throw new Error('Choose one build mode');
const args = rawArgs.filter(arg => !['--framework-only','--business-only'].includes(arg));
if (args.length > 2 || args.some(arg => arg.startsWith('--'))) throw new Error('Expected target [config] [--framework-only|--business-only]');
const target = args[0] ?? 'native';
const configPath = args[1] ?? process.env.ANSERONUI_CONFIG;
const targets = { native:'', 'ios-simulator':'aarch64-apple-ios-simulator', 'ios-device':'aarch64-apple-ios', android:'aarch64-linux-android', wasm:'wasm32-wasi' };
if (!(target in targets)) throw new Error(`Unknown target ${target}: ${Object.keys(targets).join(', ')}`);
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {stdio:'inherit', env});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function output(command, args) {
  const result = spawnSync(command, args, {encoding:'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || `Missing ${command}`);
  return result.stdout.trim();
}
if (!existsSync('internal/toolchain/scriptc/packages/compiler/dist/index.js')) throw new Error('Run npm run prepare:compiler first');

const env = {...process.env, SCRIPTC_TARGET:targets[target], SCRIPTC_CC:target === 'native' ? 'clang' : 'zigcc', ZIG_GLOBAL_CACHE_DIR:resolve('.verification/zig-cache')};
// Use the selected Xcode SDK rather than inheriting a Homebrew clang config with a stale sysroot.
if (target === 'native' && process.platform === 'darwin') {
  const compiler = output('xcrun',['--find','clang']);
  const sdk = output('xcrun',['--sdk','macosx','--show-sdk-path']);
  const bin = resolve('.verification/host-tools'); mkdirSync(bin,{recursive:true});
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  writeFileSync(join(bin,'clang'), `#!/bin/sh\nexec ${quote(compiler)} -isysroot ${quote(sdk)} "$@"\n`); chmodSync(join(bin,'clang'),0o755);
  env.PATH = `${bin}:${env.PATH}`;
}
if (target === 'android') {
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT ?? join(homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk');
  const ndks = join(sdk,'ndk');
  env.ANDROID_NDK_ROOT ??= join(ndks, readdirSync(ndks).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))[0]);
}
const configuration = configPath ?? 'anseronui.config.json';
const destination = resolve('.verification/core-' + target);
mkdirSync(destination, {recursive:true});
if (!frameworkOnly) rmSync(join(destination, 'manifest.json'), { force: true });
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const artifactName = target === 'wasm' ? 'entry.wasm' : 'entry.lib.a';
const artifacts = {};
const fingerprints = { framework: frameworkFingerprint(root), business: businessFingerprint(root, configuration) };
const sourceFingerprint = coreFingerprint(root, configuration);
for (const kind of (frameworkOnly ? ['framework'] : ['framework', 'business'])) {
  const directory = resolve('.verification/' + kind + '-' + target);
  const artifact = join(directory, artifactName);
  const stamp = join(directory, 'manifest.json');
  let cached = false;
  try {
    const manifest = JSON.parse(readFileSync(stamp, 'utf8'));
    cached = manifest.kind === kind && manifest.target === target && manifest.abiVersion === 1 &&
      manifest.sourceFingerprint === fingerprints[kind] && manifest.artifactSha256 === digest(artifact);
  } catch {}
  if (cached) console.log(`Reusing ${kind}: ${artifact}`);
  else {
    if (businessOnly && kind === 'framework') throw new Error('Framework Core missing or stale; run build:framework for this target first');
    mkdirSync(directory, { recursive:true });
    rmSync(stamp, {force:true});
    console.log(`Compiling ${kind}: ${target}`);
    run(process.execPath, ['--import','tsx','scripts/stage-core.mjs', configuration, kind, target]);
    run(process.execPath, ['internal/toolchain/build-library.mjs', `.verification/source-${target}/${kind}/profile${target==='wasm'?'-wasm':''}.json`, directory], env);
    const after = kind === 'framework' ? frameworkFingerprint(root) : businessFingerprint(root, configuration);
    if (after !== fingerprints[kind]) throw new Error(`${kind} sources changed during compilation`);
    writeFileSync(stamp, JSON.stringify({kind,target,abiVersion:1,sourceFingerprint:after,artifactSha256:digest(artifact)},null,2)+'\n');
  }
  artifacts[kind] = artifact;
}
if (frameworkOnly) { console.log(`Framework Core ready: ${artifacts.framework}`); process.exit(0); }
if (target === 'wasm') {
  copyFileSync(artifacts.business, join(destination,'entry.wasm'));
  copyFileSync(artifacts.framework, join(destination,'framework.wasm'));
} else {
  const object = join(destination, 'split_bridge.o');
  let compiler = 'clang', compileFlags = [];
  let archiver = 'ar';
  if (target.startsWith('ios-')) {
    const sdkName = target === 'ios-device' ? 'iphoneos' : 'iphonesimulator';
    compiler = output('xcrun', ['--sdk',sdkName,'--find','clang']);
    compileFlags = ['-isysroot',output('xcrun',['--sdk',sdkName,'--show-sdk-path']),'-target',target === 'ios-device' ? 'arm64-apple-ios15.0' : 'arm64-apple-ios15.0-simulator'];
  } else if (target === 'android') {
    const prebuilt = join(env.ANDROID_NDK_ROOT,'toolchains/llvm/prebuilt');
    const host = readdirSync(prebuilt).find(name=>name.startsWith(process.platform==='darwin'?'darwin':'linux'));
    if (!host) throw new Error('No NDK toolchain for this host');
    compiler = join(prebuilt,host,'bin/aarch64-linux-android26-clang');
    archiver = join(prebuilt,host,'bin/llvm-ar');
  }
  run(compiler, [...compileFlags,'-fPIC','-I','packages/core/native/include','-c','packages/core/native/split_bridge.c','-o',object],env);
  const combined = join(destination,'entry.lib.a');
  rmSync(combined,{force:true});
  if (process.platform === 'darwin' && target !== 'android') {
    run('xcrun',['libtool','-static','-o',combined,object,artifacts.framework,artifacts.business],env);
  } else {
    // MRI adds archive members rather than embedding nested archive files.
    const script = `CREATE ${combined}\nADDMOD ${object}\nADDLIB ${artifacts.framework}\nADDLIB ${artifacts.business}\nSAVE\nEND\n`;
    const result = spawnSync(archiver,['-M'],{input:script,encoding:'utf8',env});
    if(result.status !== 0) throw new Error(result.stderr || 'Archive merge failed');
  }
}
if (sourceFingerprint !== coreFingerprint(root, configuration)) throw new Error('Sources changed during build; rebuild');
const config = JSON.parse(readFileSync(configuration,'utf8'));
const manifest = {buildId:config.buildId,protocolMajor:1,runtimeEpoch:1,abiVersion:1,format:'split-v1',
  pages:config.pages.map(page=>({...page,name:page.name??page.source.split('/').slice(-2,-1)[0]})),
  configPath:configuration,sourceFingerprint,frameworkFingerprint:fingerprints.framework,businessFingerprint:fingerprints.business,
  frameworkSha256:digest(artifacts.framework),businessSha256:digest(artifacts.business)};

if (target === 'wasm') {
  const config = JSON.parse(readFileSync(resolve(configPath ?? 'anseronui.config.json'), 'utf8'));
  const publicDir = config.web?.publicDir ? resolve(config.web.publicDir) : resolve('examples/native/web/public');
  mkdirSync(publicDir,{recursive:true});
  if (!config.web?.publicDir) {
    mkdirSync(join(publicDir,'assets'),{recursive:true});
    for (const name of readdirSync('examples/components/assets')) copyFileSync(join('examples/components/assets', name), join(publicDir,'assets', name));
  }
  copyFileSync(join(destination,'entry.wasm'),join(publicDir,'core.wasm'));
  copyFileSync(join(destination,'framework.wasm'),join(publicDir,'framework.wasm'));
  writeFileSync(join(publicDir,'core.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}
if (target === 'android') {
  const prebuilt = join(env.ANDROID_NDK_ROOT,'toolchains/llvm/prebuilt');
  const host = readdirSync(prebuilt).find(name=>name.startsWith(process.platform==='darwin'?'darwin':'linux'));
  if (!host) throw new Error('No NDK toolchain for this host');
  const clang = join(prebuilt,host,'bin/aarch64-linux-android26-clang');
  const library = 'packages/render-android/src/main/jniLibs/arm64-v8a/libanseronui.so';
  mkdirSync(resolve(library,'..'),{recursive:true});
  run(clang,['-shared','-fPIC','-I','packages/core/native/include','packages/core/native/transport.c','packages/render-android/src/main/cpp/transport_jni.c',join(destination,'entry.lib.a'),'-lm','-o',library],env);
  mkdirSync('examples/native/android/app/src/main/assets',{recursive:true});
  writeFileSync('examples/native/android/app/src/main/assets/core.manifest.json',JSON.stringify(manifest,null,2)+'\n');
}
if (target === 'ios-simulator' || target === 'ios-device') { mkdirSync('examples/native/ios', {recursive:true}); writeFileSync('examples/native/ios/core.manifest.json',JSON.stringify(manifest,null,2)+'\n'); }
if (target === 'native') run('clang',['-I','packages/core/native/include','packages/core/native/test/stdio.c',join(destination,'entry.lib.a'),'-o',join(destination,'probe')],env);
writeFileSync(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Built ${target}: ${destination}`);
