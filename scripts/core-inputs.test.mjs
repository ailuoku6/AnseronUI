import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { coreFingerprint, coreSourceDirs, frameworkFingerprint, businessFingerprint } from './core-inputs.mjs';

test('Core stamp detects protocol, page, compiler and config changes without depending on mtimes', () => {
  const root = mkdtempSync(join(tmpdir(), 'anseronui-core-inputs-'));
  const write = (path, contents) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  };
  try {
    const config = { sourceDirs: ['examples/page'], pages: [{ source: 'examples/page/page.tsx' }] };
    write('anseronui.config.json', JSON.stringify(config));
    for (const path of ['scripts/stage-core.mjs', 'scripts/core-inputs.mjs', 'scripts/build-core.mjs',
      'internal/toolchain/build-library.mjs', 'internal/toolchain/async-embedding.patch', 'packages/core/native/profile.json',
      'packages/core/native/framework.profile.json', 'packages/core/native/business.profile.json', 'scripts/prepare-compiler.mjs',
      'packages/core/native/split_bridge.c', 'scripts/lower-timers.mjs', 'packages/core/src/kernel.ts',
      'packages/core/src/business-runtime.ts', 'packages/core/src/contracts.ts']) write(path, 'original');
    for (const dir of [...coreSourceDirs(config), 'packages/ui-compiler/src']) write(`${dir}/index.ts`, 'original');
    for (const name of ['core-inputs.mjs', 'check-ios-core.mjs']) write('scripts/' + name, readFileSync(new URL(name, import.meta.url)));
    const original = coreFingerprint(root);
    const framework = frameworkFingerprint(root), business = businessFingerprint(root);
    write('examples/page/index.ts', 'business change');
    assert.equal(frameworkFingerprint(root), framework, 'Page changes must reuse Framework Core');
    assert.notEqual(businessFingerprint(root), business, 'Page changes must rebuild business');
    write('examples/page/index.ts', 'original');
    write('packages/core/src/kernel.ts', 'kernel change');
    assert.notEqual(frameworkFingerprint(root), framework, 'Kernel changes invalidate Framework Core');
    assert.equal(businessFingerprint(root), business, 'Kernel-only changes do not recompile business SDK');
    write('packages/core/src/kernel.ts', 'original');
    write('.verification/core-ios-simulator/manifest.json', JSON.stringify({ sourceFingerprint: original, configPath: 'anseronui.config.json' }));
    write('.verification/core-ios-simulator/entry.lib.a', 'fixture archive');
    const check = () => spawnSync(process.execPath, [join(root, 'scripts/check-ios-core.mjs')], { encoding: 'utf8' });
    assert.equal(check().status, 0, 'Matching Core must be accepted');
    utimesSync(join(root, 'packages/protocol/src/index.ts'), new Date(0), new Date(0));
    assert.equal(coreFingerprint(root), original, 'Touching a file must not require rebuilding');
    for (const path of ['packages/protocol/src/index.ts', 'examples/page/index.ts', 'packages/ui-compiler/src/index.ts', 'internal/toolchain/async-embedding.patch']) {
      write(path, 'changed');
      assert.notEqual(coreFingerprint(root), original, path);
      const stale = check();
      assert.equal(stale.status, 1, 'Stale Core must stop the Xcode build');
      assert.match(stale.stderr, /npm run build:ios/);
      write(path, 'original');
      assert.equal(coreFingerprint(root), original);
    }
    write('examples/page/new.tsx', 'new component');
    assert.notEqual(coreFingerprint(root), original, 'New source files invalidate Core');
    rmSync(join(root, 'examples/page/new.tsx'));
    write('anseronui.config.json', JSON.stringify({ ...config, buildId: 'changed' }));
    assert.notEqual(coreFingerprint(root), original, 'Config changes invalidate Core');
    write('anseronui.config.json', JSON.stringify(config));
    rmSync(join(root, 'packages/protocol/src/index.ts'));
    assert.notEqual(coreFingerprint(root), original, 'Deleted sources invalidate Core');
    write('packages/protocol/src/index.ts', 'original');
    rmSync(join(root, '.verification/core-ios-simulator/entry.lib.a'));
    assert.equal(check().status, 1, 'A manifest without a library must be rejected');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
