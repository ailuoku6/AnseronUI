import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)); process.chdir(root);
const checkout=resolve('internal/toolchain/scriptc');
const revision='3d1888ae5e82a01434edd49f59bff5fab7c5a9c7';
function run(cmd,args,cwd=root,env=process.env) { const r=spawnSync(cmd,args,{cwd,stdio:'inherit',env}); if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1); }
if(!existsSync(checkout)) {
  run('git',['clone','--depth','1','--branch','v0.4.8','https://github.com/vercel-labs/scriptc.git',checkout]);
}
const head=spawnSync('git',['rev-parse','HEAD'],{cwd:checkout,encoding:'utf8'});
if(head.status!==0 || head.stdout.trim()!==revision)throw new Error('Compiler checkout must be pinned to '+revision);
const patch=resolve('internal/toolchain/async-embedding.patch');
const applied=spawnSync('git',['apply','--reverse','--check',patch],{cwd:checkout,stdio:'ignore'});
if(applied.status!==0)run('git',['apply',patch],checkout);
if(!existsSync(join(checkout,'packages/compiler/node_modules/typescript/lib/getExePath.js')) || !existsSync(join(checkout,'packages/compiler/node_modules/tsc-ts/package.json'))) {
  run('pnpm',['install','--ignore-scripts','--filter','@scriptc/compiler...','--frozen-lockfile'],checkout,{...process.env,CI:'true'});
}
run(process.execPath,['scripts/prepare-tools.mjs']);
const helper=`llvm-${process.platform}-${process.arch}`;
const version=JSON.parse(readFileSync(`node_modules/@scriptc/${helper}/package.json`,'utf8')).version;
if(version!=='0.4.8')throw new Error('Matching LLVM helper 0.4.8 required');
const link=resolve(checkout,'packages',helper,'bin');
if(!existsSync(link)) { mkdirSync(dirname(link),{recursive:true}); symlinkSync(relative(dirname(link),resolve('node_modules/@scriptc',helper,'bin')),link,'dir'); }
run(process.execPath,['packages/compiler/node_modules/typescript/bin/tsc','-p','packages/compiler/tsconfig.json'],checkout);
console.log('AnseronUI async embedding compiler ready (scriptc v0.4.8 + pinned patch)');
