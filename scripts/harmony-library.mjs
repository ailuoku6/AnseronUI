// HarmonyOS AOT backend. POSIX frontend semantics, explicit OHOS object/link target.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibraryProfile, emitLlvmModule, compilerReleaseVersion } from '../internal/toolchain/scriptc/packages/compiler/dist/index.js';
import { prepareLibrary, libraryLocalizeSymbols } from '../internal/toolchain/scriptc/packages/compiler/dist/library/prepare.js';
import { runFrontend } from '../internal/toolchain/scriptc/packages/compiler/dist/frontend/pipeline.js';
import { loadProgram } from '../internal/toolchain/scriptc/packages/compiler/dist/frontend/program-node.js';
import { LIB_RUNTIME_SOURCES, runtimeSrcDir } from '../internal/toolchain/scriptc/packages/compiler/dist/backend/native/runtime-inputs.js';
import { moduleRuntimeFeatures } from '../internal/toolchain/scriptc/packages/compiler/dist/ir/runtime-features.js';
import { localizeElfObject } from '../internal/toolchain/scriptc/packages/compiler/dist/backend/object-localize.js';

export function compileHarmonyLibrary(profileArg, outArg) {
const sdk = process.env.HARMONY_NATIVE_SDK ?? '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native';
const metadata = JSON.parse(readFileSync(join(sdk, 'oh-uni-package.json'), 'utf8'));
if (Number(metadata.apiVersion) !== 21) throw new Error('HarmonyOS builds require the API 21 SDK to enforce the 6.0.1 compatibility floor');
const clang = join(sdk, 'llvm/bin/clang');
const ar = join(sdk, 'llvm/bin/llvm-ar');
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
function run(bin, args) { execFileSync(bin, args, { stdio: 'inherit' }); }
const loaded = loadLibraryProfile(resolve(profileArg));
if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
const profile = loaded.profile;
const prepared = prepareLibrary(profile, resolve(profileArg), compilerReleaseVersion(), 'linux',
  (entry, npmStatic, externalTypes, libraryNpmStatic, options) =>
    runFrontend(entry, loadProgram, npmStatic, externalTypes, libraryNpmStatic, options));
if (!prepared.ok) throw new Error(JSON.stringify(prepared.diagnostics));
const f = moduleRuntimeFeatures(prepared.mod);
const runtime = join(out, 'runtime-src');
rmSync(runtime, { recursive: true, force: true });
cpSync(runtimeSrcDir(), runtime, { recursive: true });
cpSync(join(runtimeSrcDir(), '../vendor'), join(out, 'vendor'), { recursive: true });
run('patch', ['--batch', '-p1', '-d', runtime, '-i', fileURLToPath(new URL('../internal/toolchain/harmony-api21.patch', import.meta.url))]);
const ll = emitLlvmModule(prepared.mod, { targetTriple: 'aarch64-linux-ohos', pointerBits: 64, objectAudit: false, inlineRc: 'release' });
writeFileSync(join(out, 'entry.ll'), ll);
const flags = ['--target=aarch64-linux-ohos', `--sysroot=${join(sdk, 'sysroot')}`, '-O2', '-fPIC', '-ffunction-sections', '-fdata-sections', '-fno-strict-aliasing', '-fno-math-errno', '-Wno-deprecated-declarations', '-D_GNU_SOURCE', '-DSCR_LIB',
  ...(profile.asyncEmbedding ? ['-DSCR_ASYNC_EMBEDDING'] : []),
  ...(profile.instancePerThread ? ['-DSCR_THREAD_INSTANCES'] : []), '-I', runtime];
const sources = [...LIB_RUNTIME_SOURCES,
  ...(profile.asyncEmbedding ? ['scr_async.c', 'scr_async_dyn.c'] : []),
  ...(f.declAdopt ? ['scr_decl_adopt.c'] : []),
  ...(f.regex ? ['scr_regex.c', 'scr_glob.c', 'scr_path_win32_relative.c'] : []),
  ...(f.inspect ? ['scr_inspect.c', 'scr_console_native.c'] : []),
  ...(f.assert || f.symbol || f.regex ? ['scr_assert.c'] : []),
  ...(f.symbol ? ['scr_symbol.c'] : []),
  ...(f.emitter ? ['scr_events_emitter.c', 'scr_dyn_handle.c'] : []),
  ...(f.dynInvoke ? ['scr_dyn_invoke.c'] : []),
  ...(f.dynInvoke && f.dynBuffer ? ['scr_bytes_dyn.c'] : []),
  ...(f.dynTier ? ['scr_js_value.c', 'scr_js_object.c'] : []),
  ...(f.mutableBuffers ? ['scr_js_buffers.c'] : []),
  ...(f.copying ? ['scr_copying.c'] : [])];
if (f.zlib || f.x509 || f.legacyTextDecoder) throw new Error('This HarmonyOS backend does not yet support zlib, x509 or legacyTextDecoder; use host services');
flags.push('-I', join(out, 'vendor/quickjs-ng'));
if (f.bigintBytes || f.mutableBuffers) flags.push('-DSCR_JS_OBJECT_MODEL');
const program = join(out, 'program.o');
// SDK Clang 15 cannot parse memory(...) IR attributes, and the packaged
// scriptc helper explicitly rejects OHOS. Use a separately installed LLVM.
const llvmClang = process.env.HARMONY_LLVM_CLANG ?? '/opt/homebrew/opt/llvm/bin/clang';
run(llvmClang, ['--no-default-config', '--target=aarch64-unknown-linux-ohos', `--sysroot=${join(sdk, 'sysroot')}`, '-c', '-O2', '-fPIC', join(out, 'entry.ll'), '-o', program]);
const objects = sources.map(source => {
  const object = join(out, source.replace(/\.c$/, '.o'));
  run(clang, [...flags, '-std=c11', '-c', join(runtime, source), '-o', object]);
  return object;
});
if (f.regex) {
  for (const source of ['libregexp.c', 'libunicode.c']) {
    const object = join(out, source.replace(/\.c$/, '.o'));
    run(clang, [...flags, '-std=c11', '-c', join(out, 'vendor/quickjs-ng', source), '-o', object]);
    objects.push(object);
  }
}
const support = join(out, 'runtime.a');
// Fresh deterministic archive: never append stale members.
rmSync(support, { force: true });
run(ar, ['rcsD', support, ...objects]);
const combined = join(out, 'entry.o');
run(clang, ['--target=aarch64-linux-ohos', `--sysroot=${join(sdk, 'sysroot')}`, '-nostdlib', '-no-pie', '-Wl,-r', program, support, '-o', combined]);
const keep = libraryLocalizeSymbols(profile);
if (keep) writeFileSync(combined, localizeElfObject(readFileSync(combined), new Set(keep)));
rmSync(join(out, 'entry.lib.a'), { force: true });
run(ar, ['rcsD', join(out, 'entry.lib.a'), combined]);
writeFileSync(join(out, 'build.json'), JSON.stringify({ sdk: metadata, target: 'aarch64-linux-ohos', minimumApi: 21, profile: resolve(profileArg), sources, features: f }, null, 2) + '\n');
console.log(`Built OHOS API 21 archive: ${out}/entry.lib.a`);

}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [profile, out] = process.argv.slice(2);
  if (!profile || !out) throw new Error('Usage: node scripts/harmony-library.mjs PROFILE OUT');
  compileHarmonyLibrary(profile, out);
}
