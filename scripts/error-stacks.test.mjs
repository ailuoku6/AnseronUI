import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { WASI } from 'node:wasi';
import { lowerTSX } from '../packages/ui-compiler/src/index.ts';
import { sourceMapComment } from '../packages/ui-compiler/src/source-map.ts';
import { compile, compileLibrary } from '../internal/toolchain/scriptc/packages/compiler/dist/index.js';

const source = `function leaf(): void {
  throw new Error("original");
}
function argument(): number { return 1; }
function caller(n: number): void {
  leaf();
}
function caught(): string {
  try { caller(argument()); } catch (error) {
    if (error instanceof Error) return error.stack ?? "missing";
  }
  return "unexpected";
}
function hidden(): Error {
  const error = new Error("capture");
  Error.captureStackTrace(error, hidden);
  return error;
}
function visible(): string { return hidden().stack ?? "missing"; }
async function later(): Promise<string> {
  await Promise.resolve(1);
  try { leaf(); } catch (error) {
    if (error instanceof Error) return error.stack ?? "missing";
  }
  return "unexpected";
}
let asyncStack = "";
export function start(): void { void later().then(value => { asyncStack = value; }); }
export function read(): string { return asyncStack; }
export function run(): string { return caught() + "\\n---\\n" + visible(); }
`;
function prepare() {
  const directory = mkdtempSync(resolve('.verification/error-stacks-'));
  const staged = lowerTSX(source, 'src/original.tsx');
  const entry = join(directory, 'entry.ts');
  writeFileSync(entry, staged.source + sourceMapComment(staged.mapped));
  return { directory, entry };
}
function check(stack) {
  assert.match(stack, /at leaf \(src\/original.tsx:2:9\)/);
  assert.match(stack, /at caller \(src\/original.tsx:6:3\)/);
  assert.match(stack, /at caught \(src\/original.tsx:9:9\)/, 'nested argument must not replace the caller location');
  const capture = stack.split('---')[1];
  assert.match(capture, /at visible \(src\/original.tsx:19:37\)/);
  assert.doesNotMatch(capture, /at hidden /, 'constructorOpt must still skip its live frame');
  assert.doesNotMatch(stack, /\.verification/);
}

test('Release native errors retain original TSX positions and captureStackTrace semantics', async () => {
  const {directory,entry} = prepare();
  try {
    // The map is regenerated for the executable entry, so additional code cannot shift existing positions.
    const staged=lowerTSX(source+'\nconsole.log(run());\nvoid later().then(value => console.log(value));\n','src/original.tsx');
    writeFileSync(entry,staged.source+sourceMapComment(staged.mapped));
    const output=join(directory,'probe');
    const result=await compile(entry,{outDir:directory,outPath:output,optimization:'release'});
    assert.equal(result.ok,true,JSON.stringify(result));
    const stack=execFileSync(output,{encoding:'utf8'});
    check(stack);
    assert.match(stack,/at later \(src\/original.tsx:22:9\)/);
    const moved = lowerTSX('\n'+source+'\nconsole.log(run());\nvoid later().then(value => console.log(value));\n', 'src/original.tsx');
    assert.equal(moved.source, staged.source, "only the original-source map changes");
    writeFileSync(entry, moved.source + sourceMapComment(moved.mapped));
    const rebuilt = await compile(entry, { outDir:directory, outPath:output, optimization:'release' });
    assert.equal(rebuilt.ok, true, JSON.stringify(rebuilt));
    assert.match(execFileSync(output, { encoding:'utf8' }), /at leaf \(src\/original.tsx:3:9\)/, 'source-only edits must invalidate symbol positions');
  } finally { rmSync(directory,{recursive:true,force:true}); }
});

test('Release Wasm library preserves synchronous and resumed async TSX frames', async () => {
  const {directory,entry} = prepare();
  const previous = process.env.SCRIPTC_TARGET;
  const previousCC = process.env.SCRIPTC_CC;
  const previousCache = process.env.ZIG_GLOBAL_CACHE_DIR;
  try {
    process.env.SCRIPTC_TARGET='wasm32-wasi';
    process.env.SCRIPTC_CC='zigcc';
    process.env.ZIG_GLOBAL_CACHE_DIR=resolve('.verification/zig-cache');
    const profile=join(directory,'profile.json');
    writeFileSync(profile,JSON.stringify({profile_format:1,name:'stack-probe',entry,emission:'llvm',optimization:'release',async_embedding:{version:1},abi:{prefix:'probe_',init_symbol:'probe_init',sink_register_symbol:'probe_sink',collect_symbol:'probe_collect',result_reset_symbol:'probe_reset'},exports:[{export:'run',symbol:'probe_run',params:[],returns:'string'},{export:'start',symbol:'probe_start',params:[],returns:'void'},{export:'read',symbol:'probe_read',params:[],returns:'string'}]}));
    const result=await compileLibrary({profilePath:profile,outDir:directory});
    assert.equal(result.ok,true,JSON.stringify(result));
    const wasi=new WASI({version:'preview1',args:[],env:{}});
    const loaded=await WebAssembly.instantiate(readFileSync(join(directory,'entry.wasm')),{wasi_snapshot_preview1:wasi.wasiImport,scriptc:{panic(){throw new Error('Wasm panic');}}});
    const api=loaded.instance.exports;
    wasi.initialize(loaded.instance);
    api.probe_init();
    const read=name=>{
      const slots=api.scriptc_alloc(8);
      try {
        api[name](slots,slots+4);
        const view=new DataView(api.memory.buffer);
        return new TextDecoder().decode(new Uint8Array(api.memory.buffer,view.getUint32(slots,true),view.getUint32(slots+4,true)));
      } finally {api.scriptc_free(slots);api.probe_reset();}
    };
    check(read('probe_run'));
    api.probe_start();
    for(let i=0;i<20 && api.probe_async_pending();i++)api.probe_async_step(1);
    const stack=read('probe_read');
    assert.match(stack,/at leaf \(src\/original.tsx:2:9\)/);
    assert.match(stack,/at later \(src\/original.tsx:22:9\)/);
  } finally {
    if(previous===undefined)delete process.env.SCRIPTC_TARGET;else process.env.SCRIPTC_TARGET=previous;
    if(previousCC===undefined)delete process.env.SCRIPTC_CC;else process.env.SCRIPTC_CC=previousCC;
    if(previousCache===undefined)delete process.env.ZIG_GLOBAL_CACHE_DIR;else process.env.ZIG_GLOBAL_CACHE_DIR=previousCache;
    rmSync(directory,{recursive:true,force:true});
  }
});
