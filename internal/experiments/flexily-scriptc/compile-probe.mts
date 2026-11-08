import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [compilerRoot, entry, kind, output] = process.argv.slice(2);
if (!compilerRoot || !entry || !output || (kind !== 'llvm' && kind !== 'exe')) {
  throw new Error('Expected compilerRoot, entry, llvm|exe, output');
}
const validationDeps = process.env.SCRIPTC_VALIDATION_DEPS;
if (validationDeps) {
  registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === '@scriptc/llvm-darwin-arm64/package.json' || specifier === '@scriptc/runtime-darwin-arm64/package.json') {
      return nextResolve(pathToFileURL(resolve(validationDeps, 'node_modules', specifier)).href, context);
    }
    return nextResolve(specifier, context);
  } });
}
const { compile, renderDiagnostics } = await import(pathToFileURL(resolve(compilerRoot, 'packages/compiler/src/index.ts')).href);
mkdirSync(resolve(output, '..'), { recursive: true });
const result = await compile(entry, { outputKind: kind, outPath: output, outDir: output + '.out', dynamic: false });
if (!result.ok) {
  console.error(renderDiagnostics(result.diagnostics, result.sourceTexts));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(result));
}
