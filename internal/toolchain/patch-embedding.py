from pathlib import Path
root=Path(__file__).parent/'scriptc'
def patch(name,old,new,count=1):
 p=root/name;s=p.read_text();assert old in s,(name,old[:80]);p.write_text(s.replace(old,new,count))
p='packages/compiler/src/library/library-profile.ts'
patch(p,'  profileFormat: 1 | 2;','  profileFormat: 1 | 2;\n  asyncEmbedding?: boolean;')
patch(p,'          "npm_static",','          "npm_static",\n          "async_embedding",')
patch(p,'    const name = req<string>', '''    const asyncEmbedding = p["async_embedding"] !== undefined;
    if (asyncEmbedding) {
      const config = p["async_embedding"];
      if (config === null || typeof config !== "object" || Array.isArray(config)) throw new ProfileError("async_embedding must be { version: 1 }");
      rejectUnknownKeys(config, "async_embedding", ["version"]);
      if ((config as Record<string, unknown>)["version"] !== 1) throw new ProfileError("unsupported async_embedding.version");
      if (p["sidecar"] !== undefined) throw new ProfileError("async embedding does not use the synchronous contract sidecar");
    }
    const name = req<string>''')
patch(p,'        profileFormat: format as 1 | 2,','        profileFormat: format as 1 | 2,\n        ...(asyncEmbedding ? { asyncEmbedding: true } : {}),')
patch(p,'    claim(sinkRegisterSymbol, "abi.sink_register_symbol");','''    claim(sinkRegisterSymbol, "abi.sink_register_symbol");
    if (asyncEmbedding) {
      claim(prefix + "async_step", "async_embedding.step");
      claim(prefix + "async_pending", "async_embedding.pending");
    }''')
p='packages/compiler/src/ir/ir.ts'
patch(p,'export interface IrLibSection {','export interface IrLibSection {\n  asyncEmbedding?: boolean;')
p='packages/compiler/src/library/ir-policy.ts'
patch(p,'moduleLibAsyncSurface(mod: IrModule)', 'moduleLibAsyncSurface(mod: IrModule, embedding = false)')
patch(p,'if (fn.async === true)', 'if (!embedding && fn.async === true)')
patch(p,'    const surface = LIB_MODE_REFUSED_KINDS.get(kind);','    if (embedding && ["promise", "awaitExpr", "awaitUnionExpr"].includes(kind)) return true;\n    const surface = LIB_MODE_REFUSED_KINDS.get(kind);')
patch(p,'[features.dynAsync, "the checked-dynamic async surface"]','[features.dynAsync && !embedding, "the checked-dynamic async surface"]')
p='packages/compiler/src/library/prepare.ts'
patch(p,'threadInstances: profile.instancePerThread,','threadInstances: profile.instancePerThread,\n      ...(profile.asyncEmbedding ? { asyncEmbedding: true } : {}),')
patch(p,'moduleLibAsyncSurface(mod);','moduleLibAsyncSurface(mod, profile.asyncEmbedding);')
patch(p,'        profile.initSymbol,','        profile.initSymbol,\n        ...(profile.asyncEmbedding ? [profile.prefix + "async_step", profile.prefix + "async_pending"] : []),')
patch(p,'    "scriptc_alloc",','    ...(profile.asyncEmbedding ? [profile.prefix + "async_step", profile.prefix + "async_pending"] : []),\n    "scriptc_alloc",')
p='packages/compiler/src/backend/llvm/emitter.ts'
patch(p,'this.stacklessGenerators && mod.lib === undefined && !windows','this.stacklessGenerators && (mod.lib === undefined || mod.lib.asyncEmbedding === true) && !windows')
p='packages/compiler/src/backend/llvm/emit-module.ts'
patch(p,'    emitter.declare(`declare void @scr_library_reset()`);','''    emitter.declare(`declare void @scr_library_reset()`);
    if (emitter.mod.lib.asyncEmbedding) {
      emitter.declare(`declare i32 @scr_embed_step(i32)`);
      emitter.declare(`declare i32 @scr_embed_pending()`);
    }''')
patch(p,'  emitSymConst(lib.initSymbol);','''  if (lib.asyncEmbedding) {
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
p='packages/compiler/src/backend/native/contracts.ts'
patch(p,'  threadInstances?: boolean;','  threadInstances?: boolean;\n  asyncEmbedding?: boolean;')
p='packages/compiler/src/backend/native/library.ts'
patch(p,'    ...LIB_RUNTIME_SOURCES,','    ...LIB_RUNTIME_SOURCES,\n    ...(opts.asyncEmbedding ? ["scr_async.c", "scr_async_dyn.c"] : []),')
patch(p,'    "-DSCR_LIB",','    "-DSCR_LIB",\n    ...(opts.asyncEmbedding ? ["-DSCR_ASYNC_EMBEDDING"] : []),')
p='packages/compiler/src/index.ts'
patch(p,'    ...(profile.instancePerThread ? { threadInstances: true } : {}),','    ...(profile.instancePerThread ? { threadInstances: true } : {}),\n    ...(profile.asyncEmbedding ? { asyncEmbedding: true } : {}),')
patch(p,'  if (packTarget !== null) await compilePackedLibrary(archiveOptions, packTarget);','  if (packTarget !== null && !profile.asyncEmbedding) await compilePackedLibrary(archiveOptions, packTarget);')
p='packages/runtime/src/scr_async.c'
patch(p,'static bool scr_loop_run_pass(ScrPromise *top_level, bool first_checkpoint) {','''#ifdef SCR_ASYNC_EMBEDDING
int32_t scr_embed_pending(void) { return scr_ready_len != 0; }
int32_t scr_embed_step(uint32_t budget) {
  if (scr_current != NULL) scr_trap("scriptc: async step reentry\\n");
  while (budget > 0 && scr_ready_len > 0) {
    budget--;
    ScrFiber *f = scr_ready[scr_ready_head++];
    scr_ready_len--;
    SCR_RESUME_JOB(f);
    if (scr_exc_pending()) break;
  }
  if (scr_ready_len == 0) {
    scr_ready_head = 0;
    scr_cyc_collect_scheduled();
  }
  return scr_embed_pending();
}
#endif

static bool scr_loop_run_pass(ScrPromise *top_level, bool first_checkpoint) {''')
print('Applied async embedding to scriptc 0.4.8')
