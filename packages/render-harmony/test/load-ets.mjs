import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Execute the shipped ArkTS service logic against explicitly supplied OS adapters.
// Actual ArkTS compatibility is verified separately by the API 21 HAP build.
export function loadETS(name, mocks = {}, globals = {}) {
  const cache = new Map();
  const require = createRequire(import.meta.url);
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} }; cache.set(path, module);
    const source = readFileSync(path, 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
    const localRequire = specifier => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith('.')) return load(resolve(dirname(path), specifier + '.ets'));
      if (specifier.startsWith('@kit') || specifier.startsWith('@ohos') || specifier.endsWith('.so')) throw new Error('Unmocked OS adapter: ' + specifier);
      return require(specifier);
    };
    new Function('require', 'module', 'exports', ...Object.keys(globals), outputText)(localRequire, module, module.exports, ...Object.values(globals));
    return module.exports;
  }
  return load(resolve(import.meta.dirname, '../src/main/ets', name + '.ets'));
}
