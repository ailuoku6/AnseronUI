# 组件与界面 API 参考

本页列出共享 TSX 可用的 UI 组件和常用属性。布局、样式和交互专题见本页末尾的链接。本文不描述原生服务或平台 Renderer API。

## 组件

从 `anseronui/ui` 导入组件和 Hooks。跨平台页面使用这些组件，不直接创建 DOM、UIView、Android View 或 NSView。

| 组件 | 用途 | 主要属性和事件 |
| --- | --- | --- |
| `View` | 布局容器 | `style`、触摸事件、`onLayout` |
| `Text` | 普通文本 | `numberOfLines`、`ellipsizeMode`、文本样式 |
| `RichText` | 多种样式的文本段 | `spans`、`numberOfLines`、`onSpanClick` |
| `Button` | 可访问的按钮 | `title`、`disabled`、`onClick`、`onLongPress` |
| `TextInput` | 文本输入 | `value`、`onChangeText`、键盘类型、焦点和提交事件 |
| `ScrollView` | 垂直滚动 | `scrollEnabled`、滚动指示器、`onScroll`、`scrollTo` |
| `Image` | 图片 | `src`、`dmSrc`、`placeholderSrc`、`resizeMode`、加载事件 |
| `Video` | 视频 | `src`、`playControl`、`autoplay`、`loop`、`muted`、播放事件 |
| `NativeComponent` | 自定义原生视图 | `name`、`nativeProps`、原生事件和 ref |

这些组件支持 `style`、`ref`、`testID`、无障碍属性、`key` 和通用触摸事件。描述、角色、读屏动作、播报和聚焦见[无障碍](../guides/ui/accessibility.md)。具体类型以 [`packages/ui/src/index.ts`](../../packages/ui/src/index.ts) 为准。

## 常用属性

```tsx
<Text numberOfLines={2} ellipsizeMode="tail">说明文字</Text>

<TextInput
  value={name}
  placeholder="姓名"
  onChangeText={setName}
  onSubmitEditing={submit}
/>

<Image
  src="asset://avatar.png"
  resizeMode="cover"
  style={{ width: 64, height: 64 }}
/>

<Video
  src="asset://intro.mp4"
  playControl={playing ? "play" : "pause"}
  onPlaybackStateChange={setPlaybackState}
/>

<View style={{ glassEffect: true, glassEffectStyle: "regular", glassEffectInteractive: true }}>
  <Text>Glass surface</Text>
</View>
```

`TextInput` 是受控组件，使用 `value` 保存当前文本。图片和视频应设置可计算的宽高。媒体文件的打包位置和平台限制见[资源与媒体](#资源与媒体)。

## Liquid Glass

背景模糊也是独立样式：普通 `View` 可以直接设置 `style={{ backgroundBlurRadius: 20 }}`，不需要 `glassEffect`。样式对象写法、重置规则和各端实现见[背景模糊](../guides/ui/styles.md#背景模糊)。

`View` 的 `style` 支持 `glassEffect`、`glassEffectStyle`（`regular` 或 `clear`）、`glassEffectTintColor`（颜色字符串）和 `glassEffectInteractive`。将 `glassEffectInteractive` 设为 `true` 可启用系统的按压高光等交互反馈，支持 iOS 26+ 和 macOS 27+；macOS 26 保留静态玻璃效果。`disabled` 会关闭交互反馈。多个玻璃子视图可以放在 `glassEffectContainer: true` 的 `View` 中，并用 `glassEffectSpacing` 设置融合间距。色调和样式只作用于 `glassEffect` 表面；容器效果主要用于组合子视图。

原生效果要求 iOS 26 或 macOS 26。较早系统、Android、HarmonyOS 和 Web 在 `glassEffect: true` 的表面上自动提供降级：浅色背景 `#f2f5facc`、深色背景 `#20242bcc`，节点 `opacity: 0.88`，`backgroundBlurRadius` 为 regular 20、clear 12（布局单位）。`glassEffectContainer` 仅分组，不会添加第二层降级背景。

三个字段分别以业务显式值为准，未设置的字段才补默认值。`opacity: 0`、`backgroundBlurRadius: 0`、`backgroundColor: "transparent"` 都是有效覆盖；深色模式优先使用 `dmBackgroundColor`。移除或关闭 `glassEffect` 后默认降级随之移除，业务设置的样式保留。

性能例外：Android 8–11 不自动开启默认模糊，只补背景色和透明度；业务显式设置正数 `backgroundBlurRadius` 时继续提供兼容模糊。Android 12+ 硬件绘制采用 GPU 显示列表和 RenderEffect，不再生成背景采样位图。

`View` 的 `backgroundBlurRadius` 只模糊背景，文字和子视图保持清晰。Web 使用 CSS `backdrop-filter`；Android 12+ 的硬件 Canvas 复用背景 GPU 显示列表并使用 `RenderEffect.createBlurEffect`，旧系统和软件 Canvas 使用滤波降级；iOS/macOS 使用系统材质，HarmonyOS 使用 ArkUI 背景模糊强度近似，因此各端半径视觉不保证逐像素一致。背景模糊设为 0 时关闭模糊。原生 Liquid Glass 可用时仍使用系统玻璃，不叠加默认降级；显式背景色和透明度照常生效，不透明背景可能遮住原生玻璃。

## 公共事件

| 事件 | 适用场景 | 说明 |
| --- | --- | --- |
| `onClick` | 点击 | 用户激活节点时调用 |
| `onLongPress` | 长按 | 触发平台长按时调用 |
| `onLayout` | 布局完成或变化 | 返回相对父节点的目标 frame |
| `onTouchDown`、`onTouchMove`、`onTouchUp`、`onTouchCancel` | 手势处理 | 支持捕获阶段和冒泡阶段 |
| `onBackPress` | 返回键处理 | 返回 `true` 表示消费该事件 |

触摸事件含 `target`、`currentTarget`、`eventPhase`、坐标和 `pointerId`。在回调中同步调用 `stopPropagation()` 停止框架事件传播。滚动交接由 `touchAction` 控制。完整分发顺序和滚动仲裁见[事件与手势](../guides/ui/interactions.md)。

## 页面与状态

页面使用 `definePage(name, component)` 导出，再由 `anseronui.config.json` 登记。组件内可使用 `useState`、`useReducer`、`useRef`、`useEffect`、`useMemo`、`useCallback`、`createContext`、`useContext` 和 `useServices`。

常用接口：

- 页面导航使用 `useRouter()`。见[页面路由](../guides/navigation/routing.md)。
- 页面隐藏时暂停工作使用 `usePageEffect()`。见[页面生命周期](../guides/navigation/page-lifecycle.md)。
- 延迟任务使用 `setTimeout`、`clearTimeout` 或 `useTimers()`。见[计时器](../guides/navigation/timers.md)。
- 原生服务使用 `useServices()`。见[标准系统服务](../guides/services/native-services.md)。
- 文本内容尺寸使用 `useTextMeasurer()` 或 `useServices().measureText()`。见[文本尺寸测量](../guides/ui/text-measurement.md)。

## 资源与媒体

图片和视频可以使用 `asset://`、本地资源或网络 URL。`asset://` 当前按文件名解析。新工程的原生宿主从 `assets/` 加载资源。Web 工程从公共目录的 `assets/` 加载资源。自定义 `web.publicDir` 时，需要把 Web 资源放入该目录。

自动播放、编解码器、网络访问和系统权限由平台控制。媒体加载失败时，使用 `onError` 提供可恢复的界面状态。

## 相关文档

界面：

- [样式](../guides/ui/styles.md)
- [事件与手势](../guides/ui/interactions.md)
- [动画](../guides/ui/animations.md)
- [组件组合](../guides/ui/component-composition.md)
- [虚拟列表](../guides/ui/virtual-list.md)

页面：

- [路由](../guides/navigation/routing.md)
- [生命周期](../guides/navigation/page-lifecycle.md)

能力：

- [系统服务](../guides/services/native-services.md)
- [原生扩展](../guides/services/native-extensions.md)

限制见 [TypeScript 与 TSX](typescript.md)。全部目录见[文档](../README.md)。
