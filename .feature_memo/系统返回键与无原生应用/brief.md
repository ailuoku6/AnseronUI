# Brief

## User Goal

- 新建 AnseronUI 应用只编写 TSX 页面，不编写 iOS/Android 原生页面代码。
- 支持多个 AnseronUI 页面之间的跳转、替换、返回，并监听系统返回键，参考 Kuikly BackPressHandler。

## Scope

- CLI 生成和接入配置、通用原生宿主、页面 manifest、跨端路由 API、同步返回键事件分发。

## Non-Goals

- 本阶段不生成产品专属 App 壳、bundle id、异步返回确认弹窗或全局返回键注册表。

## Acceptance Criteria

- `anseronui create` 生成页面、路由示例和 iOS/Android/Web 构建脚本。
- 原生宿主从 Core manifest 读取页面名称，页面增删不要求修改原生页面代码。
- TSX 可通过 `useRouter()` 跳转和返回。
- `onBackPress` 同步返回 `boolean`，可消费返回键；未消费时宿主执行路由 pop 或系统默认行为。
- 核心测试和三端构建通过。

## Open Questions

- iOS 没有统一系统返回键，需要接入导航控制器或宿主按钮/手势调用 `handleBackPress()`。
