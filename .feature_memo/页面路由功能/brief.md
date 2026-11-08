# Brief

## User Goal

- 在改名后的 AnseronUI 中增加页面路由，让 TSX 页面可以在 iOS、Android、Web 容器内互相跳转。

## Scope

- 提供统一的 `useRouter()` API 和页面栈语义。
- 宿主容器支持从根加载、push、replace、pop/back。
- 使用现有 `definePage` / `anseronui.config.json` 页面注册。

## Non-Goals

- 本版暂不做路由参数、深链、缓存页面和转场动画。

## Acceptance Criteria

- Counter 可打开 Async Form，Async Form 可返回 Counter。
- 三端框架类型检查、框架测试及原生构建通过。

## Open Questions

- 页面切换按销毁并重新创建处理，不保留旧页面实例状态。
