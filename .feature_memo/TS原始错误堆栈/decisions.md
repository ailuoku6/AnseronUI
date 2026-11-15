# 决策

- 2026-11-15：业务错误选择编译期恢复源码位置、运行时保存源码栈，复用现有 Error.stack 与异常上下文，避免为业务异常依赖线上 Native symbolicator。
- 2026-11-15：不修改 runtime ABI；constructorOpt 由 LLVM 代码查找当前帧文本，兼容已安装 runtime packs。
- 2026-11-15：生成代码没有可靠来源时保留 unmapped 状态；原始文件路径使用 staging 的逻辑路径。
- 2026-11-15：保留原有宿主回调并添加详细回调，避免调用方被迫迁移。
