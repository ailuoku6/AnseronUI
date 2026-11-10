# Decisions

- 2026-11-10：按用户要求，同时完成 JSON 路由参数和 A→B→A 页面实例保留。
- push/pop 都保持页面 Core 与 renderer 实例：恢复 Hook state、输入值、滚动和 native component 实例。
- replace/pop 销毁被移除路由；load 为根导航清空整栈；宿主 destroy 清理全部 Host。
- 路由 handler 绑定 entry identity，避免隐藏页参数读取到栈顶数据或异步响应后改变错误的栈顶。
- Web 增加 BrowserPageStack 作为推荐应用级入口；BrowserHost API 保持兼容。
