# 共享 Button 三端验证

验证日期：2026-11-14。范围：将公开 TSX `Button` 改为 AnseronUI 基础元素组合，并在 Android、iOS、HarmonyOS 三个模拟器实际安装运行。

## 实现

`packages/ui/src/index.ts` 的 `Button` 组合一个 `View` 和一个单行 `Text`。新 TSX 页面不生成协议 `Button` 节点，也不依赖系统按钮的默认内边距、背景、字号或点击区域。

- 默认最小高度 32，水平内边距 12、垂直内边距 6；标题字号 16，颜色 `#007aff`，水平和垂直居中，超长标题单行省略。
- 外层处理布局、背景、边框、圆角、阴影和透明度；标题接收字体、普通颜色和深色颜色。`style.padding`、轴向和单边内边距遵循既有优先级。
- 按下时透明度乘以 0.6，松开或取消恢复。禁用时乘以 0.4，不绑定点击和长按；重新启用后恢复。
- `ref` 和 `testID` 指向外层 View；默认无障碍名称为 `title`，原生无障碍角色仍为按钮。
- JSX 将 Button 按组件执行，使共享状态和 effect 生效。

Android 补齐基础 View 的点击监听及绑定/解绑逻辑；没有事件的子 Text 不设为 clickable 或 longClickable，从而允许父 View 接收真实触摸。iOS 组合按钮点击时保持收起键盘并提交输入的行为。Harmony Native Node 设置按钮无障碍角色，并保留 Text 的声明字号。

组合后每个 Button 比旧节点多一个 Text。Core 初次挂载只发送实际启用的事件绑定，避免虚拟列表首次提交超过 4096 条命令；之后的事件解绑仍发送 false。自动尺寸容器在等待文字测量期间可以产生尚未解析的临时对齐位置，Core 对这些临时帧使用有限占位值；只有测量完成且全部帧合法时才提交。

后续清理已移除协议、测量与各端渲染器的 `Button` 节点，不保留旧版本兼容。Demo 宿主壳的原生页面切换控件不属于公开 TSX Button API，本次没有替换宿主壳。

## 实际运行结果

三端最终 Core manifest 的 `sourceFingerprint` 相同：

```text
f2a3aa34ebbc657b3600bffc215a0c8af75e3830b4083461e7f1e12134a470a7
```

| 平台 | 环境 | 实测结果 |
| --- | --- | --- |
| Android | Medium Phone，Android 15 / API 35，arm64，`emulator-5554` | 3 项 instrumentation 测试通过，0 失败。组件按钮为 ViewGroup + TextView；52×44 逻辑尺寸、标题居中、真实按下透明度 0.6、松开后计数增加、禁用透明度 0.4 和禁用点击拦截均通过；基础事件解绑/重绑与复用节点事件身份通过。 |
| iOS | iPhone 17 Pro，iOS 26.4，arm64 simulator | `testSharedPrimitiveButtons` 通过。52×44 逻辑尺寸、滚动至按钮后真实点击使计数变为 1、禁用无障碍状态及物理坐标点击不执行均通过。 |
| HarmonyOS | Mate 70 Pro，HarmonyOS 6.0.1 / API 21，aarch64，`127.0.0.1:5557` | Demo acceptance 5 组检查全部通过：共享按钮尺寸比例、真实点击计数和禁用拦截；蓝/紫外阴影文本内在宽度及水平居中；原生扩展事件；5000 行列表跳至 4000；prepend 保持深层窗口且仅挂载 7 行。 |

Android 截图同时检查浅色外观；较早一轮默认深色外观下同样通过按钮交互测试。跨系统字体的字形和光栅化仍由基础 Text 渲染器负责，本次结论不表示三端像素完全一致，也不覆盖真机。

## 自动回归

| 命令 | 结果 |
| --- | --- |
| `npm run test:framework` | 14 个文件、81 项测试全部通过 |
| `npm run typecheck:framework` | 通过 |
| `npm run test:harmony` | 45 项通过 |
| `npm run test:build` | 7 项通过 |
| `git diff --check` | 通过 |

共享 Button 测试覆盖：只有 View/Text、布局与标题居中、字体和深色颜色传递、自定义 padding、ref、按压/取消、点击、禁用、重新启用、销毁。三端构建均成功。

## 复现与本地证据

从仓库根构建：

```sh
node scripts/anseronui.mjs build ios
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' node scripts/anseronui.mjs build android
node scripts/anseronui.mjs build harmony
```

Android 在 `examples/native/android` 执行：

```sh
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ./gradlew :app:connectedDebugAndroidTest \
  '-Pandroid.testInstrumentationRunnerArguments.class=org.anseronui.demo.SharedCoreTest#testSharedPrimitiveButtons,org.anseronui.demo.RenderViewTest#primitiveButtonBindsAndUnbindsClicksWithoutMakingLabelClickable,org.anseronui.demo.RenderViewTest#recycledTextAndButtonsResetVisualStateAndEventIdentity'
```

iOS 在仓库根执行，重复运行时需换用尚不存在的 resultBundlePath：

```sh
xcodebuild -project examples/native/ios/AnseronUIDemo.xcodeproj \
  -scheme AnseronUIDemo -configuration Debug \
  -destination 'platform=iOS Simulator,id=53172492-D6E5-42C4-8530-1C5BE594193D' \
  -derivedDataPath .verification/ios-app \
  -resultBundlePath .verification/button-ios-final.xcresult \
  -only-testing:SharedCoreUITests/SharedCoreUITests/testSharedPrimitiveButtons \
  CODE_SIGN_IDENTITY=- ARCHS=arm64 test
```

HarmonyOS 在仓库根执行：

```sh
node scripts/anseronui.mjs run harmony --no-build --device 127.0.0.1:5557
node scripts/test-harmony-demo.mjs 127.0.0.1:5557
```

本地原始证据位于被忽略的构建目录，重新构建可能覆盖：

- Android JUnit：`examples/native/android/app/build/outputs/androidTest-results/connected/debug/`。
- Android 截图：`.verification/shared-buttons-android.png`。
- iOS XCTest：`.verification/button-ios-final.xcresult`；导出截图在 `.verification/button-ios-attachments/`。
- Harmony 验收：`.verification/harmony/acceptance/main-results.json`；截图为同目录的 `shared-buttons-harmony.jpeg`。
- 三端截图汇总及机器可读结果：`.verification/shared-button/`。

构建日志和本次测试日志保存于 `/private/tmp/button-*-final.log`。最终三端测试应用均已安装并启动，Android instrumentation 自动卸载测试目标后已重新安装正式 demo APK。
