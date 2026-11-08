# 交接

从 index.md 开始。npm 原生插件功能已完成，README 有完整发布协议和限制，examples/native-plugin 为三端设备信息示例。

test:tooling 16 项、test:build 4 项、test:framework 40 项、框架类型检查及 SDK 打包测试均通过。真实 tarball 安装后的示例 App 通过 iOS 模拟器、Android APK、Web 完整构建。Android 额外验证权限合并与 Maven 依赖。日志位于 .verification/plugin-smoke-*.log。

后续可单独扩展 Pods/SPM/资源/二进制等能力；本次范围无待办。已有工程需要迁移新模板，integrate 模式仍手动管理注册。未发布 npm、未提交 Git；工作区含大量原有用户改动，勿回滚。
