# macOS AppKit 渲染器

使用共享 TSX 与 scriptc AOT Core，通过 Swift/AppKit 创建原生 macOS 视图。当前应用构建支持 Apple Silicon arm64，构建机器需要 macOS 15+、完整 Xcode、Node.js 24+ 和已准备好的框架编译器。产物声明最低 macOS 14；目前实际运行验证环境为 macOS 27.2 / Xcode 27.2，尚未验证 macOS 14 或 Intel。

## 构建和运行

框架仓库根目录：

```sh
npm run build:macos
open .verification/macos/App.app
npm run test:macos
```

示例菜单 Navigate 可选择页面及返回。首次使用先执行现有 `npm run prepare:compiler`。构建使用 Xcode Clang/Swift 编译器生成标准 `.app`，并进行本机 ad-hoc 签名；不依赖 Xcode 工程生成器。Core 目标为 `macos-arm64`，输出到 `.verification/core-macos-arm64/`，不与本机探针或移动端产物混用。

新建独立应用会包含 `platforms/macos/App.swift`：

```sh
npm run setup
npm run build:macos
npm run macos
npm run macos -- --no-build
npm run macos -- --dry-run
```

`run macos` 在当前 Mac 启动应用，不接受 `--device` / `--avd`。`--no-build` 校验应用身份、可执行文件 hash、Core manifest，以及共享页面/宿主/插件源码；输入变化需要重新构建。旧应用升级 SDK 后，可从新建应用复制 `platforms/macos/App.swift`，再增加对应 npm scripts：`anseronui build macos` / `anseronui run macos`。

`App.app` 位于应用的 `.verification/macos/`。`assets` 复制进应用 Resources/assets，支持现有 `asset://filename`。构建签名只用于本地开发；正式发布所需 Developer ID、公证、沙箱权限或 Mac App Store 流程由应用维护。

## 嵌入现有 AppKit 工程

通过本目录 Swift Package 或源码 target 引入 Renderer，同时编译 `packages/core/native/transport.c`，包含其 headers，并链接对应 macOS Core 的 `entry.lib.a`。仅添加 Swift Package 不会编译或链接业务 Core。

```swift
import AnseronUIRenderMacOS

let pageView = AnseronUIRenderView(
    frame: contentView.bounds,
    createCore: { try NativeCore(bundleBuildId: "your-build-id") }
)
pageView.autoresizingMask = [.width, .height]
contentView.addSubview(pageView)
pageView.onFailure = { error in NSLog("AnseronUI: %@", String(describing: error)) }
pageView.load(page: "home")
// 所有者结束使用时调用；从父视图暂时移除不会自动销毁。
pageView.destroy()
```

容器在非零尺寸后启动 Core，支持窗口缩放、页面 load/push/replace/pop、返回消费和幂等 destroy。页面切换重建实例，旧请求不会写入新页面。UI 操作在 MainActor，Core 创建、驱动与关闭在固定 OS worker，平台回调只排队消息。

## 能力与当前边界

已实现 View、Text、Button、单行 TextInput（含 secureTextEntry）、ScrollView、Image、RichText、Video、原生组件与 Module 的 AppKit 映射；支持布局/点击/输入/焦点/提交/滚动/长按、鼠标拖动映射 touch 协议，以及宿主侧过渡/ref 动画。逻辑坐标使用 point 和左上原点，自定义容器采用 flipped 坐标。

真实 AOT 集成测试覆盖计数器、表单输入、路由、窗口尺寸、Promise/计时器取消、平台 Module、原生组件/ref、滚动内容与销毁。AppKit 回归还覆盖 RichText 点击命中、混合字号排版、文本省略、IME 组合输入、输入焦点、图片 contain/cover/占位、鼠标拖动取消、滚动销毁、动画变换/取消/卸载、视频首帧/进度/结束和无效媒体错误；仍需在目标发布系统上补做无障碍审查和兼容性验收。

当前限制：单窗口、arm64；TextInput 只提供单行编辑，移动端 keyboardType/returnKeyType 等提示不做一一对应；图片和原生控件外观与移动端可能不同；鼠标拖动支持 touchAction 的 auto/none/pan-x/pan-y 方向仲裁，完整多指触摸尚未对齐。动画使用主 RunLoop 的 60 Hz Timer 驱动，不承诺显示刷新率同步；完整无障碍语义和 macOS 14/Intel 仍需目标环境验收。

鼠标拖动超过 5 point 后锁定方向；`pan-y` 的纵拖交给最近启用的 ScrollView，发送一次 `touchCancel`，横拖继续派发触摸事件。`none` 完全交给业务处理；策略在按下时与祖先相交并固定，不受 `stopPropagation()` 影响。原生按钮、输入框和播放器保留自身鼠标交互。视频时间和时长回调统一使用毫秒。Core 更新中位置未变的 `MoveChild` 保留原生视图，避免播放进度更新取消按钮点击。

## npm 插件

macOS 插件使用 `anseronui.schemaVersion: 2`，显式声明 `macos.sources`、`factory`、可选 `frameworks` 与 `infoPlist` 使用描述。Swift 工厂提供 `@MainActor static func createExtensions() -> MacOSPlatformExtensions`，原生组件遵循 `MacOSNativeComponent`，使用 NSView。现有 schema 1 插件仍可用于原三端；缺少 macOS 声明会在 macOS 编译前报错，不自动复用 UIKit 工厂。

参考 `examples/native-plugin/macos/DevicePlugin.swift`。插件源码和注册表编译进宿主 target；工厂不需要 import Renderer 模块。注册模块不可覆盖 http/timer/router/__view，重复模块和组件名会报错。
