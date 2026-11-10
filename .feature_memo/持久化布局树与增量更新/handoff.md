# 接续

从 index.md 开始。持久化布局树已实现，ABI 为 2；TSX 与宿主 Commit/ACK 语义保留。

先看 packages/core/src/kernel.ts、contracts.ts，再看 business-runtime.ts 的 disposeSurface 与两个 adapter 的 dispose。

注意：当前增量发生于 LayoutKernel 内，Business 仍传完整树、previous 和测量缓存。没有减少 diff 中的无效 MoveChild，也没有增量 wire 协议或并发调度。

Wasm 批量释放曾在数组 indexOf/splice 所有权登记失败；最终用 Set 规避，engine-probe 增加 256 节点共享回归。不要直接撤回 Set 变更。

实现与验证完成：58 个框架测试、7 个构建测试、300 组旧内核布局差分、test:layout:wasm、Native/Wasm 各 5 页面探针、4 owner threads 共 200 次生命周期循环均通过。平台 UI 设备未测，性能提升比例未量化。

2026-11-10：已按用户要求构建并安装 iPhone 17 Pro / iOS 26.4 模拟器。Counter 启动截图出现内容挤成竖排，存在可见布局问题，需后续定位；截图与构建日志见 changes.md。

侧滑修复已完成并安装：AnseronUIRenderView.layoutSubviews 用 bounds/center 保留 transform；ended 不再同步 BackPress，动画与异步结果协调完成 pop，拦截则动画回退。3 个 iOS 定向回归及真实短拖取消/长拖返回 UI 测试通过。
