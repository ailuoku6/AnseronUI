# Protocols and Contracts

- 协议 minor 5；新增 SurfaceVisibility、InspectRuntime 和 RuntimeStats，CreateSurface 支持 visible。主版本仍为 1。
- 内部 Core ABI 2 可选 profile/timings 扩展；独立 framework/business 发布时应一起重新构建验证。
- VirtualList<T>: data/keyExtractor/renderItem，estimatedItemHeight、overscan、layoutVersion；ref 暴露 scrollToIndex/scrollToOffset。
- usePageVisibility/usePageEffect 和 services.page 提供页面可见性。
- maxRetainedPages 包括当前页，默认无限；trimMemory 仅回收隐藏实例。路由参数保留，Hook 状态重新初始化。
- 缓存正常提交后最多 1024；布局期间保留本轮必要测量，防止反复失效。

## 最终诊断契约（2026-11-13）

- RuntimeStats 为数字字典；live counts 随时可用，时长/流量默认关闭，可用 InspectRuntime enabled/reset 切换。
- pendingRenders 是当前未完成渲染的页面数量；隐藏采样需等 hiddenSurfaces==1 且 pendingRenders==0。
- coreRequestUnits 是 UTF-16 单元数；宿主 bridgeInputBytes/bridgeOutputBytes、inputBytes/outputBytes 才是 UTF-8 字节数。
- performance.enabled 为生成 AOT 入口的可选配置；内部 ABI 仍2，profile/timings 可选，需重编匹配 Framework/Business。
- budget 场景限制：节点200、测量缓存1024、消息1MiB；相对时延同机器同模式不超过基线1.3倍+2ms。

## 滚动事件更新语义（2026-11-13复查）

- 连续排队scroll事件按nodeId保留最新位置；离散事件作为合并边界，因此onScroll不保证收到每个中间偏移。
- scroll/scrollEnd对于仍存在的节点，允许revision小于当前已提交版本，避免跨线程提交超越事件后丢失最终偏移。未来版本、隐藏页面、已移除节点继续忽略；其他离散事件的版本规则不变。

## 2026-11-13 猛烈甩动优化

新增可选 RenderProps.scrollAnchorOffset：有限有符号累计布局补偿，四端随行位置应用差值。NativeEvent/ScrollEvent.scrollAdjustment：可选有限有符号累计已应用补偿，Android 上报实际像素补偿换算的布局单位；速度使用 y - scrollAdjustment，避免回滑方向误判。旧宿主缺省时 UI 使用自身累计补偿估算。协议仍为未发布的minor5，原生产物需重编。

- 最终补充：原生惯性边界保护与控件复用不增加协议字段；scrollAdjustment仅统计布局补偿，不包含惯性保护未消耗的距离（后者本来就没有实际滚动）。
