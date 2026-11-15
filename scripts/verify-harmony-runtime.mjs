// Build and run the bounded native-runtime verification suite on an API 21 emulator.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
if (process.argv.slice(2).some(arg => arg !== '--reuse-build')) throw new Error('Only --reuse-build is accepted');
const reuse = process.argv.includes('--reuse-build');
const out = resolve('.verification/harmony-api21');
const sdk = process.env.HARMONY_NATIVE_SDK ?? '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native';
const hdc = process.env.HARMONY_HDC ?? join(dirname(sdk), 'toolchains/hdc');
const device = process.env.HARMONY_DEVICE ?? '127.0.0.1:5557';
const clang = join(sdk, 'llvm/bin/clang');
const flags = ['--target=aarch64-linux-ohos', `--sysroot=${join(sdk, 'sysroot')}`, '-O2', '-fPIE'];
const src = 'internal/experiments/harmony-runtime';
const cases = ['counter', 'async-form', 'components', 'extensions', 'timers'];
const commands = [];
mkdirSync(join(out, 'replay'), { recursive: true });
function run(label, command, args, extraEnv = {}) {
  commands.push({ label, command, args, extraEnv });
  writeFileSync(join(out, 'commands.json'), JSON.stringify(commands, null, 2) + '\n');
  console.log(label);
  const result = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, ...extraEnv }, maxBuffer: 64 * 1024 * 1024, timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] });
  writeFileSync(join(out, label + '.log'), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed (status ${result.status}, signal ${result.signal}); see ${out}/${label}.log`);
  return result.stdout;
}
function deviceRun(label, args) { return run(label, hdc, ['-t', device, ...args]); }
const environment = deviceRun('device-environment', ['shell', 'uname -m; param get const.ohos.apiversion; param get const.ohos.fullname; param get const.product.software.version']);
assert.match(environment, /aarch64/);
assert.equal(environment.split('\n')[1]?.trim(), '21');
assert.equal(Number(JSON.parse(readFileSync(join(sdk, 'oh-uni-package.json'))).apiVersion), 21);
const node = (label, args, env) => run(label, process.execPath, args, env);
if (!reuse) {
  node('native-oracle-build', ['scripts/build-core.mjs', 'native']);
  node('runtime-build', ['scripts/verify-harmony-build.mjs', `${src}/profile.json`, join(out, 'runtime')]);
  for (const kind of ['framework', 'business']) node(`${kind}-build`, ['scripts/verify-harmony-build.mjs', `.verification/source-native/${kind}/profile.json`, join(out, kind)]);
}
const libraries = [join(out, 'framework/entry.lib.a'), join(out, 'business/entry.lib.a')];
run('link-sdk-smoke', clang, [...flags, '-pie', `${src}/sdk-smoke.c`, '-o', join(out, 'sdk-smoke')]);
run('link-runtime', clang, [...flags, '-pie', `${src}/host.c`, join(out, 'runtime/entry.lib.a'), '-lm', '-o', join(out, 'runtime-probe')]);
run('link-fiber', clang, [...flags, '-pie', '-DSCR_LIB', '-DSCR_ASYNC_EMBEDDING', '-DSCR_THREAD_INSTANCES', '-I', join(out, 'runtime/runtime-src'), `${src}/fiber-host.c`, join(out, 'runtime/program.o'), join(out, 'runtime/runtime.a'), '-lm', '-o', join(out, 'fiber-probe')]);
for (const [name, sources] of [
  ['core-stdio', ['packages/core/native/test/stdio.c']],
  ['core-transport', [`${src}/transport.c`, 'packages/core/native/transport.c']],
  ['core-poison', [`${src}/poison.c`, 'packages/core/native/transport.c']],
]) run('link-' + name, clang, [...flags, '-pie', '-I', 'packages/core/native/include', ...sources, 'packages/core/native/split_bridge.c', ...libraries, '-lm', '-o', join(out, name)]);
const remote = '/data/local/tmp/anseronui-api21';
deviceRun('device-directory', ['shell', `mkdir -p ${remote}; rm -rf ${remote}/replay`]);
const results = {};
for (const [name, marker] of [['sdk-smoke', 'SDK_SMOKE PASS'], ['runtime-probe', 'RUNTIME_PROBE PASS'], ['fiber-probe', 'FIBER_PROBE PASS'], ['core-transport', 'CORE_TRANSPORT PASS'], ['core-poison', 'KNOWN_LIMITATION_CONFIRMED'], ['core-stdio', null]]) {
  deviceRun('send-' + name, ['file', 'send', join(out, name), `${remote}/${name}`]);
  const result = deviceRun('run-' + name, ['shell', `chmod 755 ${remote}/${name}${marker ? ` && ${remote}/${name}; echo ANSERONUI_EXIT:$?` : ''}`]);
  if (marker) { assert(result.includes(marker)); assert.match(result, /ANSERONUI_EXIT:0\s*$/); results[name] = result.trim(); }
}
for (const name of cases) node(`${name}-oracle`, ['scripts/test-native-core.mjs', `${src}/record-stdio.mjs`, name], { HARMONY_CASE: name });
deviceRun('send-replay', ['file', 'send', join(out, 'replay'), `${remote}/replay`]);
const replayExit = deviceRun('run-replay', ['shell', `cd ${remote}/replay && for name in ${cases.join(' ')}; do ${remote}/core-stdio < $name.input > $name.actual; echo $name:$?; done`]);
for (const name of cases) assert(replayExit.includes(`${name}:0`), name);
rmSync(join(out, 'device-replay'), { recursive: true, force: true });
deviceRun('receive-replay', ['file', 'recv', `${remote}/replay`, join(out, 'device-replay')]);
results.replay = cases.map(name => {
  const expected = readFileSync(join(out, `replay/${name}.expected`));
  const actual = readFileSync(join(out, `device-replay/${name}.actual`));
  assert(actual.equals(expected), `${name} output differs from the asserted native oracle`);
  const steps = actual.toString().trim().split('\n').map(JSON.parse);
  return { name, steps: steps.length, envelopes: steps.reduce((n, step) => n + step.length, 0), sha256: createHash('sha256').update(actual).digest('hex'), result: 'PASS' };
});
const artifactFiles = ['sdk-smoke', 'runtime-probe', 'fiber-probe', 'core-transport', 'core-poison', 'core-stdio', 'runtime/entry.lib.a', 'framework/entry.lib.a', 'business/entry.lib.a'];
const sha256 = Object.fromEntries(artifactFiles.map(name => [name, createHash('sha256').update(readFileSync(join(out, name))).digest('hex')]));
const fingerprint = await import('./core-inputs.mjs');
const report = { date: new Date().toISOString(), minimumApi: 21, reuseBuild: reuse, environment, sdk: JSON.parse(readFileSync(join(sdk, 'oh-uni-package.json'))),
  llvm: run('llvm-version', process.env.HARMONY_LLVM_CLANG ?? '/opt/homebrew/opt/llvm/bin/clang', ['--version']),
  clang: run('sdk-clang-version', clang, ['--version']), sourceFingerprint: fingerprint.coreFingerprint(process.cwd()),
  patchSha256: createHash('sha256').update(readFileSync('internal/toolchain/harmony-api21.patch')).digest('hex'), results, sha256, commands };
writeFileSync(join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
console.log('PASS HarmonyOS API 21 runtime, stackful fibers, Core transport and five protocol replays');
