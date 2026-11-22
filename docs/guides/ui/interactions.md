# 事件与手势

UI 事件按页面节点树分发。点击和长按适合普通控件。触摸事件适合需要读取坐标或控制滚动交接的手势。

## 点击和布局

```tsx
<Button title="保存" onClick={save} onLongPress={showMenu} />

<View onLayout={({ width, height }) => setSize({ width, height })} />
```

`onLayout` 在首次布局和 frame 变化、渲染器确认提交后调用。frame 使用逻辑单位，`x/y` 相对直接父节点。滚动偏移、transform 和动画中的视觉位置不计入结果。

## 触摸阶段

回调有捕获和普通两种形式。捕获回调从外层向目标传播。普通回调在目标和冒泡阶段运行。

```tsx
<View
  onTouchDownCapture={event => console.log("capture", event.currentTarget)}
  onTouchDown={event => console.log("bubble", event.currentTarget)}
>
  <View onTouchMove={event => event.stopPropagation()} />
</View>
```

可用回调为 `onTouchDown`、`onTouchMove`、`onTouchUp`、`onTouchCancel`，以及带 `Capture` 后缀的对应回调。

事件包含 `target`、`currentTarget`、`eventPhase`、`x/y`、`pageX/pageY`、`pointerId` 和触点列表。`x/y` 相对初始命中节点，`pageX/pageY` 相对渲染根。一个 pointer 从 down 到 up 或 cancel 使用相同 target。

在任何 `await` 之前同步调用 `stopPropagation()`。它会停止事件继续传到其他节点。它不会阻止原生滚动。

高频拖动时，同一节点和 pointer 尚未处理的连续 `onTouchMove` 会合并为最新坐标；不要依赖每个硬件采样点都触发一次回调。`onTouchDown`、`onTouchUp`、`onTouchCancel` 和其他离散事件保留顺序。拖拽位置应使用 `pageX/pageY` 相对按下点计算，并在 `onTouchUp` 应用最终坐标，避免累加移动回调次数。

## 滚动交接

通过 `touchAction` 声明子节点如何与最近的 `ScrollView` 共享手势：

- `"none"` 保留触摸流，不交给 ScrollView。
- `"pan-x"` 和 `"pan-y"` 声明可交接的方向。

系统在 down 阶段，根据命中路径和最近的 ScrollView 决定手势策略。手势开始后修改 `touchAction` 只影响下一次手势。当前内置 `ScrollView` 主要支持垂直滚动。原生滚动接管后，框架为活动 pointer 发送一次 `onTouchCancel`，不再发送该流的 move/up。

## 系统返回键

节点可以声明同步的 `onBackPress`。返回 `true` 表示消费事件。返回 `false` 后由宿主继续路由返回或系统默认行为。

完整宿主分发顺序见[返回键处理](../navigation/back-press.md)。
