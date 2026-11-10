import { readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

// Explicit distribution boundary: never copy checkout history, dependencies or build outputs.
const directories = [
  ...['core', 'ui', 'layout', 'flexily', 'protocol', 'ui-compiler', 'render-web'].map(name => `packages/${name}/src`),
  'packages/core/native', 'packages/render-ios/Sources', 'packages/render-macos/Sources',
  'packages/render-android/src/main/java', 'packages/render-android/src/main/cpp',
  'scripts/templates/app',
];
const files = [
  'LICENSE', 'THIRD_PARTY_NOTICES.md',
  'packages/render-macos/Package.swift', 'packages/flexily/LICENSE', 'packages/render-ios/Package.swift',
  'packages/render-android/src/main/AndroidManifest.xml',
  'internal/toolchain/build-library.mjs', 'internal/toolchain/async-embedding.patch', 'internal/toolchain/scriptc.vendor.json',
  ...['anseronui', 'standalone-app', 'native-plugins', 'sdk-files', 'prepare-compiler', 'prepare-tools',
    'macos-app', 'build-core', 'build-app', 'stage-core', 'core-inputs', 'lower-timers'].map(name => `scripts/${name}.mjs`),
];
export const toolchainHost = `${process.platform}-${process.arch}${process.platform === 'linux' ? (process.report.getReport().header.glibcVersionRuntime ? '-gnu' : '-musl') : process.platform === 'win32' ? '-msvc' : ''}`;
export const sdkAliases = Object.fromEntries([
  ...['core', 'ui', 'layout', 'protocol', 'render-web'].map(name => [`@anseronui/${name}`, `packages/${name}/src/index.ts`]),
  ['@anseronui/ui/jsx-runtime', 'packages/ui/src/jsx-runtime.ts'],
  ['@anseronui/ui/jsx-dev-runtime', 'packages/ui/src/jsx-runtime.ts'],
]);
export function sdkFiles(root) {
  const vendor = JSON.parse(readFileSync(join(root, 'internal/toolchain/scriptc.vendor.json'), 'utf8'));
  // npm strips ignore files from archives. They are checkout metadata, not
  // compiler inputs, so exclude them from copying and fingerprinting alike.
  const vendorFiles = vendor.sdkFiles.filter(path => !/(^|\/)\.(npmignore|gitignore)$/.test(path));
  const result = [...files, ...vendorFiles.map(path => `internal/toolchain/scriptc/${path}`)];
  function walk(path) {
    for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
      if (['AGENTS.md', '.DS_Store', '__pycache__', 'node_modules', 'test', 'tests'].includes(entry.name)) continue;
      const next = `${path}/${entry.name}`;
      if (entry.isDirectory()) walk(next); else result.push(next);
    }
  }
  directories.forEach(walk);
  return result.sort();
}
export function sdkFingerprint(root) {
  const hash = createHash('sha256');
  hash.update(readFileSync(join(root, 'package.json')));
  for (const path of sdkFiles(root)) hash.update(path).update('\0').update(readFileSync(join(root, path)));
  return hash.digest('hex');
}
export function copySDK(root, destination) {
  for (const path of sdkFiles(root)) {
    // npm excludes .gitignore; use an ordinary filename inside the template.
    const output = join(destination, path.replace(/\/\.gitignore$/, '/gitignore'));
    mkdirSync(dirname(output), { recursive: true });
    if (path.endsWith('.ts') && path.startsWith('packages/')) {
      let source = readFileSync(join(root, path), 'utf8');
      // Keep all runtime modules within this one npm package. No unpublished workspace dependencies.
      for (const [alias, target] of Object.entries(sdkAliases)) {
        if (path === 'packages/ui-compiler/src/index.ts') continue;
        let specifier = relative(dirname(path), target).split(sep).join('/').replace(/\.ts$/, '.js');
        if (!specifier.startsWith('.')) specifier = './' + specifier;
        source = source.replaceAll(`"${alias}"`, `"${specifier}"`).replaceAll(`'${alias}'`, `'${specifier}'`);
      }
      writeFileSync(output, source);
    } else copyFileSync(join(root, path), output);
  }
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  writeFileSync(join(destination, 'package.json'), JSON.stringify({ name: 'anseronui-sdk', version, type: 'module', license: 'MIT' }, null, 2) + '\n');
  chmodSync(join(destination, 'scripts/anseronui.mjs'), 0o755);
  chmodSync(join(destination, 'scripts/templates/app/platforms/android/gradlew'), 0o755);
}
