# Android View 渲染器

AnseronUI 的 Android 宿主使用真实 Android View 渲染共享 Core 提交的节点。`AnseronUIRenderView` 是可嵌入现有页面的 `FrameLayout`，内部管理 `AndroidHost`、渲染根节点和页面路由栈。

## 构建与接入

仓库示例在框架根目录执行 `npm run build:android`。需要 JDK 17、Android SDK（compileSdk 35）、NDK；最低运行版本为 API 26，当前只构建 `arm64-v8a`。

现有项目可把本目录作为 Gradle library module 引入。默认 transport 依赖 `libanseronui.so`，`build:core:android` / `build:android` 会先编译 Core，再把 C/JNI transport 链接为 `src/main/jniLibs/arm64-v8a/libanseronui.so`。打包 AAR 或接入宿主时应确保该库与页面清单、协议和目标 ABI 匹配，不能只复制 Kotlin 源码而省略 Core 构建。

SDK 可通过 `ANDROID_HOME` / `ANDROID_SDK_ROOT` 指定，NDK 可通过 `ANDROID_NDK_ROOT` 指定。示例 APK 在 `examples/native/android/app/build/outputs/apk/debug/app-debug.apk`。

## 嵌入页面

在 UI 线程上操作容器：

```kotlin
import android.widget.FrameLayout
import org.anseronui.render.AnseronUIRenderView
import java.net.URL

val pageView = AnseronUIRenderView(this, baseUrl = URL("https://example.com"))
content.addView(pageView, FrameLayout.LayoutParams(-1, -1))
pageView.onFailure = { error -> android.util.Log.e("AnseronUI", "页面加载失败", error) }
pageView.load("counter")

// 需要替换为一个全新页面时调用：
pageView.load("async-form")

// 在所属 Activity.onDestroy / Fragment.onDestroyView 中调用：
pageView.destroy()
```

标准 `Context` / `AttributeSet` 构造器也支持 XML 布局加载。页面名必须与编译进 Core 的页面清单匹配。

## 尺寸与生命周期

- `load(page)` 可在首次布局前调用，宽高都大于零时才启动 Core。
- 后续布局变化会自动以 dp 发送 `Resize`，包括尺寸变为零的情况。
- 每次 `load` 使用新渲染根和 Host，隔离旧页面异步清理并抑制已退出页面的回调。
- `onFailure` 后停止向故障 Host 发送尺寸变化；再次 `load` 可以创建新页面。
- `page`、`isDestroyed` 暴露状态；`destroy()` 幂等且不可恢复，之后需使用新容器。
- 从父容器移除或重新挂载不会销毁页面；所有者必须显式销毁，以释放 worker、Core 和平台资源。

`onReady` 表示握手就绪，早于首帧。`onDiagnostic` 和 `onFailure` 在主线程报告当前页面的诊断或错误。构造参数 `createCore` 可注入自定义 `AndroidCoreTransport`，默认使用 JNI `NativeCore`。

## 路由、返回与扩展

`load(page)` 重置页面栈；`push(page)`、`replace(page)`、`pop()` 可以从原生宿主操作。TSX 使用 `useRouter()`；页面切换不缓存旧页面实例。

宿主处理系统返回时，先请求页面消费，再尝试路由返回，最后交给系统：

```kotlin
if (pageView.handleBackPress()) return
if (pageView.pop()) return
super.onBackPressed()
```

上面是示例 Activity 的处理方式；使用自己的返回键分发器时保留相同顺序。平台 API、自定义组件和 ref 见[原生扩展](../../docs/native-extensions.md)。`testID` 映射为 `View.transitionName`，不占用无障碍标签。

## 平台约束

库 manifest 设置 `android:allowNativeHeapPointerTagging="false"`。当前固定版本的 AOT runtime 在 value 中打包指针，不保留 Android 堆指针 tag，可能在循环回收时触发中止。集成当前运行时需保留合并后的应用级设置；它作用于整个应用进程。移除该设置需要运行时正确保留 tagged pointer，并重新验证设备。

视频节点由样式容器包裹透明 `VideoView`。背景、边框和圆角放在容器上；直接画在 `VideoView` 上会盖住单独合成的视频画面。容器保持 Core 尺寸，并按 `contain`、`cover`、`stretch` 缩放视频。播放器准备完成时使用最新播放属性，首帧事件跟随播放器的 rendering-start 通知。删除子树或清空 Renderer 会停止播放器及进度回调。

`RichText` 为各 span 分别设置颜色和字形样式，仅可点击 span 添加点击处理；点击样式不应覆盖显式文字颜色。禁用按钮使用状态颜色和透明度区分普通状态。

## 底层分工与验证

`AndroidRenderer` 在主线程向指定 `FrameLayout` 根应用 `Commit`，回传类型化事件并测量文本。`AndroidHost` 使用固定 `HandlerThread`，校验输出身份和序号，把 UI ACK、测量结果、HTTP 和计时器结果送回 Core，并处理取消。

示例 `RenderViewTest` 使用注入 transport 验证容器、动画、富文本与按钮样式；`SharedCoreTest` 验证真实 AOT 页面。视频专项用例 `testVideoRendersPixelsAndHonorsPausedState` 检查画面像素、初始暂停、进度、暂停、重置和页面替换。运行设备测试前准备好模拟器、当前 Core 和测试依赖；HTTP 用例需要启动 5174 fixture 并设置 `adb reverse tcp:5174 tcp:5174`。

更多入口：[中文文档](../../docs/README.md) · [能力清单](../../docs/capabilities.md) · [架构与原理](../../docs/architecture.md)。
