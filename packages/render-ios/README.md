# iOS UIKit 渲染器

AnseronUI 的 iOS 宿主使用 UIKit 渲染共享 Core 提交的节点。`AnseronUIRenderView` 是可嵌入现有页面的 `UIView`，内部管理 `IOSHost`、渲染根节点和页面路由栈。

## 构建与链接

仓库示例在框架根目录执行 `npm run build:ios`；设备产物使用 `npm run build:ios-device`。两者都会先构建对应架构的 Core，再生成和编译 Xcode 工程。当前模拟器与设备目标均为 arm64，最低部署目标为 iOS 15。

现有工程可以通过本目录的本地 Swift Package 或源码 target 引入 Renderer。还需要包含 `packages/core/native/transport.c` 及其头文件，并链接对应目标的 `.verification/core-ios-simulator/entry.lib.a` 或 `.verification/core-ios-device/entry.lib.a`。仅添加 Swift Package 不会自动编译或链接 Core。完整链接设置可参考 `scripts/generate-ios-project.py` 生成的 `examples/native/ios/AnseronUIDemo.xcodeproj`。

页面清单、Core、宿主协议和产物架构必须匹配；修改 TSX 后应重新执行应用构建；独立 Framework Core 未变化时会复用，只重编业务包。设备构建默认未签名，安装到真机还需配置应用自己的签名。

## 嵌入页面

在主线程 / MainActor 上操作容器：

```swift
import AnseronUIRenderIOS

let pageView = AnseronUIRenderView(baseURL: URL(string: "https://example.com"))
view.addSubview(pageView)
// 像普通 UIView 一样设置 frame 或 Auto Layout 约束。
pageView.onFailure = { error in print(error) }
pageView.load(page: "counter")

// 需要替换为一个全新页面时调用：
pageView.load(page: "async-form")

// 所有者结束使用时释放页面和宿主：
pageView.destroy()
```

页面名必须与编译进 Core 的页面清单匹配。`baseURL` 为宿主 HTTP 服务提供相对地址解析基础，实际网络权限与资源策略由应用配置。

`onPageBackgroundColor` 在成功提交后报告页面第一个根节点的目标背景色，包括后续更新和路由切换。独立 App 可用它设置控制器和窗口背景，将页面颜色延伸到安全区域，并更新 `preferredStatusBarStyle`；嵌入式容器不会自行修改宿主系统栏。透明背景由宿主决定底色，动画期间报告目标颜色。

## 尺寸与生命周期

- `load(page:)` 可以在首次布局前调用，宽高都大于零时才启动 Core。
- 后续尺寸变化自动以 point 发送 `Resize`，包括尺寸变为零的情况。
- 每次 `load` 使用新的渲染根与 Host，旧页面异步清理与回调不会写入新页面。
- `onFailure` 后停止向故障 Host 发送尺寸更新；再次 `load` 可以创建新页面。
- `page`、`isDestroyed` 暴露容器状态；`destroy()` 幂等且不可恢复，销毁后需要创建新容器。
- 临时移出父视图或重新挂载不会销毁页面。所有者结束使用时应显式调用 `destroy()`；释放容器也会释放 Host，由 Host 的析构停止 worker。

`onReady` 表示握手就绪，不代表首帧已完成。`onDiagnostic` 和 `onFailure` 在主线程报告当前页面的诊断与错误。构造参数 `createCore` 可注入自定义 `IOSCoreTransport`，默认实现使用 AOT `NativeCore`，需要链接编译好的 Core 和 C transport。

## 路由、返回与扩展

`load(page:)` 重置页面栈；`push(page:)`、`replace(page:)`、`pop()` 供宿主导航使用。TSX 侧通过 `useRouter()` 调用相同能力。当前路由不缓存旧页面实例。

iOS 没有统一的系统物理返回键。宿主返回按钮或导航控制器应按以下顺序接入：

```swift
if pageView.handleBackPress() { return }
if pageView.pop() { return }
navigationController?.popViewController(animated: true)
```

平台 API 和自定义 UIKit 组件通过 `IOSPlatformExtensions` 注入。节点 ref 返回跨端句柄，不直接暴露 UIView。详见[路由](../../docs/routing.md)、[返回键](../../docs/back-press.md)和[原生扩展](../../docs/native-extensions.md)。

## 底层分工与验证

`IOSRenderer` 在主线程向指定 `UIView` 根节点应用 `Commit`，创建真实控件、执行媒体与动画、测量文本并回传交互事件。`IOSHost` 使用固定 Core worker 线程，校验输出身份与序号，将 UI ACK、测量结果、URLSession 和计时器结果排队送回 Core；不要从平台回调直接重入 Core。

示例中的 `RenderViewTests` 使用注入 transport 验证容器生命周期、延迟启动、尺寸变化、页面替换、重新挂载与销毁；`SharedCoreUITests` 验证真实编译页面、组件、扩展、布局和媒体。测试需先构建当前 Core，并准备模拟器；依赖 HTTP 的用例还需要本地 fixture。

更多入口：[中文文档](../../docs/README.md) · [能力清单](../../docs/capabilities.md) · [架构与原理](../../docs/architecture.md)。
