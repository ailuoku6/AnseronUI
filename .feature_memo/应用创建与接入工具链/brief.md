# Brief

## User Goal

- 提供便捷的新建 AnseronUI 应用和现有应用接入 AnseronUI 框架的方法。

## Scope

- 新应用生成器能创建页面、路由示例、Web/Wasm 入口和构建脚本。
- 现有应用接入命令能生成配置、最小页面和三端宿主接入清单。
- 提供配置检查和按配置构建入口。

## Non-Goals

- 不自动改写现有原生工程、业务导航、网络层和状态管理。

## Acceptance Criteria

- `create` 生成的 app 可通过真实 Web/Wasm 构建。
- `integrate` 生成配置、页面和 `ANSERONUI_INTEGRATION.md`。
- CLI 和框架回归测试通过。

## Open Questions

- 现有项目的原生 target 仍需业务宿主手动链接 renderer/Core，Web 项目需要提供自己的 Vite host。
