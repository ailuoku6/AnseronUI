import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('.');
function run(cmd, args, cwd = root, env = process.env) {
  const result = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${cmd} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
test('packed SDK creates a portable app with all native templates and no private workspace imports', () => {
  const directory = mkdtempSync(join(tmpdir(), 'anseronui npm package '));
  try {
    // publish --dry-run passes npm_config_dry_run to lifecycle scripts. This local
    // pack must create a real archive so we can inspect it, even in that context.
    const [pack] = JSON.parse(run('npm', ['pack', '--dry-run=false', '--json', '--cache', join(directory, 'cache'), '--pack-destination', directory], root, { ...process.env, npm_config_dry_run: 'true' }));
    assert.ok(existsSync(join(directory, pack.filename)), 'npm pack must create its archive even under publish --dry-run');
    const paths = pack.files.map(file => file.path);
    assert.ok(paths.includes('LICENSE'));
    assert.ok(paths.includes('THIRD_PARTY_NOTICES.md'));
    assert.ok(!paths.some(path => path.endsWith('/.DS_Store')));
    for (const path of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'scripts/anseronui.mjs', 'scripts/templates/app/gitignore',
      'scripts/native-plugins.mjs',
      'scripts/templates/app/platforms/android/gradle/wrapper/gradle-wrapper.jar',
      'scripts/templates/app/platforms/android/LICENSE-Gradle',
      'packages/flexily/LICENSE', 'packages/core/native/split_bridge.c',
      'packages/render-ios/Sources/AnseronUIRenderIOS/Renderer.swift',
      'packages/render-android/src/main/cpp/transport_jni.c', 'internal/toolchain/async-embedding.patch',
      'internal/toolchain/scriptc.vendor.json', 'internal/toolchain/scriptc/LICENSE',
      'internal/toolchain/scriptc/packages/compiler/src/index.ts',
      'internal/toolchain/scriptc/packages/runtime/src/scr_async.c',
      'internal/toolchain/scriptc/pnpm-lock.yaml']) {
      assert.ok(paths.includes('dist/sdk/' + path), `Missing packed asset: ${path}`);
    }
    assert.ok(!paths.some(path => /(^|\/)(node_modules|\.git|\.verification|AGENTS.md)(\/|$)/.test(path)));
    assert.ok(!paths.some(path => /\.(so|a|wasm)$/.test(path)));
    run('tar', ['-xzf', join(directory, pack.filename), '-C', directory]);
    const manifest = JSON.parse(readFileSync(join(directory, 'package/package.json'), 'utf8'));
    assert.equal(manifest.license, 'MIT');
    const vendorRoot = 'dist/sdk/internal/toolchain/scriptc/';
    const vendor = JSON.parse(readFileSync(join(directory, 'package/dist/sdk/internal/toolchain/scriptc.vendor.json'), 'utf8'));
    for (const path of vendor.sdkFiles.filter(path => /(^|\/)(LICENSE[^/]*|SCRIPTC_LICENSE|THIRD_PARTY_NOTICES[^/]*|NOTICE[^/]*)$/.test(path))) {
      assert.ok(paths.includes(vendorRoot + path), `Missing third-party notice: ${path}`);
    }
    assert.match(readFileSync(join(directory, 'package', vendorRoot, 'packages/compiler/src/index.ts'), 'utf8'), /Modified by AnseronUI contributors/);
    assert.match(readFileSync(join(directory, 'package', vendorRoot, 'LICENSE'), 'utf8'), /Apache License/);
    assert.match(readFileSync(join(directory, 'package/dist/sdk/packages/flexily/LICENSE'), 'utf8'), /Copyright \(c\) 2026 Beorn/);
    const app = join(directory, 'PortableApp');
    run(process.execPath, [join(directory, 'package/dist/sdk/scripts/anseronui.mjs'), 'create', app]);
    const config = JSON.parse(readFileSync(join(app, 'anseronui.config.json'), 'utf8'));
    assert.equal(config.schemaVersion, 2);
    assert.equal(config.pages[0].source, 'src/pages/home.tsx');
    const metadata = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
    assert.equal(metadata.dependencies.anseronui, pack.version);
    assert.equal(metadata.scripts.ios, 'anseronui run ios');
    assert.ok(existsSync(join(app, '.gitignore')));
    assert.match(readFileSync(join(app, 'src/pages/home.tsx'), 'utf8'), /from "anseronui\/ui"/);
    const sdk = join(directory, 'package/dist/sdk');
    assert.doesNotMatch(readFileSync(join(sdk, 'scripts/prepare-compiler.mjs'), 'utf8'), /run\('git'|spawnSync\('git'/);
    assert.doesNotMatch(readFileSync(join(sdk, 'packages/render-web/src/reference-host.ts'), 'utf8'), /["']@anseronui\//);
    // The TSX lowerer must still emit a known alias into the AOT staging tree.
    assert.match(readFileSync(join(sdk, 'packages/ui-compiler/src/index.ts'), 'utf8'), /createStringLiteral\("@anseronui\/ui\/jsx-runtime"\)/);
    run(process.execPath, [join(sdk, 'scripts/anseronui.mjs'), 'check'], app);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
