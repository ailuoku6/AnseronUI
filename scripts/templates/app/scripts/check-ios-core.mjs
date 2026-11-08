import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const app = fileURLToPath(new URL('../', import.meta.url));
let configPath = join(app, 'anseronui.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const framework = resolve(app, config.app.framework);
configPath = join(app, '.anseronui/build.config.json');
const { coreFingerprint } = await import(pathToFileURL(join(framework, 'scripts/core-inputs.mjs')));
const target = process.env.PLATFORM_NAME === 'iphoneos' ? 'ios-device' : 'ios-simulator';
try {
  const directory = join(app, '.verification/core-' + target);
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  const digest = createHash('sha256').update(readFileSync(join(directory, 'entry.lib.a'))).digest('hex');
  if (manifest.buildId !== config.buildId || manifest.sourceFingerprint !== coreFingerprint(framework, configPath) || manifest.localArtifactSha256 !== digest) throw new Error('Core is missing, stale or belongs to another app.');
  console.log('Verified local app Core: ' + target);
} catch (error) {
  console.error(`error: ${error.message} Run npm run build:${target === 'ios-device' ? 'ios-device' : 'ios'} from ${app}.`);
  process.exitCode = 1;
}
