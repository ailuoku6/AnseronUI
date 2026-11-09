import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../internal/toolchain/scriptc/', import.meta.url));
const vendor = JSON.parse(readFileSync(new URL('../internal/toolchain/scriptc.vendor.json', import.meta.url), 'utf8'));
const files = new Set(vendor.sdkFiles);
const posix = path => path.split(sep).join('/');

test('compiler SDK explicitly includes Node types', () => {
  const config = JSON.parse(readFileSync(join(root, 'packages/compiler/tsconfig.json'), 'utf8'));
  assert.deepEqual(config.compilerOptions.types, ['node']);
});

test('compiler SDK includes existing relative import targets', () => {
  const missing = [];
  for (const path of files) {
    if (!path.startsWith('packages/compiler/') || !path.endsWith('.ts')) continue;
    const source = readFileSync(join(root, path), 'utf8');
    const { importedFiles } = ts.preProcessFile(source, true, true);
    for (const { fileName: specifier } of importedFiles) {
      if (!specifier.startsWith('.')) continue;
      const target = resolve(root, dirname(path), specifier);
      const stem = target.replace(/\.js$/, '');
      const candidates = [...new Set([target.endsWith('.ts') || target.endsWith('.json') ? target : `${stem}.ts`, join(stem, 'index.ts'), `${stem}.json`])];
      for (const candidate of candidates) {
        const local = posix(relative(root, candidate));
        if (local === '..' || local.startsWith('../') || !existsSync(candidate)) continue;
        if (!files.has(local)) missing.push(`${path}: ${specifier} -> ${local}`);
      }
    }
  }
  assert.deepEqual(missing, [], `Relative imports missing from compiler SDK:\n${missing.join('\n')}`);
});

test('compiler SDK includes native backend modules without their tests', () => {
  assert.ok(files.has('packages/compiler/src/backend/native/process.ts'));
  assert.ok(![...files].some(path => /^packages\/compiler\/src\/backend\/native\/.*\.test\.ts$/.test(path)));
});
