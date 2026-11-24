# 接续

用户要求完整实现，现有业务 TSX/Hooks 不变。实现合同是 `internal/design/fine-grained-reactivity.md`，实测证据是 `internal/verification/fine-grained-reactivity-2026-11-23.md`，源码尚未提交。

当前为 ABI 3 / 宿主协议 2.0；不要混用旧 Framework/Business/Renderer。不要沿用历史 signal/computed/MVCC 方案。

实现采用 owner 调度、静态宿主模板、动态/结构槽、持久图、增量事务、准确布局候选、字段补丁及恢复。安全回退完整执行组件；通用纯计算 DAG 属于可选优化，不是任意 TS 的既成能力。

Harmony API 21 HAP 已构建，但 hdc 无连接设备。设备可用后需执行 `npm run test:harmony:device` 与 `test:harmony:demo`，核验字段默认值、输入/IME、媒体、无障碍、原生扩展及 reset。不要把构建通过当成真机验收。

构建期间不要修改 Core/UI/compiler/protocol/DevTools 指纹输入，否则 build-core 会拒绝产物。性能 fixture 使用独立业务配置；最终应恢复默认 native/Wasm 构建。Flexily 修改前读局部 AGENTS。详见验证记录中的命令和剩余边界。


## 2026-11-24 渲染器实机跟进

- macOS standalone `backgroundBlurRadius` 与 iOS 一样采用系统视觉效果视图和实时窗口合成。半径选择半透明材质档位，前景独立置于其上，圆角只裁切模糊层。不要恢复 Core Image 背景采样。
- Android TouchScrollView fling 在已挂载预渲染窗口内保持原生 OverScroller 行程，仅在窗口真正耗尽处裁切过量位移。VOG-AL10 / Android 10 实机的双向六轮快滑及速度、边界、锚点、触摸、停手和裁剪回归通过。APK 已重新安装并停留在 virtual-list 页面。
- macOS 实现见 `packages/render-macos/Sources/AnseronUIRenderMacOS/BackgroundBlur.swift`；Android 实现在 `packages/render-android/src/main/java/org/anseronui/render/AndroidRenderer.kt`。本段改动未提交。
