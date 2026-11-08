# Changes

## 2026-11-08

- Changed: 完成统一 Router API、三端容器页面栈、Web demo 路由处理器和 Counter/Async Form 跳转示例。
- Changed: 调整原生路由处理顺序，先完成旧 Core 的 router module 请求，再销毁旧 surface 并切换页面。
- Verification: `typecheck:framework`、`test:framework`（35 tests）、`test:build`、Native Core、iOS/Android/Web 构建通过；Android 模拟器已实测 push/back。
- Known issues: 当前不传递路由参数，切页会销毁并重新创建页面。
- Next: 后续可增加路由参数、深链和页面缓存协议。
