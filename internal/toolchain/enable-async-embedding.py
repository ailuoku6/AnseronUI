from pathlib import Path
import re
root = Path('/Users/ailuoku6/web_project/scriptc')
stage = Path('/Users/ailuoku6/web_project/TSNative/.verification/toolchain-stage')
files = {}
def read(name):
    if name not in files: files[name] = (root / name).read_text()
    return files[name]
def replace(name, old, new, count=1):
    s=read(name)
    assert old in s, (name, old[:100])
    files[name]=s.replace(old,new,count)
p='packages/compiler/src/library/library-profile.ts'
replace(p,'  profileFormat: 1;','  profileFormat: 1;\n  asyncEmbedding?: boolean;')
replace(p,'"optimization", "npm_static", "abi"','"optimization", "npm_static", "async_embedding", "abi"')
replace(p,'    const name = req<string>', '''    const asyncEmbedding = p["async_embedding"] !== undefined;
    if (asyncEmbedding) {
      const config = p["async_embedding"];
      if (config === null || typeof config !== "object" || Array.isArray(config)) throw new ProfileError("async_embedding must be { version: 1 }");
      rejectUnknownKeys(config, "async_embedding", ["version"]);
      if ((config as Record<string, unknown>)["version"] !== 1) throw new ProfileError("unsupported async_embedding.version");
      if (p["sidecar"] !== undefined) throw new ProfileError("async embedding requires its own manifest, not a synchronous contract sidecar");
    }
    const name = req<string>''')
replace(p,'        profileFormat: 1,','        profileFormat: 1,\n        ...(asyncEmbedding ? { asyncEmbedding: true } : {}),')
replace(p,'    claim(sinkRegisterSymbol, "abi.sink_register_symbol");','''    claim(sinkRegisterSymbol, "abi.sink_register_symbol");
    if (asyncEmbedding) {
      claim(prefix + "async_step", "async_embedding.step");
      claim(prefix + "async_pending", "async_embedding.pending");
    }''')
p='packages/compiler/src/ir/ir.ts'
replace(p,'export interface IrLibSection {','export interface IrLibSection {\n  asyncEmbedding?: boolean;')
replace(p,'export function moduleLibAsyncSurface(mod: IrModule)', 'export function moduleLibAsyncSurface(mod: IrModule, embedding = false)')
replace(p,'if (fn.async === true) return { surface:', 'if (!embedding && fn.async === true) return { surface:')
replace(p,'    const surface = LIB_MODE_REFUSED_KINDS.get(kind);','    if (embedding && ["promise", "awaitExpr", "awaitUnionExpr"].includes(kind)) return true;\n    const surface = LIB_MODE_REFUSED_KINDS.get(kind);')
p='packages/compiler/src/library/prepare.ts'
replace(p,'      threadInstances: profile.instancePerThread,','      threadInstances: profile.instancePerThread,\n      ...(profile.asyncEmbedding ? { asyncEmbedding: true } : {}),')
replace(p,'moduleLibAsyncSurface(mod);','moduleLibAsyncSurface(mod, profile.asyncEmbedding);')
replace(p,'        profile.initSymbol,','        profile.initSymbol,\n        ...(profile.asyncEmbedding ? [profile.prefix + "async_step", profile.prefix + "async_pending"] : []),')
replace(p,'    profile.initSymbol, "scriptc_alloc", "scriptc_free",','    profile.initSymbol, "scriptc_alloc", "scriptc_free",\n    ...(profile.asyncEmbedding ? [profile.prefix + "async_step", profile.prefix + "async_pending"] : []),')
p='packages/compiler/src/backend/llvm/emitter.ts'
replace(p,'  readonly wasi: boolean;','  readonly wasi: boolean;\n  readonly stacklessAsync: boolean;')
replace(p,'    this.wasi = options.wasi === true;','    this.wasi = options.wasi === true;\n    this.stacklessAsync = this.wasi || mod.lib?.asyncEmbedding === true;')
# Only coroutine-specific uses; retain actual Wasm ABI and platform branches.
s=read(p)
s=s.replace('if (this.wasi) out.push(`attributes #1', 'if (this.stacklessAsync) out.push(`attributes #1')
s=s.replace('...(this.wasi ? [`attributes #1', '...(this.stacklessAsync ? [`attributes #1')
s=s.replace('lifted && !this.wasi','lifted && !this.stacklessAsync')
s=s.replace('if (this.wasi && (fn.async', 'if (this.stacklessAsync && (fn.async')
s=s.replace('this.stackTraces && !this.wasi', 'this.stackTraces && !this.stacklessAsync')
a=s.index('  private emitAsyncScaffolding()'); b=s.index('  private emitGenScaffolding()',a)
s=s[:a]+s[a:b].replace('this.wasi','this.stacklessAsync')+s[b:]
a=s.index('  private emitGenScaffolding()'); b=s.index('\n  private ',a+10)
s=s[:a]+s[a:b].replace('this.wasi','this.stacklessAsync')+s[b:]
files[p]=s
replace(p,'      this.declare(`declare void @scr_library_reset()`);','''      this.declare(`declare void @scr_library_reset()`);
      if (this.mod.lib.asyncEmbedding) {
        this.declare(`declare i32 @scr_embed_step(i32)`);
        this.declare(`declare i32 @scr_embed_pending()`);
      }''')
replace(p,'    emitSymConst(lib.initSymbol);','''    if (lib.asyncEmbedding) {
      for (const suffix of ["async_step", "async_pending"]) emitSymConst(lib.prefix + suffix);
      out.push(
        `define i32 @${lib.prefix}async_step(i32 %budget) ${FN_ATTRS} {`,
        `  call void @scr_library_entry(i1 zeroext false, ptr ${symConst(lib.prefix + "async_step")})`,
        `  %r = call i32 @scr_embed_step(i32 %budget)`,
        `  call void @scr_library_check_exc()`,
        `  ret i32 %r`, `}`, ``,
        `define i32 @${lib.prefix}async_pending() ${FN_ATTRS} {`,
        `  call void @scr_library_entry(i1 zeroext false, ptr ${symConst(lib.prefix + "async_pending")})`,
        `  %r = call i32 @scr_embed_pending()`, `  ret i32 %r`, `}`, ``,
      );
    }
    emitSymConst(lib.initSymbol);''')
p='packages/compiler/src/backend/llvm/expr-async.ts'
files[p]=read(p).replace('host.wasi','host.stacklessAsync')
p='packages/compiler/src/backend/native-toolchain.ts'
replace(p,'  threadInstances?: boolean;','  threadInstances?: boolean;\n  asyncEmbedding?: boolean;')
replace(p,'    ...LIB_RUNTIME_SOURCES,','    ...LIB_RUNTIME_SOURCES,\n    ...(opts.asyncEmbedding ? ["scr_async.c"] : []),')
replace(p,'    "-DSCR_LIB",','    "-DSCR_LIB",\n    ...(opts.asyncEmbedding ? ["-DSCR_ASYNC_EMBEDDING", "-DSCR_STACKLESS_ASYNC"] : []),')
p='packages/compiler/src/index.ts'
replace(p,'    ...(profile.instancePerThread ? { threadInstances: true } : {}),','    ...(profile.instancePerThread ? { threadInstances: true } : {}),\n    ...(profile.asyncEmbedding ? { asyncEmbedding: true } : {}),')
replace(p,'  if (packTarget !== null) await compilePackedLibrary(archiveOptions, packTarget);','  if (packTarget !== null && !profile.asyncEmbedding) await compilePackedLibrary(archiveOptions, packTarget);')
p='packages/runtime/src/scr_async.c'
s=read(p)
# Reuse stackless coroutine plumbing without defining the WASI platform macro.
s=s.replace('defined(__wasi__)', '(defined(__wasi__) || defined(SCR_STACKLESS_ASYNC))')
s=s.replace('#ifdef __wasi__', '#if defined(__wasi__) || defined(SCR_STACKLESS_ASYNC)')
s=s.replace('#ifndef __wasi__', '#if !defined(__wasi__) && !defined(SCR_STACKLESS_ASYNC)')
s=s.replace('#include <poll.h>\n#else', '#include <poll.h>\n#ifndef __wasi__\n#include <unistd.h>\n#endif\n#else',1)
# The UI embedding has no timers or ambient IO. Its only work is the ready FIFO.
point=s.index('/* Reap granularity while children are pending')
s=s[:point]+'''#ifdef SCR_ASYNC_EMBEDDING
int32_t scr_embed_pending(void) { return scr_ready_len != 0; }
int32_t scr_embed_step(uint32_t budget) {
  if (scr_current != NULL) scr_trap("scriptc: async step reentry\\n");
  if (budget == 0) return scr_embed_pending();
  while (budget-- > 0 && scr_ready_len > 0) {
    ScrFiber *f = scr_ready[scr_ready_head++];
    scr_ready_len--;
    scr_resume_fiber(f);
    if (scr_exc_pending()) break;
  }
  if (scr_ready_len == 0) {
    scr_ready_head = 0;
    scr_cyc_collect_scheduled();
  }
  return scr_embed_pending();
}
#endif

'''+s[point:]
files[p]=s
for name,content in files.items():
    path=stage/name
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(content)
print('Staged',len(files),'toolchain files at',stage)
