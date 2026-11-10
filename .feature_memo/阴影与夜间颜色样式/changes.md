# 实施记录

## 2026-11-10

- 完成五组夜间颜色、span、占位文字和四端阴影；补充文档与入口。
- `npm run typecheck:framework` 通过；`npm run test:framework` 9 文件 60 用例通过。
- `npm run test:build` 7 用例通过。
- `npm run test:browser:styles` 实际 WebKit 通过，包含输入法状态、nativeProps 和媒体控制不重放。
- Android 离线构建 APK 和测试 APK 成功；API 35 ARM64 模拟器定向测试通过（阴影像素、深色颜色、输入保留）。
- iOS 26.4 iPhone 17 Pro 模拟器定向 XCTest 通过（颜色、阴影属性、span、占位文字、回退、输入与 frame 保留）。
- iOS 测试隔离工程在 `.verification/dm-ios-tests/`，使用已有 Core archive，跳过仅该隔离工程的 Core 重建；ARCHS 固定 arm64。测试主题 override 后需 updateTraitsIfNeeded。
- macOS 全源编译、样式定向回归及完整 RendererRegression 均通过（文本/图片、IME、输入、鼠标、滚动、动画和媒体）。修复 AppKit cornerRadius 自动开启裁剪的问题。
- 原生 Core framework/business AOT 编译成功；native counter 握手、布局、事件、ACK、模块及销毁探针通过。
- `npm run test:package` 通过；SDK 清单和打包断言包含 `docs/styles.md`。
- 最终 Android 定向测试与 iOS 定向 XCTest 在补齐显式裁剪、shadowPath 和主动 trait 刷新后再次通过。
- `git diff --check` 通过。
- 日志在 `.verification/dm-*`，不提交产物。

## 2026-11-10 — 模拟器演示

- 用户要求安装到 iOS 模拟器查看；新增 `examples/components/appearance-showcase.tsx` 并注册 `appearance` 页，演示蓝/紫阴影、夜间配色、富文本和占位文字。
- iOS 示例增加 `--page <name>` 启动参数和“外观”标题。
- 使用完整 `npm run build:ios` 构建 Core 与宿主，安装目标 iPhone 17 Pro / iOS 26.4。
- 安装并启动成功：bundle `org.anseronui.demo`，打开独立“外观”页；实际确认 Light/Dark 两种显示，最终保留 Dark。截图 `.verification/appearance-demo-{light,dark,comparison}.png`。
- 示例新增后 `npm run typecheck:framework` 与完整 `npm run build:ios` 通过。Xcode 27 的模拟器界面名称为 Device Hub（com.apple.dt.Devices），使用其右侧 Appearance 面板切换外观。

## 2026-11-10 — Android 模拟器演示

- 用户要求在 Android 模拟器试用；启动 `Medium_Phone_API_35` ARM64 / Android 15，完整 `npm run build:android` 编译 Core 和 APK 成功。
- 示例 MainActivity 在 onCreate 依据 uiMode 选择原生 Material 浅色/深色主题，页签增加“外观”，支持 Intent extra `page=appearance`。
- APK `org.anseronui.demo` 安装并启动成功，浅色与深色实际截图均确认背景/文字/边框/富文本/占位文字及蓝紫外阴影正常。
- 当前模拟器保持运行，停留“外观”深色页。截图 `.verification/appearance-android-{light,dark,comparison}.png`；构建日志 `.verification/appearance-android-build.log`。
- 深浅切换命令：`adb -s emulator-5554 shell cmd uimode night no` / `yes`。默认 Activity 会因 uiMode 重建，输入保留边界遵循文档已有说明。
