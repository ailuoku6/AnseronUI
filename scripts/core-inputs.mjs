import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';

export const coreSourceDirs = config => [
  'packages/core/src', 'packages/ui/src', 'packages/layout/src',
  'packages/flexily/src', 'packages/protocol/src', ...config.sourceDirs,
];

const buildInputs = [
  'scripts/stage-core.mjs', 'scripts/core-inputs.mjs', 'scripts/build-core.mjs',
  'scripts/prepare-compiler.mjs', 'internal/toolchain/build-library.mjs',
  'internal/toolchain/async-embedding.patch',
];
function fingerprint(root, paths) {
  const files = new Set();
  function collect(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const next = join(path, entry.name);
      if (entry.isDirectory()) collect(next);
      else if (/\.tsx?$/.test(entry.name)) files.add(next);
    }
  }
  for (const path of paths) {
    const absolute = resolve(root, path);
    if (path.endsWith('/')) collect(absolute);
    else files.add(absolute);
  }
  const hash = createHash('sha256');
  for (const file of [...files].sort()) {
    const data = readFileSync(file);
    hash.update(relative(root, file)); hash.update('\0'); hash.update(String(data.length)); hash.update('\0'); hash.update(data);
  }
  return hash.digest('hex');
}
/** No app config or business source participates in the framework identity. */
export function frameworkFingerprint(root) {
  return fingerprint(root, [...buildInputs, 'packages/core/native/framework.profile.json',
    'packages/core/src/kernel.ts', 'packages/core/src/contracts.ts', 'packages/layout/src/',
    'packages/flexily/src/', 'packages/protocol/src/', 'packages/ui/src/']);
}
export function businessFingerprint(root, configPath = 'anseronui.config.json') {
  const config = JSON.parse(readFileSync(resolve(root, configPath), 'utf8'));
  return fingerprint(root, [...buildInputs, configPath, 'scripts/lower-timers.mjs',
    'packages/core/native/business.profile.json', 'packages/core/src/business-runtime.ts',
    'packages/core/src/contracts.ts', 'packages/ui/src/', 'packages/protocol/src/',
    'packages/ui-compiler/src/', ...config.sourceDirs.map(dir => dir + '/')]);
}

// Hash source contents rather than mtimes: switching branches or restoring files
// must also invalidate the compiled Core. Keep this list aligned with staging.
export function coreFingerprint(root, configPath = 'anseronui.config.json') {
  const configFile = resolve(root, configPath);
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  const files = new Set([
    configFile,
    ...['scripts/stage-core.mjs', 'scripts/core-inputs.mjs', 'scripts/build-core.mjs',
      'internal/toolchain/build-library.mjs', 'internal/toolchain/async-embedding.patch',
      'packages/core/native/profile.json', 'packages/core/native/framework.profile.json', 'packages/core/native/business.profile.json',
      'packages/core/native/split_bridge.c', 'scripts/lower-timers.mjs', 'scripts/prepare-compiler.mjs'].map(path => resolve(root, path)),
  ]);
  function collect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) collect(path);
      else if (/\.tsx?$/.test(entry.name)) files.add(path);
    }
  }
  for (const dir of [...coreSourceDirs(config), 'packages/ui-compiler/src']) collect(resolve(root, dir));
  const hash = createHash('sha256');
  for (const file of [...files].sort()) {
    const contents = readFileSync(file);
    hash.update(relative(root, file)); hash.update('\0');
    hash.update(String(contents.length)); hash.update('\0'); hash.update(contents);
  }
  return hash.digest('hex');
}
