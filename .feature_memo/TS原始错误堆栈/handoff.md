# 交接

从 index.md 开始。已打通原始 TS/TSX 位置到 native/Wasm Error.stack，现有异常出口与各端详细回调完成。

优先运行 `npm run test:stacks` 与框架测试，查看 changes.md 中的验证范围。native/Wasm 测试是真正执行 Release 编译产物，含只改原始空行的缓存回归。

注意 TypeScript 内部 printer API 固定在 5.9；runtime ABI 未修改；原生信号崩溃的 DWARF/dSYM 收集尚未实现。不要把业务 Error.stack 的还原描述为所有 Native crash 已覆盖。

验证完成：2 项实际 Release native/Wasm 测试、90 项框架测试、42 项编译器定向测试、47 项 Harmony 测试、7 项构建测试、3 项 DevTools 插桩测试、SDK 打包、Apple 类型检查和 Android Kotlin 编译均通过。完整 Native Core 构建与五组示例执行通过。未跑 scriptc 全量 sandbox/移动端真机崩溃。工作区未提交。
