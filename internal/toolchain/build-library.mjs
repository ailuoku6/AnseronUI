import { resolve } from 'node:path';
import { compileLibrary } from './scriptc/packages/compiler/dist/index.js';
const profile = resolve(process.argv[2]);
const outDir = resolve(process.argv[3] ?? '.verification/embedding');
const result = await compileLibrary({ profilePath: profile, outDir });
if (!result.ok) { console.error(result.diagnostics); process.exit(1); }
console.log(JSON.stringify(result));
