# Decisions

- **2026-11-08：页面清单由配置驱动。** 原生宿主读取构建生成的 manifest 动态加载页面，业务增加 TSX 页面时不需要修改原生 Activity/ViewController。
- **2026-11-08：返回键采用同步布尔回调。** 参考 Kuikly 的消费语义；系统返回的默认行为必须在同一调用栈决定，因此不接受 Promise 回调。
- **2026-11-08：返回键分发由 Core 统一完成。** 按渲染树后序遍历，内层优先；平台只负责同步请求 Core，再按结果执行路由 pop 或系统默认。
- **2026-11-08：iOS 保留宿主主动接入边界。** iOS 没有统一物理返回键，框架提供 `handleBackPress()`，由 UINavigationController/宿主按钮或手势调用。
