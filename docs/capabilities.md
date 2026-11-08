# AnseronUI 能力清单

本文按业务开发者的视角列出当前可以直接使用的能力。更底层的生命周期、协议和编译原理见[架构与原理](architecture.md)。

## 编译与布局基础

原生/Wasm 构建基于 scriptc 0.4.8 和项目的 async embedding 补丁；共享 Flex 布局基于 Flexily 0.8.5 适配源码。AnseronUI 在其上提供组件、状态、事件与宿主能力。上游 Node API 支持不等于移动端可以直接调用；具体写法见 [TS/TSX 限制](typescript-limitations.md)，打包方式见[独立 Core 与业务包](core-bundles.md)。

## 基础组件

`@anseronui/ui` 当前提供以下跨端组件：

| 组件 | 用途 | 常用能力 |
| --- | --- | --- |
| `View` | 通用容器 | Flex 布局、背景、边框、圆角、触摸和布局事件 |
| `Text` | 普通文本 | 字号、字重、斜体、颜色、对齐、行数和省略 |
| `RichText` | 富文本 | 多 span 颜色、字号、字重、斜体、下划线、删除线和 span 点击 |
| `Button` | 按钮 | 标题、点击、长按、禁用状态和通用样式 |
| `TextInput` | 输入框 | 受控 value、placeholder、键盘类型、密码输入、焦点和提交 |
| `ScrollView` | 垂直滚动容器 | 原生滚动、滚动事件、滚动结束事件、`scrollTo` |
| `Image` | 图片 | `asset://`、本地/网络资源、占位图、缩放模式、加载成功/失败 |
| `Video` | 视频 | 播放/暂停/重置、自动播放、循环、静音、倍速、控制条和播放事件 |
| `NativeComponent` | 平台原生组件 | 属性、原生事件、原生方法和生命周期 |

八个基础组件及 `NativeComponent` 都声明了以下公共接口：`key`、`style`、`ref`、`testID`、`accessibilityLabel`、`animation`、`onClick`、`onLongPress`、`onBackPress`、触摸事件和 `onLayout` 等公共属性；具体交互仍受控件状态和平台行为限制。

### 常用属性与专属事件

以下名称来自 [UI 类型定义](../packages/ui/src/index.ts)，代码中应按原样使用：

| 组件 | 属性 | 专属回调 |
| --- | --- | --- |
| `Text` | `numberOfLines`、`ellipsizeMode`（`tail` / `clip`） | 通用点击、触摸等 |
| `RichText` | `spans`、`numberOfLines`；每个 span 可设置 `text`、`color`、`fontSize`、`fontWeight`、`fontStyle`、`textDecorationLine` | span 的 `onClick()`、整段的 `onSpanClick(index)` |
| `Button` | 必填 `title`、可选 `disabled` | 通用 `onClick`、`onLongPress` |
| `TextInput` | 必填 `value`、`onChangeText`；`placeholder`、`editable`、`secureTextEntry`、`maxLength`、`keyboardType`、`returnKeyType`、`autoCapitalize`、`autoCorrect`、`placeholderTextColor` | `onChangeText(value)`、`onFocus()`、`onBlur()`、`onSubmitEditing(value)` |
| `ScrollView` | `scrollEnabled`、`showsVerticalScrollIndicator` | `onScroll(offset, event)`、`onScrollEnd(event)` |
| `Image` | 必填 `src`；`placeholderSrc`、`resizeMode` | `onLoad(source)`、`onError(source, errorCode)` |
| `Video` | 必填 `src`；`resizeMode`、`controls`、`autoplay`、`loop`、`muted`、`rate`、`playControl`（`play` / `pause` / `stop`） | `onPlaybackStateChange(state)`、`onTimeUpdate(currentTime, duration)`、`onFirstFrame()`、`onError(source, errorCode)` |
| `NativeComponent` | 必填 `name`；`nativeProps`、公共样式及 ref | `onNativeEvent({ name, data })` |

`ScrollEvent` 包含 `x/y/contentWidth/contentHeight`；`onScroll` 的首个参数仍是垂直偏移量，方便兼容现有调用。媒体缩放模式为 `contain`、`cover`、`stretch`，播放状态为 `playing`、`paused`、`ended`、`error`。输入框键盘配置映射到各平台控件，不保证所有系统键盘外观完全相同。

## 样式与布局

共享布局使用项目内适配的 Flexily。常用样式包括：

- 尺寸：`width`、`height`、`minWidth`、`minHeight`、`maxWidth`、`maxHeight`；
- Flex：`flexDirection`、`flexGrow`、`flexShrink`、`flexBasis`、`flexWrap`、`gap`、`rowGap`、`columnGap`；
- 间距：`padding`、`paddingHorizontal/Vertical`、四边 padding、`margin`、`marginHorizontal/Vertical`、四边 margin；
- 对齐：`alignItems`、`alignSelf`、`justifyContent`；
- 定位：`position`、`top`、`right`、`bottom`、`left`；
- 外观：`backgroundColor`、`color`、`opacity`、`borderColor`、`borderWidth`、`borderRadius`；
- 变换：`translateX/translateY`、`scaleX/scaleY`、`rotate`；
- 文本：`fontSize`、`fontWeight`、`fontStyle`、`textAlign`、`textDecorationLine`；
- 裁剪和可见性：`overflow`、`visibility`。

布局在 Core 中计算成节点 frame，再由各平台应用到真实 View、UIView 或 DOM。尺寸和间距使用数值逻辑单位，TSX 的 `Style` 不接受任意 CSS 字符串；底层 Flexily 能力不等于全部暴露到 TSX。布局默认方向为 `row`，纵向容器请显式设置 `flexDirection: "column"`。业务不应在每个平台重新实现一套布局算法。

## 事件模型

### 点击、长按和布局

```tsx
<Button
  title="保存"
  onClick={() => save()}
  onLongPress={() => showMenu()}
/>

<View onLayout={frame => console.log(frame.width, frame.height)} />
```

`onLayout` 返回 Core 确认的目标布局 `{ x, y, width, height }`。动画期间它不会逐帧报告视觉插值位置。

### 触摸、捕获和冒泡

触摸事件支持捕获阶段、目标阶段和冒泡阶段：

```tsx
<View
  onTouchDownCapture={event => console.log("capture", event.currentTarget)}
  onTouchDown={event => console.log("bubble", event.currentTarget)}
>
  <View
    touchAction="none"
    onTouchMove={event => {
      event.stopPropagation();
    }}
  />
</View>
```

公共触摸回调为 `onTouchDown`、`onTouchMove`、`onTouchUp`、`onTouchCancel` 及各自的 `Capture` 版本。

`TouchEvent` 包含 `target`、`currentTarget`、`eventPhase`、`x/y`、`pageX/pageY`、`pointerId`、当前触点列表和同步的 `stopPropagation()`。`x/y` 始终相对初始命中目标，`pageX/pageY` 相对渲染根，目标在同一 pointer 的 down 到 up/cancel 期间保持不变。

- 捕获回调从外层到目标执行；
- 普通回调在目标和冒泡阶段执行；
- 捕获和冒泡阶段都能调用 `stopPropagation()`，须在任何 `await` 之前同步调用；它停止遍历其他节点，同一目标上的捕获与普通回调仍按分发规则执行；
- `touchAction="none"` 可以阻止触摸流交给最近的 ScrollView；`pan-x`、`pan-y` 可以声明轴向交接策略；
- 手势策略在 down 时沿命中路径求交，包含最近的 ScrollView；手势中更新属性只影响下一次手势，当前内置 ScrollView 主要提供垂直滚动；
- 原生滚动接管后会为活动 pointer 发送一次 `onTouchCancel`，后续不再发送该流的 move/up；
- `stopPropagation()` 只控制框架事件传播，不等于停止原生滚动，滚动交接由 `touchAction` 决定。

### 系统返回键

节点可以声明同步的 `onBackPress`：

```tsx
<View onBackPress={() => {
  if (hasModal) {
    closeModal();
    return true;
  }
  return false;
}} />
```

返回 `true` 表示消费返回键；返回 `false` 后由宿主继续执行路由返回或系统默认行为。完整流程见[系统返回键](back-press.md)。

## 状态、Hooks 和生命周期

`@anseronui/ui` 提供不依赖 React 的函数组件模型：

- `useState`、`useReducer`：状态和状态更新；
- `useRef`、`createRef`：跨渲染保存引用；
- `useEffect`：提交后的副作用和清理；
- `useMemo`、`useCallback`：按依赖缓存值和函数；
- `createContext`、`useContext`：树内共享值；
- `useServices`：调用平台 Module、HTTP 和 sleep；
- `useRouter`：页面跳转和返回；
- `useImperativeHandle`：函数组件向外暴露异步句柄。

组件卸载时清理所属 effect、ref 与未完成服务请求；节点删除会释放其平台资源。整个页面退出时再销毁 surface、宿主计时器、媒体和动画。异步业务代码仍需处理 Promise rejection，不能假设一个页面会一直存活。

## 图片、视频和富文本

以下示例使用 state 反馈富文本点击，视频通过 `playControl` 受控播放：

```tsx
import { Button, Image, RichText, Video, View, useState } from "@anseronui/ui";

function MediaPreview() {
  const [clicked, setClicked] = useState(false);
  const [playing, setPlaying] = useState(false);
  return <View style={{ flexDirection: "column", gap: 12 }}>
    <Image src="asset://showcase.png" resizeMode="contain" style={{ width: 240, height: 120 }} />
    <Video src="asset://showcase.mp4" muted controls={false}
      playControl={playing ? "play" : "pause"} style={{ width: 240, height: 135 }} />
    <Button title={playing ? "暂停" : "播放"} onClick={() => setPlaying(value => !value)} />
    <RichText spans={[
      { text: "普通 ", color: "#17263c" },
      { text: "重点 ", color: "#275de5", fontWeight: "bold" },
      { text: clicked ? "已点击" : "点击我", color: "#d44c30", onClick: () => setClicked(true) },
    ]} />
  </View>;
}
```

示例资源位于 `examples/components/assets`。默认原生示例和 Web 构建会打包它们；`asset://` 当前使用简单文件名。图片/视频应给出尺寸或可计算的布局约束，不能依赖媒体文件自动提供跨端固有尺寸。

业务资源打包约定：iOS 对应 bundle 中的 `assets` 目录，Android 对应应用 assets，Web 对应 `/assets/`。新建应用配置了自己的 `web.publicDir` 时，需要自行把媒体放进该目录的 `assets` 子目录；Core 构建只复制 Wasm 和 manifest，不会自动扫描业务资源。网络 URL 的权限、可访问性、浏览器自动播放限制和系统支持的编解码器仍由宿主/平台决定。

## 动画

支持声明式和 ref 命令式动画：

```tsx
<View
  animation={{ duration: 500, easing: "easeInOut" }}
  style={{
    width: expanded ? 180 : 80,
    opacity: expanded ? 0.6 : 1,
    translateX: expanded ? 40 : 0,
  }}
/>
```

可动画属性包括透明度、平移、缩放、旋转、圆角、背景色和最终 frame。ref 还支持 `animate()`、`cancelAnimation()`。动画在平台帧时钟上插值，不会逐帧回到 TSX 或重新执行 Flexily。详见[动画](animations.md)。

## 页面路由

```tsx
// 在各自页面的函数组件内取得 router。
const router = useRouter();
<Button title="详情" onClick={() => { void router.push("details"); }} />
// 在详情页使用：
<Button title="返回" onClick={() => { void router.back(); }} />
```

支持 `push`、`replace`、`pop`、`back`、`current`。页面必须在 `anseronui.config.json` 的 `pages` 中注册。当前不支持路由参数、深链、页面缓存和嵌套路由。详见[页面路由](routing.md)。

## Module、原生组件和 ref

业务可以：

- 通过 `useServices().invoke(module, method, args)` 调用平台 API；
- 用 `createNativeComponent(name)` 创建带属性、事件和方法的跨端原生组件；
- 用 `ref` 获取 `NodeHandle`，调用 `measure`、`focus`、`blur`、`scrollTo`、`animate`、`invoke`；
- 用 `useImperativeHandle` 让函数组件公开业务句柄。

原生扩展注册由 iOS、Android、Web 宿主注入，TSX 不直接持有 UIView、Android View 或 DOM 对象。详见[原生扩展](native-extensions.md)。

## 平台支持

| 平台 | 当前能力 | 入口 |
| --- | --- | --- |
| iOS | UIKit Renderer、AOT Core、图片/视频、触摸、动画、Module、原生组件、ref | `packages/render-ios` |
| Android | Android View Renderer、JNI Core、图片/视频、触摸、动画、Module、原生组件、ref | `packages/render-android` |
| Web | DOM Renderer、Wasm Core、基础组件/媒体/触摸、浏览器 Module、原生组件扩展、ref、动画和路由 | `packages/render-web` |

iOS 没有 Android 同等的统一物理返回键，导航控制器需要主动调用 `handleBackPress()`；Android 示例 Activity 已接入系统返回；Web 示例监听 `Escape` 和 `BrowserBack`。

## 当前限制

- 页面路由暂不支持参数、深链、页面缓存和持久化导航状态；
- Core 的异步请求可以取消等待和丢弃迟到结果，但不能强制终止任意已经挂起的业务 async fiber；
- 自定义原生组件需要平台分别注册工厂；
- 布局使用逻辑单位/设备宿主单位转换，尚未提供完整的高 DPI 连续坐标模式；
- 不包含热更新、应用签名发布、商店自动化和完整插件生态。

## 跨端计时器与独立构建

共享 TS/TSX 支持 `setTimeout(callback, delay)`、`clearTimeout(id)` 和 `useTimers()`；页面退出取消未触发计时器。调用规则、异步作用域及暂不支持的计时器接口见[计时器](timers.md)。Framework Core 与业务包独立编译，业务变化可复用内核，详见[构建说明](core-bundles.md)。
