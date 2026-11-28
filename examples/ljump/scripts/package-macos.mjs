import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const source = fileURLToPath(new URL('../.verification/macos-release/App.app', import.meta.url));
const app = join(dist, 'Ljump.app');
mkdirSync(dist, { recursive: true });
const staging = mkdtempSync(join(dist, '.ljump-'));
try {
  const bundle = join(staging, 'Ljump.app');
  execFileSync('ditto', [source, bundle]);
  const localIdentity = process.env.LJUMP_LOCAL_SIGN_IDENTITY;
  if (localIdentity && !process.env.ANSERONUI_MACOS_SIGN_IDENTITY) {
    execFileSync('codesign', ['--force', '--sign', localIdentity, '--timestamp=none', bundle], { stdio: 'inherit' });
  }
  execFileSync('codesign', ['--verify', '--deep', '--strict', bundle]);
  rmSync(app, { recursive: true, force: true });
  renameSync(bundle, app);
  console.log(`Ready to open: ${app}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
