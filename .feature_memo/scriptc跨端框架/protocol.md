# 协议提案摘要

以下均是方案提案，未冻结为实现契约；详见 `internal/design/anseronui-framework.md` 第 7–10 节。

- 同步 ABI 保持，内部 Promise 由拟新增 context/post/step/deadline/dispose 推进，Promise/resolver 不跨 ABI。
- 共享导出：`dispatch(Uint8Array): Uint8Array`；真实 C ABI 由 library profile 封送规则生成。
- P0 使用 UTF-8 JSON bytes + 具体类型 codec；性能实测后决定是否二进制化。
- Envelope：协议 major/minor、bundle identity、runtime epoch、surface ID/generation、sequence/ack；暂不定义 update identity。
- 输入：create/destroy/show/hide/resize、UI event、module result、measure result、commit ACK。
- 输出：视图 create/insert/move/remove、props/frame/events/accessibility、measure request、platform effect、diagnostic。
- UI 与 effect 分别确认；effect request ID 去重，不承诺进程崩溃后的业务恰好一次。
- 文本测量缓存 miss 经宿主批量测量后回送新事件，布局不跨线程同步阻塞。
- runtime init 仅启动时调用；CreateSurface 不调用 init。结果复制后才能 reset/collect/下一次失效导出。
- callback 中禁止进入库，异步结果回固定线程队列；晚到结果按 generation/epoch 丢弃。
- Runtime epoch 标识运行时生命周期；销毁后到达的输入/请求结果/回调丢弃。未来替换流程未定义。
- 预留 RuntimeAdapter 创建时传入不透明 artifact/source 描述并协商能力；格式、信任校验、版本兼容与获取方式均待后续设计。
- 候选实例完成布局/测量前不执行可变更外部状态的 effect；切换 bundle 所有根视图，退休旧实例与 callbacks/timers。

## v3 组件与生命周期

- 业务编写函数组件/TSX/Hooks；描述树、Hook frame 与事件闭包只存在 Core，不跨桥传函数/React Element。
- 原生输入携带事件注册 ID、surface generation 与 committed revision；队列在提交 ACK 后发布对应事件表，旧 revision 不误投新组件。
- Hook setter 状态更新队列按 watermark 在提交后确认，测量重入不重复消费 updater。单 surface 首版一个待 ACK 提交。
- Effect setup 在成功提交 ACK 后 owner 线程执行；依赖变化/卸载同步 cleanup。

## 2026-11-07 布局引擎合同

- 当前入口为 `@anseronui/layout`，一个 LayoutEngine 管理一个 surface 的所有 Node；默认 CSS preset，节点不可跨 engine 混用。
- `calculateLayout(root,width,height,direction)` 同步计算；`releaseSubtree` 解除回调并释放所有权；`dispose` 幂等清理离树节点和全部 measure/baseline/CQ 回调。
- 文本 measure 仍是同步数值函数；平台异步测量结果需经框架缓存供其读取，本次未实现异步请求协议。不能在宿主回调中重入同一个 scriptc 实例。
- 当前 Flexily 内部按整数逻辑网格取整；设备像素比例/连续坐标政策尚未实现。此处是布局算法的现状，不应延用旧文“只在渲染边界取整”的已完成语气。

## 2026-11-07 已实现的 P0 协议子集

- `packages/protocol/src/index.ts` 定义 `Envelope`、u32 身份、UTF-8 JSON 编解码与所有当前输入/输出 payload 的字段检查；当前版本 major=1/minor=0，最大消息 1 MiB、单提交 4096 命令。
- `MeasureRequest` 现在携带 `kind`（Text/Button/TextInput），宿主按对应控件测量；`MeasureResult` 回送 width/height/baseline。Core 通过 node、kind、文本、字体和宽度缓存，最多 8 次迭代。
- Core 支持 Handshake/CreateSurface/Resize/DestroySurface、Tap/InputChange、MeasureResult、CommitAck/Failed、ModuleResult；输出 Ready/Commit/MeasureRequest/InvokeModule/CancelRequest/SurfaceDisposed/Diagnostic。方案其余消息族尚未实现。
- Android/iOS renderer 只接 `Commit` payload；完整 envelope 顺序/epoch 核验及宿主 ACK 由未来原生 adapter 承担。
