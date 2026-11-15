# 技术实现

- `packages/ui-compiler/src/source-map.ts` 使用固定 TypeScript 5.9 打印器生成映射，组合 TSX、定时器、插桩和 import 显式文本编辑。使用构建时逐字符 provenance 数组，输出压缩区段映射。
- staging 将 `//# anseronuiSourceMap=` JSON 附加到暂存源码，包含原始逻辑路径和位置区段，不含源码正文。
- scriptc `SourceLocations` 解析映射；LLVM emitter 在原生/Wasm 调用前更新源码栈帧位置，Error 创建时由现有 runtime 复制栈；无需更改 runtime ABI 或重建运行时包。
- mapped 构建开启源码栈，与优化级别、DWARF 和 DevTools 开关独立。普通无映射 scriptc 构建保留旧行为。
- `Error.captureStackTrace` 的静态 constructorOpt 在活动帧中查找当前文本，然后调用现有 runtime exact-match 接口。
- 原生/库语义缓存拒绝忽略映射注释的语义等价重用，避免原始行列过期。
- 修改源码栈后应运行 `npm run test:stacks`，不可仅检查 LLVM 字符串。映射核心使用 TS 内部打印 API，升级 TS 时必须重跑相关测试。
