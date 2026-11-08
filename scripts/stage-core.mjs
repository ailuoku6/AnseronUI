import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname, join } from 'node:path';
import { lowerTSX } from '../packages/ui-compiler/src/index.ts';
import { coreSourceDirs, coreFingerprint, frameworkFingerprint, businessFingerprint } from './core-inputs.mjs';
import { lowerTimers } from './lower-timers.mjs';
const root = resolve('.');
const configPath = relative(root, resolve(process.argv[2] ?? 'anseronui.config.json'));
const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
if (!/^[a-z][a-z0-9_-]{0,127}$/.test(config.buildId ?? '') || !Array.isArray(config.pages) || !config.pages.length) throw new Error('Invalid AnseronUI config');
for (const page of config.pages) {
 if (!/^[A-Za-z_$][\w$]*$/.test(page.export) || !page.source.endsWith('.tsx')) throw new Error('Invalid page entry');
}
const mode = process.argv[3] ?? 'business';
if (!['framework', 'business'].includes(mode)) throw new Error('Invalid bundle mode');
const stageTarget = process.argv[4];
if (stageTarget && !['native','ios-simulator','ios-device','android','wasm'].includes(stageTarget)) throw new Error('Invalid staging target');
const stage = resolve(stageTarget ? '.verification/source-' + stageTarget + '/' + mode : '.verification/' + mode + '-source');
await rm(stage, {recursive:true, force:true});
await mkdir(stage, {recursive:true});
const aliases = new Map([
 ['@anseronui/core','packages/core/src/index.ts'], ['@anseronui/layout','packages/layout/src/index.ts'],
 ['@anseronui/protocol','packages/protocol/src/index.ts'], ['@anseronui/ui','packages/ui/src/index.ts'],
 ['@anseronui/ui/jsx-runtime','packages/ui/src/jsx-runtime.ts']
]);
function stagedPath(path) {
 const absolute = resolve(root, path);
 const projectPath = relative(root, absolute);
 if (!projectPath.startsWith('..')) return projectPath;
 const candidates = (config.sourceDirs ?? []).map(dir => resolve(root, dir))
  .filter(dir => absolute === dir || absolute.startsWith(dir + '/'))
  .sort((a, b) => b.length - a.length);
 const base = candidates[0] ?? absolute;
 const identity = createHash('sha1').update(base).digest('hex').slice(0, 12);
 return join('__external__', identity, relative(base, absolute));
}
async function copy(path, outputPath = stagedPath(path)) {
 const absolute = resolve(root, path);
 for (const item of await readdir(absolute,{withFileTypes:true})) {
  const name=join(path,item.name);
  const target=join(outputPath,item.name);
  if(item.isDirectory()) await copy(name, target);
  else if(item.name.endsWith('.ts') || item.name.endsWith('.tsx')) {
   let text=await readFile(join(root,name),'utf8');
   const output=join(stage,target.replace(/\.tsx$/,'.ts'));
   if(item.name.endsWith('.tsx')) {
    const lowered=lowerTSX(text,name); if(lowered.diagnostics.length) throw new Error(JSON.stringify(lowered.diagnostics)); text=lowered.source;
   }
   if (mode === 'business' && !(relative(root, absolute).startsWith('packages/'))) text = lowerTimers(text, output);
   for(const [alias,target] of aliases) {
    let rel=relative(dirname(output),join(stage,target)).replace(/\.ts$/,'.js'); if(!rel.startsWith('.')) rel='./'+rel;
    text=text.replaceAll('"'+alias+'"','"'+rel+'"').replaceAll("'"+alias+"'","'"+rel+"'");
   }
   await mkdir(dirname(output),{recursive:true});await writeFile(output,text);
  }
 }
}
const sourceFingerprint = coreFingerprint(root, configPath);
for(const dir of coreSourceDirs(mode === 'framework' ? { sourceDirs: [] } : config)) await copy(dir);
const imports = config.pages.map((page, i) => `import { ${page.export} as page${i} } from './${stagedPath(page.source).replace(/\.tsx$/, '.js')}';`).join('\n');
const entry = mode === 'framework' ? `export { version, execute } from './packages/core/src/kernel.js';\n` : `import { BusinessRuntime } from './packages/core/src/business-runtime.js';
import { CORE_ABI_VERSION } from './packages/core/src/contracts.js';
import type { RenderResult } from './packages/core/src/contracts.js';
import type { Envelope, InputPayload, OutputPayload } from './packages/protocol/src/index.js';
${imports}
let runtime: BusinessRuntime | null = null;
let outputs: Envelope<OutputPayload>[] = [];
export function version(): number { return CORE_ABI_VERSION; }
export function create(): void { if (runtime !== null) throw new Error('RUNTIME_ALREADY_CREATED'); runtime = new BusinessRuntime({bundleBuildId:${JSON.stringify(config.buildId)}, pages:[${config.pages.map((_, i) => 'page' + i).join(',')}]}); }
export function post(input: string): void { if (runtime === null) throw new Error('RUNTIME_NOT_CREATED'); runtime.post(JSON.parse(input) as Envelope<InputPayload>); }
export function advance(): void { outputs.push(...(runtime?.step(1) ?? [])); }
export function step(): string { outputs.push(...(runtime?.takeOutputs() ?? [])); const result = JSON.stringify(outputs); outputs = []; return result; }
export function coreRequest(): string { const request = runtime?.takeCoreRequest(); return request ? JSON.stringify(request) : ''; }
export function coreResult(result: string): void { runtime?.acceptCoreResult(JSON.parse(result) as RenderResult); }
export function pending(): boolean { return runtime?.hasPendingWork() ?? false; }
export function dispose(): void { runtime?.dispose(); runtime=null; }
`;
await writeFile(join(stage,'entry.ts'),entry);
const profile=JSON.parse(await readFile('packages/core/native/' + mode + '.profile.json','utf8'));profile.entry='entry.ts';delete profile.npm_static;
await writeFile(join(stage,'profile.json'),JSON.stringify(profile,null,2)+'\n');
console.log(stage);
profile.abi.instance_per_thread = false;
profile.abi.localize_runtime = false; // Wasm instances already isolate symbols and memory.
await writeFile(join(stage, 'profile-wasm.json'), JSON.stringify(profile, null, 2) + '\n');
await writeFile(join(stage, 'manifest.json'), JSON.stringify({buildId:config.buildId, protocolMajor:1, runtimeEpoch:1, pages:config.pages.map(page => ({ ...page, name: page.name ?? page.source.split('/').slice(-2, -1)[0] })), configPath, sourceFingerprint, abiVersion: 1, frameworkFingerprint: frameworkFingerprint(root), businessFingerprint: businessFingerprint(root, configPath)}, null, 2) + '\n');
