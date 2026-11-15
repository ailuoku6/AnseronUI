# 实施记录

## 2026-11-15

- 已实现映射组合、原始源码栈、协议字段、全端详细回调及接入文档。
- 已通过：Release native/Wasm 集成测试（含 await、constructorOpt、原始空行变更缓存）；90 项框架测试；7 项构建测试；3 项 DevTools 插桩测试。
- 已通过：完整 Release native framework/business 编译；五组 Native Core 示例运行测试。
- 编译器 lint、format:check 通过；框架 TypeScript 类型检查通过。
- 已通过：42 项编译器定向测试（debug-info、stack-observations、library-cache、native prepare）；47 项 Harmony 测试；SDK 打包和独立应用结构验证。
- 已通过：iOS simulator / macOS Swift 宿主类型检查；Android `:app:compileDebugKotlin --offline`。Apple 检查存在原有并发隔离警告；Android 编译有 Kotlin daemon 回退及原有弃用警告，命令最终退出 0。
- 已通过最终 `npm run test:stacks`、框架类型检查、编译器 lint 和 `git diff --check`。新增语义缓存用例确保转换后的 TS 完全相同时，原始空行变化仍更新错误位置。
- DevTools 错误日志增加 128 Ki UTF-16 单元总量预算，防止长堆栈导致快照超限。
- 未运行：scriptc 全量跨平台 sandbox 测试、各移动端真机崩溃测试；当前实测原生执行平台为 macOS arm64，另有 Wasm 执行测试。Native signal/dSYM/DWARF 端到端链路不在此次已实现范围。
- 本地未创建提交，所有更改保留在工作区。
