# 实现与验收

用户已授权完整实施，源码修改保留在当前工作区，未提交。

A–G 对应实现已接通：owner/Context 定向调度、持久 region/node 与逐记录 ACK；Program/TypeChecker 模板、动态字段及结构槽、保守回退；ABI 3 事务/分片/测量/abort/finalize；跨 round frame collector；宿主 2.0 五端字段与拓扑、批次/重放/reset；watchdog；恢复 effect/ref；DevTools；构建指纹与 SDK。

安全计算采用完整组件求值、静态宿主常量提升和输出槽比较。可选的通用依赖 DAG 缓存不对外提供，不宣称任意表达式自动局部重算。

- 框架 129 tests / 24 files 通过，含 100/1000/10000 分支和多轮 frame 回归。
- typecheck、build 7、tooling 31（2 skip）、Harmony 57、DevTools 9、SDK packaging 1 通过。
- Native/Wasm Core 各 5 页面 AOT 通过。
- iOS iPhone 17 Pro / iOS 26.4 模拟器：28 Renderer + 14 UI 全过。
- Android VOG-AL10 / Android 10：完整设备集通过，硬件模糊要求 API 31，跳过；字段补丁、媒体像素、输入及播放状态通过。
- macOS AOT/AppKit 集成通过；WebKit reference 与真实 Wasm 验证见独立报告。
- Flexily 最终重跑 2648 通过、1 skip、0 失败；native/Wasm 布局差分各 3 组通过。
- Harmony API 21 Core/C++/ArkTS 与 unsigned HAP 构建通过，hdc 无设备，真实渲染验收仍缺设备。
- AOT 性能脚本分开验 owner 调度和 1001 静态节点模板复用，报告环境/样本/输出字节。合成 Renderer 不等于真实 UI 延迟；不宣称 RSS/FPS 或恒定墙钟耗时。
- WebKit Reference 六组及真实 Wasm 三组通过；DevTools Wasm AOT 的快照、编辑和截图成功/失败通过。默认 Native/Wasm 业务构建已恢复，五页面复跑通过；设备临时供电/端口和 HTTP fixture 已清理。

精确结果与重跑入口见 `internal/verification/fine-grained-reactivity-2026-11-23.md`。
