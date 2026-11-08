import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreFingerprint } from './core-inputs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.argv[2] ?? (process.env.PLATFORM_NAME === 'iphoneos' ? 'ios-device' : 'ios-simulator');
if (!['ios-device', 'ios-simulator'].includes(target)) throw new Error('Invalid iOS Core target');
const buildCommand = target === 'ios-device' ? 'npm run build:ios-device' : 'npm run build:ios';
try {
  const directory = resolve(root, '.verification/core-' + target);
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
  if (!existsSync(resolve(directory, 'entry.lib.a')) || manifest.sourceFingerprint !== coreFingerprint(root, manifest.configPath)) {
    throw new Error('Core library is missing or out of date');
  }
  console.log(`Verified ${target} Core matches current sources`);
} catch (error) {
  console.error(`error: AnseronUI Core is missing or stale. Run \`${buildCommand}\` from ${root} before building in Xcode.\n${error.message}`);
  process.exit(1);
}
