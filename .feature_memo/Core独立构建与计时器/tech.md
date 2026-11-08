# 技术方案

Framework Core：纯数据布局、文本测量规划、渲染差分；无业务页面导入。
Business Bundle：组件求值、Hooks、闭包、事件、服务与页面生命周期；携带业务 SDK。
跨边界只传带 ABI 版本的 JSON，不共享对象或指针；宿主顺序调用两侧，避免重入。
原生库使用 scriptc localize_runtime + instance_per_thread，隔离运行时符号与状态；Web 使用两个独立 Wasm memory。
构建分别计算框架与业务指纹，保留旧外部 transport 接口作为组合适配器。

验证覆盖 ReferenceRuntime、本机 C facade、独立 Wasm 和真实 Framework 缓存复用。Framework target/Business target 分目录存放 archive；Web 部署文件名为 framework.wasm/core.wasm。
