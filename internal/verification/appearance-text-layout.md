# 主题图片、文本行高与布局事件验证

日期：2026-11-14。范围：彻底移除旧协议 Button，确认页面主题感知和 onLayout，补齐 Image.dmSrc 与 Text/RichText 的 lineHeight。

## 实现结果

- 公开 TSX `Button` 保留为共享 View/Text 组合组件。协议 NodeKind、测量类型、Core Ready、各端 Handshake、创建/测量/属性分支及系统 Button 池均已删除旧 Button 节点。协议测试明确拒绝旧节点、旧测量请求和 title 渲染属性。
- `useServices().appearance.get()` / `.subscribe()` 原本已存在，五端提供 `light` / `dark`。示例同时读取初始值与监听变化，防止晚到的初始读取覆盖较新的订阅值，并在卸载时取消订阅。
- 新增 `Image.dmSrc`。浅色选择 src，深色选择 dmSrc，缺省回退 src。主题切换直接更新原生图片，不重放视频、输入或原生扩展命令。加载事件报告实际源。iOS 使用加载代次防止旧异步请求覆盖当前图片；Android 防止晚到的占位图覆盖已加载主图。
- 新增 `style.lineHeight`，支持 Text、RichText 及组合 Button 的标题。Web 使用相同行高测量/显示；iOS/macOS 使用段落最小/最大行高；Android 使用行高 span；Harmony 使用 MeasureOptions.lineHeight 与 NODE_TEXT_LINE_HEIGHT。Core 测量缓存键包含行高，修改时重新测量，移除后恢复自然行高。
- `onLayout` 原本已存在于所有元素的 CommonProps。Core 在渲染提交确认后派发首次或变化的 frame，未变化时不重复派发。x/y 相对父元素，单位为逻辑布局单位；不包含滚动、transform 或动画插值。
- macOS 窄屏虚拟列表暴露原来的三轮文本测量上限不足。现允许最多八轮，仍保留超限诊断与完整旧帧回退；完整列表回归通过。
- Harmony 文本内在宽度向外取整并保留一个布局单位的舍入余量，避免小数宽度传入原生节点后导致短标签末词意外换行；仍受调用方最大宽度约束。最终设备验收与系统主题往返均使用此修复后的构建。

文档和可复制示例见 `docs/guides/ui/styles.md`，组件表见 `docs/reference/components.md`。外观示例页显示当前主题、图片加载事件中的实际源及 `onLayout: 0,0 90×45`。

## 验证结果

| 检查 | 结果与范围 |
| --- | --- |
| 共享框架 | 15 个测试文件、83 项全部通过，包含旧 Button 协议拒绝、dmSrc 传递、lineHeight 重新测量、onLayout 首次/变化/不重复回调。 |
| TypeScript | `npm run typecheck:framework` 通过。 |
| 构建脚本 | `npm run test:build`，7 项全部通过。 |
| Harmony 单元测试 | `npm run test:harmony`，46 项全部通过，含内在/受约束文字测量的 lineHeight 传递。 |
| 真实 WebKit | `node scripts/test-web-extensions.mjs styles` 通过。验证图片主题切换/回退、行高渲染/测量/移除重置，以及主题更新不重放其他服务命令。 |
| Android | Android 15 / API35 arm64 模拟器，4 项 instrumentation 测试全部通过。验证两行字号16/行高30测量高度60、真实异步图片 light→dark→light、按钮按压/禁用、事件解绑/重绑、文本池复用状态重置。 |
| iOS | iPhone17Pro / iOS26.4 arm64 模拟器，最终5项测试全部通过（3项原生、2项UI）。验证图片往返与回退、两行行高30测量高度60、段落行高/重置、组合按钮激活不误提交输入、实际示例的主题与布局输出。 |
| macOS | 完整 AOT Core/AppKit 集成与渲染回归通过，覆盖路由、异步/计时器、原生扩展、滚动、可变行高列表、保活/可见性与销毁；新增主题图片往返及行高测量/显示测试通过。 |
| HarmonyOS | HarmonyOS6.0.1 / API21，Mate70Pro aarch64 模拟器，最终6组设备验收全部通过。验证主题订阅、dmSrc 实际加载、lineHeight 对原生 frame 的影响、onLayout，回归组合按钮、阴影标签居中、原生扩展和5000行虚拟列表（挂载7行）。 |
| 系统主题往返 | Android 使用系统 uimode、iOS 使用模拟器 appearance、Harmony 使用系统控制中心深色模式开关，均确认 dark 与深色图片源；三端最终已恢复浅色，示例显示 light 和浅色图片。 |

测试范围为模拟器、桌面 AppKit 和 WebKit，不等同于真机或所有系统字体设置的验证。

四个原生 Core 构建的源码指纹一致：

```text
a626f56dc187348b8578f994d36d19db17522ed835095b28af7688a3a0c416e3
```

## 复现

在仓库根构建三端，macOS 测试入口会构建自身 Core：

```sh
node scripts/anseronui.mjs build ios
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' node scripts/anseronui.mjs build android
node scripts/anseronui.mjs build harmony
node scripts/test-macos.mjs
```

Android 在 `examples/native/android` 运行：

```sh
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ./gradlew :app:connectedDebugAndroidTest \
  '-Pandroid.testInstrumentationRunnerArguments.class=org.anseronui.demo.SharedCoreTest#testSharedPrimitiveButtons,org.anseronui.demo.RenderViewTest#textLineHeightAndDarkImageSource,org.anseronui.demo.RenderViewTest#primitiveButtonBindsAndUnbindsClicksWithoutMakingLabelClickable,org.anseronui.demo.RenderViewTest#recycledTextResetsVisualStateAndEventIdentity'
```

iOS 在仓库根运行；重复运行时更换 resultBundlePath：

```sh
xcodebuild -project examples/native/ios/AnseronUIDemo.xcodeproj \
  -scheme AnseronUIDemo -configuration Debug \
  -destination 'platform=iOS Simulator,id=53172492-D6E5-42C4-8530-1C5BE594193D' \
  -derivedDataPath .verification/ios-app \
  -resultBundlePath .verification/ui-capabilities-ios-final.xcresult \
  -only-testing:RenderViewTests/RenderViewTests/testTextLineHeightAndDarkImageSource \
  -only-testing:RenderViewTests/RenderViewTests/testButtonDoesNotPublishAnUntouchedControlledInputWithZeroRevision \
  -only-testing:RenderViewTests/RenderViewTests/testTextMeasurementRoundsOutwardBeforeLayout \
  -only-testing:SharedCoreUITests/SharedCoreUITests/testSharedPrimitiveButtons \
  -only-testing:SharedCoreUITests/SharedCoreUITests/testAppearanceSourceAndLayout \
  CODE_SIGN_IDENTITY=- ARCHS=arm64 test
```

Harmony 运行：

```sh
node scripts/anseronui.mjs run harmony --no-build --device 127.0.0.1:5557
node scripts/test-harmony-demo.mjs 127.0.0.1:5557
```

## 本地证据

- `.verification/ui-capabilities/results.json`：机器可读结果与源码指纹。
- `.verification/ui-capabilities/three-light.png`、`three-dark.png`：三端截图汇总，从左到右为 Android、iOS、HarmonyOS。
- 同目录各端独立截图、Android系统主题往返UI XML、Harmony浅色恢复UI JSON。
- `.verification/ui-capabilities-ios-final.xcresult`：iOS测试结果；附件导出至 `.verification/ui-capabilities-ios-attachments/`。
- `examples/native/android/app/build/outputs/androidTest-results/connected/debug/`：Android JUnit结果。
- `.verification/harmony/acceptance/main-results.json`：最终浅色模式下的六组设备验收结果及截图；同一构建另完成系统浅色→深色→浅色往返，主题、实际图片源及 90×45 布局均通过。
- `/private/tmp/ui-capabilities-*.log`：构建及测试日志。

上述构建目录被 git 忽略，后续运行可能覆盖；本报告保留本次结论、源码指纹和复现命令。三端最终示例应用均已安装，并停留在外观页。
