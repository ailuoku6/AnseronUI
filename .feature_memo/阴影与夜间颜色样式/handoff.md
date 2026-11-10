# 接续

从 `index.md` 开始。此需求已完成：五种 dm 颜色覆盖、RichText span、TextInput 占位文字、四端阴影、系统外观自动刷新和文档。

验证：类型检查、60 框架测试、7 构建测试、实际 WebKit、API 35 Android 阴影像素测试、iOS 26.4 XCTest、AppKit 完整 RendererRegression、原生 framework/business AOT 编译、native Core counter 探针及 npm 打包测试均通过。日志在 `.verification/dm-*`。

关键决策：保留原始 props 并在宿主选择主题；主题刷新不重放输入值、媒体或 nativeProps；阴影使用统一颜色/透明度/半径/偏移；明确 overflow 裁剪。AppKit cornerRadius 会开启 clipping，需要 paint 前后保存恢复；iOS trait 传播需延后父回调刷新，并在 iOS 18+ 主动 updateTraitsIfNeeded。

公开文档 `docs/styles.md`；更新 SDK 后 setup 并重建 Core/宿主。SDK 已携带文档。

注意保留工作区已有图标、持久布局和 iOS 返回手势改动，不能重置混合文件。本轮没有提交 commit。

已按用户要求安装并打开 iPhone 17 Pro / iOS 26.4 模拟器，当前为独立“外观”页与 Dark 外观。浅色/深色实际截图在 `.verification/appearance-demo-*`。新增示例与 iOS 构建、类型检查均通过。

Android 演示同样已安装验证：Medium_Phone_API_35 / Android 15 / emulator-5554 保持运行，当前外观页深色。`npm run build:android` 通过；浅色/深色实际截图 `.verification/appearance-android-*`。MainActivity 增加动态 Material 主题和 page Intent extra。
