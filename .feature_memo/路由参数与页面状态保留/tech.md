# Technical Notes

## Current Approach
- iOS/macOS/Android 每个 Route 保存 params snapshot、Host、root View、size、failed/disposed 状态。
- push detach 当前 root 但保留 Host/Core；pop destroy 顶层并重新 attach 前一 root。replace 释放顶层，load 与容器销毁清空栈。
- Router handler 捕获所属 Route；getParams/current 读取自身条目，覆盖页面禁止发起导航。排除已移除条目，阻止异步请求完成后旧页面迟到导航。
- Web `BrowserPageStack` 以 BrowserRouter 条目 ID 作为 Map key，保留 detached root/Host，恢复时 resize；按栈移除销毁 Host。

## Key Constraints
- 原生 Core 对象各在各自 Host worker/thread 创建；全局 owner-thread 限制仍适用。
- 页面暂时覆盖时订阅和异步工作继续；页面最终销毁按现有 Cancel/cleanup 释放。
- Web 新推荐用 `BrowserPageStack`。裸 `BrowserHost` 仍由入口自行管理路由 handler。

## Dependencies and Patterns
- 复用现有 Router `RouteParams`、Service Host、`destroy` 和 renderer root attach/detach。

## Risks
- 页面实例都保留会增加内存；没有进程恢复或自动淘汰。
