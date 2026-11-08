# API

- AnseronUIRenderView：iOS init(frame:baseURL:createCore:)；Android constructor(context, attrs, defStyleAttr, baseUrl, createCore)。默认使用 NativeCore，支持注入 transport。
- load(page)：创建全新实例，替换当前页面，支持布局前调用。
- destroy()：终止容器，幂等，之后不允许 load。
- onReady / onDiagnostic / onFailure；page / isDestroyed 只读状态。
- onReady 沿用 Host 握手 Ready 语义，不表示首帧已经完成。
- 没有改动消息协议或共享 Core。

- 失败后不自动重试，调用 load 创建新实例；destroy 仍为终止操作。
- requiredNodes 采用基础节点集，允许 Ready 返回超集。
