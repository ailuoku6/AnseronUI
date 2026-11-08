# 原生扩展：Module、原生组件和 ref

AnseronUI 可以让共享 TSX 调用平台 API、挂载平台自定义视图，以及通过 ref 调用节点或函数组件公开的方法。注册表由每个宿主注入：iOS 使用 `IOSPlatformExtensions`，Android 使用 `AndroidPlatformExtensions`，Web 使用 `PlatformExtensions`。示例见 `examples/extensions/page.tsx`，三端演示 App 的「扩展」页使用同一份 TSX。

## 调用平台 Module

```tsx
import { Button, useServices } from '@anseronui/ui';

function ReadDevice() {
  const services = useServices();
  return <Button title="读取设备" onClick={async () => {
    try {
      const info = await services.invoke<{ platform: string; version: string }>(
        'device', 'info', { source: 'tsx' },
      );
      // 使用 info 更新业务状态。
    } catch (error) {
      // 未注册模块、原生执行失败和所属组件销毁都会拒绝 Promise。
    }
  }} />;
}
```

`useServices()` 绑定当前函数组件生命周期。组件卸载时，未完成请求被取消并拒绝；宿主丢弃取消后的迟到结果以及重复完成。原生处理器可以返回取消函数，用来停止网络、定位等底层任务。没有返回取消函数时，底层任务本身不会被强制停止。

所有通用模块调用都返回 Promise。Core 在独立执行线程上运行，宿主不支持 Kuikly 风格的同步返回，也没有通用的持续事件订阅 API。持续订阅需要另行设计订阅/取消协议；一次模块调用只能完成一次。`http`、`timer`、`__view`、`router` 是框架保留模块名，不要注册同名模块。

模块名、方法名最大 128 字符；模块名匹配 `[A-Za-z_][A-Za-z0-9_.-]*`。参数和返回值通过 JSON 传输，只传字符串、有限数值、布尔值、null、数组和普通对象；不要传函数、原生对象、循环引用或 BigInt。未传参数时使用 null。协议字符串上限为 65,536 字符，iOS/Android 的扩展返回和事件编码另外限制为 65,536 UTF-8 字节；业务应将单次载荷控制在 64 KiB 以内。

### iOS 注册

```swift
let extensions = IOSPlatformExtensions(modules: [
    "device": { method, args, completion in
        guard method == "info" else {
            throw NativeExtensionError.unsupportedMethod(method)
        }
        completion(.success([
            "platform": "iOS", "version": UIDevice.current.systemVersion
        ]))
        return nil // 异步任务可返回取消闭包
    }
])
let content = AnseronUIRenderView(extensions: extensions)
content.load(page: "extensions")
```

处理器在主线程被调用，耗时工作应交给后台队列。completion 可从任意线程调用，宿主会排队将结果送回 Core。返回 JSON null 时使用 `NSNull()`。

### Android 注册

```kotlin
val extensions = AndroidPlatformExtensions(modules = mapOf(
    "device" to { method, _, complete ->
        require(method == "info") { "UNSUPPORTED_METHOD: $method" }
        complete(Result.success(JSONObject()
            .put("platform", "Android")
            .put("version", android.os.Build.VERSION.RELEASE)))
        null // 异步任务可返回取消 lambda
    }
))
val content = AnseronUIRenderView(context, extensions = extensions)
content.load("extensions")
```

处理器在主线程被调用，completion 可从任意线程调用。对象/数组优先使用 `JSONObject` / `JSONArray`，不要直接返回任意 Kotlin 数据类。

### Web 注册

```ts
const host = new BrowserHost(root, runtime, undefined, {
  modules: {
    device(method, args, signal) {
      if (method !== 'info') throw new Error('UNSUPPORTED_METHOD');
      return { platform: 'Web', version: navigator.userAgent };
    },
  },
});
```

Web 处理器可以直接返回 JSON 值或 Promise，`signal` 是取消用的 AbortSignal，可以传给 fetch。JS 参考宿主 `BrowserReferenceHost` 也接受同样的注册表。

## 将原生组件暴露给 TSX

```tsx
const PlatformSwitch = createNativeComponent<{ value: boolean }>('DemoSwitch');

function Example() {
  const [enabled, setEnabled] = useState(false);
  const control = useRef<NodeHandle | null>(null);
  return <PlatformSwitch
    ref={control}
    style={{ width: 100, height: 44 }}
    nativeProps={{ value: enabled }}
    onNativeEvent={event => {
      if (event.name === 'change') {
        setEnabled((event.data as { value: boolean }).value);
      }
    }}
  />;
}
```

也可以直接使用 `<NativeComponent name="DemoSwitch" ... />`。`nativeProps` 是传给原生的完整属性对象，`setProps` 应处理属性缺省和移除；更新属性时不要主动发出用户交互事件，否则容易形成受控组件回调循环。style、testID、通用触摸等公共属性由框架处理。自定义事件由工厂提供的 `emit(name, data)` 发回 TSX 的 `onNativeEvent`，事件回调本身不跨端序列化。自定义业务事件只送给当前节点，不参与触摸事件的捕获/冒泡。

每个平台以相同名字注册工厂，工厂为每个挂载节点创建独立实例：

| 平台 | 实例接口 | 属性更新 | 原生方法 | 销毁 |
| --- | --- | --- | --- | --- |
| iOS | `IOSNativeComponent`，提供 `UIView` | `setProps([String: Any])` | `invoke(method,args,completion)` | `dispose()` |
| Android | `AndroidNativeComponent`，提供 `View` | `setProps(JSONObject)` | `invoke(method,args,complete)` | `dispose()` |
| Web | `NativeViewInstance`，提供 HTMLElement | `setProps(props)` | `invoke(method,args)` | `dispose()` |

例如 iOS 注册 `components: ["DemoSwitch": { emit in DemoSwitch(emit: emit) }]`；Android 注册 `components = mapOf("DemoSwitch" to { context, emit -> DemoSwitch(context, emit) })`。完整可运行实现分别位于 `examples/native/ios/App.swift`、`examples/native/android/app/src/main/java/org/anseronui/demo/MainActivity.kt` 和 `examples/native/web/main.ts`。

原生实例默认是叶子节点。需要承载 TSX 子节点时，iOS/Android 返回 `contentView`，Web 返回 `content`；未提供容器却传入子节点会报错。布局由共享 Core 计算，当前不读取自定义原生视图的 intrinsic size，请给出明确尺寸或 flex 布局约束。原生 `dispose()` 应释放监听器、观察者、播放器等资源；卸载后迟到的事件不会发给新节点。

## 节点与组件 ref

`useRef<T>(initial)` 保存函数组件内跨渲染的可变引用，修改 current 不触发渲染。`createRef<T>()` 创建初值为 null 的引用，应在渲染函数外或稳定的存储位置创建。节点同时支持对象 ref 和 `(handle | null) => void` 回调 ref。

原生提交收到成功 ACK 后绑定 ref，在布局回调和 effect 之前可用；卸载或替换时置为 null。失败提交不会绑定新 ref。同一个存活节点的 NodeHandle 保持稳定，但不要跨卸载缓存它继续调用；旧句柄会以 `NODE_UNMOUNTED` 拒绝，正在等待的节点请求也会取消。

| NodeHandle 方法 | 用途 |
| --- | --- |
| `nodeId` | 当前节点 ID，只在所属宿主/页面生命周期内有意义 |
| `measure()` | 返回相对渲染根的 `{ x, y, width, height }` |
| `focus()` / `blur()` | 内置 TextInput 聚焦/失焦；自定义组件可实现同名方法 |
| `scrollTo(x, y, animated?)` | 内置 ScrollView 滚动；各平台受原生滚动轴限制 |
| `animate(style, options?)` / `cancelAnimation()` | 属性动画与取消，详见[动画](animations.md) |
| `invoke<T>(method, args?)` | 调用自定义原生组件实例的方法，返回 Promise<T> |

ref 返回的是跨端句柄，不是 UIView、Android View 或 DOM 对象。所有命令通过框架发往宿主；`measure` 是保留通用方法。函数组件通过普通 ref prop 配合 `useImperativeHandle` 暴露业务接口：

```tsx
interface EditorHandle { focus(): Promise<void> }

function Editor(props: { ref?: RefTarget<EditorHandle> }) {
  const input = useRef<NodeHandle | null>(null);
  useImperativeHandle(props.ref, () => ({
    focus: async () => { await input.current?.focus(); },
  }), []);
  return <TextInput ref={input} value="" onChangeText={() => {}} />;
}
```

`useImperativeHandle` 在提交后的 effect 阶段绑定，依赖改变时重建，卸载时清空；依赖语义与 `useEffect` 一致。没有自动暴露函数组件内部实例，也不需要 React 的 forwardRef。

## 验证入口

`npm run test:framework` 覆盖协议、ref 提交时序、模块成功/失败、取消及组件公开句柄。`npm run test:core:native` 和 `npm run test:core:wasm` 包含扩展页的真实 AOT 协议验证。macOS 可执行 `node scripts/test-web-extensions.mjs`，用 WebKit 验证 Web 参考宿主和 DOM 扩展。iOS 的 `testNativeExtensions` 与 Android 的同名 instrumentation 测试验证真实平台控件、属性、回调及 ref。
