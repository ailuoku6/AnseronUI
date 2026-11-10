import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireMacOS } from './macos-app.mjs';
const root = fileURLToPath(new URL('../',import.meta.url)); process.chdir(root); requireMacOS();
function run(command,args) { const result = spawnSync(command,args,{stdio:'inherit'}); if(result.error)throw result.error; if(result.status!==0)process.exit(result.status ?? 1); }
run(process.execPath,['scripts/build-core.mjs','macos-arm64']);
const out = resolve('.verification/macos-tests'); mkdirSync(out,{recursive:true});
cpSync('examples/components/assets',join(out,'assets'),{recursive:true});
const sources = 'packages/render-macos/Sources/AnseronUIRenderMacOS';
run('xcrun',['clang','-arch','arm64','-mmacosx-version-min=14.0','-I','packages/core/native/include','-c','packages/core/native/transport.c','-o',join(out,'transport.o')]);
run('xcrun',['swiftc','-swift-version','5','-target','arm64-apple-macosx14.0','-module-cache-path',join(out,'module-cache'),'-I','packages/render-macos/Sources/AnseronUICoreC','-parse-as-library',...readdirSync(sources).filter(x=>x.endsWith('.swift')).map(x=>join(sources,x)),...readdirSync('packages/render-macos/Tests').filter(x=>x.endsWith('.swift')).map(x=>join('packages/render-macos/Tests',x)),'examples/native/macos/DemoExtensions.swift',join(out,'transport.o'),'.verification/core-macos-arm64/entry.lib.a','-o',join(out,'integration')]);
run(join(out,'integration'),[]);
