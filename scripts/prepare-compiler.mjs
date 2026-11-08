import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolchainHost } from './sdk-files.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)); process.chdir(root);
const checkout=resolve('internal/toolchain/scriptc');
const vendor=JSON.parse(readFileSync(resolve('internal/toolchain/scriptc.vendor.json'),'utf8'));
function run(cmd,args,cwd=root,env=process.env) { const r=spawnSync(cmd,args,{cwd,stdio:'inherit',env}); if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1); }
if(!existsSync(join(checkout,'packages/compiler/src/index.ts')))throw new Error('Missing bundled scriptc sources; reinstall AnseronUI or restore internal/toolchain/scriptc.');
if(JSON.parse(readFileSync(join(checkout,'packages/compiler/package.json'),'utf8')).version!==vendor.version)throw new Error('Bundled compiler version does not match scriptc.vendor.json');
if(!existsSync(join(checkout,'packages/compiler/node_modules/typescript/lib/getExePath.js')) || !existsSync(join(checkout,'packages/compiler/node_modules/tsc-ts/package.json'))) {
  run(process.execPath,[resolve('node_modules/pnpm/bin/pnpm.cjs'),'install','--ignore-scripts','--filter','@scriptc/compiler...','--frozen-lockfile'],checkout,{...process.env,CI:'true'});
}
run(process.execPath,['scripts/prepare-tools.mjs']);
const helper=`llvm-${toolchainHost}`;
const version=JSON.parse(readFileSync(`node_modules/@scriptc/${helper}/package.json`,'utf8')).version;
if(version!==vendor.version)throw new Error('Matching LLVM helper '+vendor.version+' required');
const link=resolve(checkout,'packages',helper,'bin');
if(!existsSync(link)) { mkdirSync(dirname(link),{recursive:true}); symlinkSync(relative(dirname(link),resolve('node_modules/@scriptc',helper,'bin')),link,'dir'); }
run(process.execPath,['packages/compiler/node_modules/typescript/bin/tsc','-p','packages/compiler/tsconfig.json'],checkout);
console.log(`AnseronUI compiler ready (bundled scriptc v${vendor.version}, upstream ${vendor.revision}, async embedding applied)`);
