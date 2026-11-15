# Technical Notes

- UI 的 VirtualList 用按稳定 key 缓存的行高和 Fenwick 前缀和；查询与测量 O(log n)，数据重置 O(n)。实际行高通过 CommitAck 后 onLayout 回传。
- 宽度或 layoutVersion 变化使旧测量失效；代际 token 拒绝迟到布局；提交后修正滚动锚点。
- Core 隐藏时暂停新渲染、丢弃 UI 事件；全局框架计时器保存剩余时间并用新 requestId 恢复。
- usePageEffect 清理/恢复订阅；普通 useEffect 维持挂载语义。
- 各端保留路由项，回收隐藏宿主；被回收页面返回时重新挂载。没有 Hook 状态序列化。
- 性能统计默认关闭；Core 分阶段计时，宿主测量和应用提交单独统计。合成测量的吞吐基准不代表真实设备帧率。

## 最终实现补充（2026-11-13）

- 列表允许实际零高度，generation 拒绝旧 onLayout；估计值和像素 overscan 控制挂载范围。
- 视口默认 height:0/flexBasis:0/flexGrow:1/minHeight:0，避免窄屏重排被内容总高撑开。
- 隐藏之前已开始的事务会完成；pendingRenders 供宿主等候稳定快照。
- 平台宿主统计包括 bridge 编解码、adapter post/step、UI 排队、真实文本测量和视图提交；Wasm 可读取线性内存容量。
- WebHost 错误/销毁会拒绝未完成检查，容器 transition 失败也继续释放所有宿主；视频移除时释放 source。

## 滚动背压与裁剪

- 连续scroll更新按nodeId合并为最新，保留离散事件顺序；存活节点迟到已提交revision可更新当前视口。
- Android显式裁剪ScrollView的dispatchDraw到scrollX/scrollY对应的viewport，防overscan覆盖外部控件。
- 快速滚动测试检查屏幕上的连续行覆盖和最终offset，而非仅检查树内节点存在。

## 2026-11-13 猛烈甩动优化

VirtualList 双向预热约两屏，按速度/提交延迟偏向滚动方向，目标上限32行（可见行优先），guard 内保持窗口；父组件计时与测量也不得裁剪仍有余量的窗口。Android 自有 OverScroller 平移惯性坐标，按提交时真实可见行补偿；宿主编码前合并scroll、测量按轮批量、128KiB文本LRU；复用已解析Commit，节点查找使用IdentityHashMap，不变动画/内容尺寸不重复paint/layout。

- 最终补充：最终加入原生惯性边界保护：余量不足两屏时平滑减小位移，并把未消耗距离扣出scroller原点，不累积后跳；仅启用锚点的VirtualList生效。Text/Button离屏池64/32，重绑前清旧状态与事件，Renderer销毁清空。
