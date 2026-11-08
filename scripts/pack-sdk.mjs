import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { copySDK } from './sdk-files.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, 'dist/sdk');
rmSync(destination, { recursive: true, force: true });
copySDK(root, destination);
console.error('Prepared npm SDK at dist/sdk (sources, native renderers, templates and pinned compiler patch).');
