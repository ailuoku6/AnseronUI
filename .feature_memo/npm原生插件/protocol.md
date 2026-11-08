# 插件协议

包的 `package.json.anseronui`：`schemaVersion:1`，`typescript` 指向共享 `.ts` 主入口；可选 `ios`、`android`、`web`，至少一个。

- ios：sources 目录列表、factory 简单 Swift 类型、可选 frameworks 系统框架列表、infoPlist（仅 NS…UsageDescription 字符串）。工厂 `@MainActor static createExtensions() -> IOSPlatformExtensions`。
- android：sources 目录列表、factory 完整 Kotlin object 名、可选 dependencies 固定 Maven 坐标、permissions 名称列表。工厂 `createExtensions(context: Context): AndroidPlatformExtensions`。
- web：entry 文件，导出同步 `createExtensions(): PlatformExtensions`。

路径必须在包内；不支持共享包子路径 exports。目标平台缺适配时报错；不同插件默认 iOS 权限说明冲突报错；App 自己的说明优先。工厂合并时拒绝重复模块/组件及保留模块名。所有能力沿用现有 Module、原生组件 JSON/取消/生命周期协议。
