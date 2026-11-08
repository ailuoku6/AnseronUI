# 技术方案

- 容器组合现有 IOSHost / AndroidHost，无协议改动。
- 每次加载独立私有 renderRoot，旧 Host 异步清理只作用于旧根。
- generation 屏蔽旧页面回调。首次宽高均大于零才启动，之后允许零尺寸 resize。
- 临时移除 / 重新挂载保留实例；宿主结束使用时显式 destroy。iOS Host deinit 另有停止线程兜底。
- 所有容器操作在 UI 线程；Android 使用 dp，iOS 使用 point。

- onFailure 后暂停尺寸转发；再次 load 可恢复。Android Host.resize 对已关闭状态忽略更新，避免失败通知与 UI 布局竞争。
- Android 握手只要求基础五类节点，与 iOS 保持一致；可选 Image/Video 渲染能力不成为基础页面启动的前置条件。
