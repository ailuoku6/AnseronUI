import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const compilerRoot = process.argv[2];
if (!compilerRoot) throw new Error('Usage: node verify.mjs /absolute/path/to/scriptc [--llvm-only]');
const root = import.meta.dirname;
const kind = process.argv.includes('--llvm-only') ? 'llvm' : 'exe';
const requireFromCompiler = createRequire(join(resolve(compilerRoot), 'package.json'));
const loader = requireFromCompiler.resolve('tsx');
const outputDir = join(root, '.verification');
mkdirSync(outputDir, { recursive: true });
const summary = [];
function run(argv, timeout = 120000) {
  const result = spawnSync(process.execPath, argv, { cwd: compilerRoot, encoding: null, timeout });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error('Verification command failed: ' + argv.join(' '));
  }
  return result;
}
for (const name of ['probe-layout', 'probe-advanced']) {
  const entry = join(root, name + '.ts');
  const expected = readFileSync(join(root, name + '.expected.txt'));
  const node = run(['--import', loader, entry]);
  if (!node.stdout.equals(expected) || node.stderr.length !== 0) throw new Error(name + ': Node output differs from the upstream reference');
  const output = join(outputDir, name + '.' + kind);
  run(['--import', loader, join(root, 'compile-probe.mts'), resolve(compilerRoot), entry, kind, output]);
  if (kind === 'exe') {
    const native = spawnSync(output, [], { timeout: 30000 });
    if (native.error) throw native.error;
    if (native.status !== 0 || !native.stdout.equals(expected) || native.stderr.length !== 0) {
      writeFileSync(join(outputDir, name + '.actual.stdout'), native.stdout);
      writeFileSync(join(outputDir, name + '.actual.stderr'), native.stderr);
      throw new Error(name + ': native stdout/stderr/exit differs from the upstream reference');
    }
  }
  const item = { name, kind, lines: expected.toString('utf8').trimEnd().split('\n').length, sha256: createHash('sha256').update(expected).digest('hex'), dynamic: false, passed: true };
  summary.push(item);
  console.log(JSON.stringify(item));
}
writeFileSync(join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
