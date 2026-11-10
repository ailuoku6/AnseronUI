# 技术方案摘要

完整方案：`internal/design/macos-harmony-support.md`。

- macOS 改用 Swift + AppKit，新增 `packages/render-macos`。共享 TSX/Core/布局/协议复用，UIKit 视图层需新实现；iOS 的 Foundation 服务、worker 和 C binding 可参考或抽取复用。
- 鸿蒙推荐 ArkTS Stage 外壳、C++ Host、ArkUI Native Node，经 NodeContent/ContentSlot 挂载。
- 共享业务仍 scriptc AOT；不把 TSX 转成 ArkTS，不宣称整个鸿蒙应用不使用 Ark 运行环境。
- scriptc 已有 macOS arm64/x64 后端。macOS 使用匹配的 Darwin runtime 和 archive，补显式构建身份及应用打包；鸿蒙新增 target、SDK driver 和 runtime 适配。当前 macOS triple 部署为 14，编译宿主检查要求 macOS 15+，P0 分别验证并记录。
- 固定 OS worker 驱动 Core，UI 主线程操作节点；禁止普通线程池迁移 Core，禁止异步回调直接重入。
- Core 计算 frame，鸿蒙宿主需避免 ArkUI 二次 Flex 重排，并以真实平台引擎测量文本。
- 编译缓存增加 target、ABI、SDK、部署/API 版本、工具链和 runtime/补丁身份。
- 阶段：P0 工具链/runtime → P1 最小应用 → P2 能力对齐 → P3 独立 npm 工程与交付。

- AppKit 专项：flipped 容器与 documentView、point/像素转换、TextKit 测量、field editor/marked text、first responder、宿主侧动画。Core 管理节点 frame，Auto Layout 只用于外部容器约束。

## 首期实现状态（2026-11-09）

- `scripts/macos-app.mjs` 直接调用 Xcode 工具编译 Renderer/transport/Core，创建 `.app` 并 ad-hoc 签名；独立应用的 `run macos --no-build` 校验产物与输入身份。
- 新 App 包含 `platforms/macos/App.swift`；旧 App 升级需复制模板。Core、Swift 宿主和插件都纳入构建输入校验。
- Renderer 已实现基础节点、图片/视频映射、鼠标事件和宿主动画；IME/媒体/RichText 命中/拖动/动画/无障碍/旧系统仍需专项设备验证。
- 原生/Core 集成覆盖业务交互、async、timer 取消、路由、resize、扩展及销毁；鸿蒙未实施。

## 缺陷修复后的关键约束

- 文本测量/绘制/命中共用 DesktopTextLayout，禁止 NSTextFieldCell 再次调整内边距。
- 动画通过 NSView frame/bounds/rotation 驱动，保留 Core 布局声明值，命中与显示使用同一坐标系。
- 视频仅在播放指令或源改变时执行 play/pause/stop，普通重渲染不得覆盖系统控制条状态。
- 鼠标坐标相对初始命中目标；NSView.hitTest 输入为父视图坐标；失焦/卸载发送取消。

## 视频与拖动修复（2026-11-09）

- playTimeDidChanged 的 x/duration 均为毫秒，与 Web 和 TSX onTimeUpdate 一致。
- Core 对保留节点每次都发 MoveChild；AppKit 必须跳过父容器与位置均未变的移动，否则进度更新会打断 NSButton 按下/松开跟踪。识别器仅为绑定的 tap/spanClick/longPress 安装。
- 鼠标拖动 5 point 后锁定方向，与命中路径到最近启用 ScrollView 的 touchAction 策略相交；滚动接管时只发一次 touchCancel，之后不发 move/up。横拖/none 保留业务事件，原生按钮/输入/Video 不被自定义滚动接管。
