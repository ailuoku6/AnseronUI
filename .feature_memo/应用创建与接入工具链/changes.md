# Changes

## 2026-11-08

- Changed: 新增 `anseronui` CLI，支持 create/integrate/check/build；生成应用包含 Home/Details 页面、useRouter 示例和独立 Web/Wasm 入口。
- Changed: Core staging/build 支持非 demo buildId 和按应用配置输出 Wasm/Web 静态资源。
- Changed: staging 支持位于框架仓库外的接入源码；外部 Web 项目需要在配置中提供自己的 `web.viteConfig`。
- Verification: CLI 专项测试、框架类型检查、35 项框架测试、Core 输入检查以及生成应用真实 Web/Wasm 构建均通过；默认示例 Web 产物已恢复。
- Known issues: 现有应用的 iOS/Android 原生 target 需要按接入清单手动链接 renderer/Core。
- Next: 后续可发布独立 npm CLI 包，并增加 CocoaPods/Gradle 自动接入。
