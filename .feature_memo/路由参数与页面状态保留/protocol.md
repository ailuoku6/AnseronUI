# Protocols and Contracts

- `RouteValue = string | number | boolean | null | RouteValue[] | { [key:string]: RouteValue }`。
- `router.push(page, params?)`, `replace(page, params?)`, `getParams<T>()`；参数入栈时 JSON 编码快照，默认 `{}`，最大 48 KB。
- 每个条目有唯一内部 identity；相同页面名可多次入栈并保留独立状态。
- 路由 handler 绑定创建它的条目。`getParams/current` 返回自身 entry 数据；push/replace/pop 仅当前栈顶可调用；已移除条目返回 `SURFACE_DISPOSED`。
- pop 销毁当前 entry，展示前一 entry；replace 销毁当前 entry；load 与 host destroy 清空所有 entry。
- JSON 之外的值、循环、非有限数、畸形参数和超过限额内容拒绝。
