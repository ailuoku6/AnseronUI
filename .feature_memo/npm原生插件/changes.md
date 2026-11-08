# 变更与验证

2026-11-08：完成插件协议、CLI/构建接入、三端示例和 README。

已通过：插件 7 项测试（传递依赖、清单校验、目标缺失、生成、卸载、权限冲突、Core 指纹、TS 类型与 staging、npm pack/离线安装、Web 工厂和冲突）；框架 40 测试；build 4 测试；框架类型检查；SDK npm 打包测试。工具旧测试 9 项通过（合计 test:tooling 16 项）。

iOS：将真实示例 npm pack 后安装到 `.verification/plugin-smoke`，共享页面调用 useDevice；完整模拟器构建 BUILD SUCCEEDED。
Android：共享 Core 和 Debug APK 编译通过；在测试安装副本添加 ACCESS_NETWORK_STATE 与 kotlin-stdlib Maven 声明，重新构建通过，并确认合并 Manifest 包含权限。默认沙箱禁止全局缓存写入与本地端口，使用 workspace 克隆缓存及获准的本地 Gradle 离线执行完成验证。
Web：共享 Wasm 编译和 Vite 生产打包通过。示例 App 类型检查通过。

未实际发布 npm 或提交 Git。已清理验证时克隆的 Gradle 缓存与模板 Python bytecode，保留 .verification 构建输出及日志。
