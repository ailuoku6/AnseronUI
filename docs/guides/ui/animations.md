# 动画

AnseronUI 的动画采用状态到属性模型：Core 只提交目标样式、最终布局和动画参数，iOS 的 `CADisplayLink`、Android 的 `Choreographer`、Web 的 `requestAnimationFrame` 在平台端插值。动画期间不逐帧调用 TSX，不逐帧通过桥传输属性，也不逐帧运行 Flexily。

组件页右上角的「动画」提供声明式展开/收起、ref 串行与取消、延迟往返循环三个示例。完整代码见 `examples/components/animation-showcase.tsx`。

## 声明式动画

```tsx
const [expanded, setExpanded] = useState(false);

<View
  animation={{ duration: 600, easing: 'easeInOut' }}
  style={{
    width: expanded ? 180 : 80,
    height: expanded ? 120 : 80,
    opacity: expanded ? 0.65 : 1,
    translateX: expanded ? 40 : 0,
    borderRadius: expanded ? 24 : 4,
    backgroundColor: expanded ? '#e77736' : '#275de5',
  }}
/>
<Button title="切换" onClick={() => setExpanded(value => !value)} />
```

首次挂载直接呈现初始值；之后此节点的可动画属性或 Core 计算的 frame 变化时才启动动画。仅修改文字、事件、testID，或重新创建相同配置对象，不会重启动画。配置本身变化用于下一次属性变化。

`animation` 只作用于当前节点，不隐式继承到子节点。希望兄弟节点或子节点各自的 frame 平滑改变，需要分别配置 `animation`。改变父节点大小并不逐帧重算子节点布局；子节点布局由 Core 一次计算到终态。

## ref 命令式动画

```tsx
const box = useRef<NodeHandle | null>(null);

async function play() {
  const node = box.current;
  if (!node) return;
  try {
    const result = await node.animate(
      { translateX: 120, rotate: 180, opacity: 0.6 },
      { duration: 700, easing: 'easeInOut' },
    );
    if (!result.finished) return;
    await node.animate(
      { translateX: 0, rotate: 360, opacity: 1 },
      { duration: 900, easing: 'spring' },
    );
  } catch (error) {
    // 节点或页面在等待期间卸载时，沿用 ref 的 NODE_UNMOUNTED / 生命周期取消语义。
  }
}

<View ref={box} style={{ width: 56, height: 56, backgroundColor: '#275de5' }} />
```

- `animate(style, options?)` 返回 `Promise<{ finished: boolean }>`；自然结束返回 `true`，被新动画替代或显式取消返回 `false`。
- `cancelAnimation()` 取消当前节点的动画并保留当前画面，可用于停止无限循环。
- 同一节点只有一条动画时间线。新动画从当前显示值开始，旧 Promise 只完成一次。一次调用可同时改变多个属性；不同节点可以用 `Promise.all` 并行运行。
- 命令式动画是渲染端视觉覆盖，不修改 TSX state 或 Flexily 布局。普通重渲染不会清除覆盖；当 TSX 中相应属性的**声明值实际改变**时，会接管该属性。要复位可以再调用 `animate`；不能靠重新渲染相同的旧样式强制复位。
- 节点删除、页面销毁会移除帧回调并取消等待请求。业务串行动画须检查 `finished`，并处理卸载引起的 Promise rejection。

## 属性与参数

| 能力 | 支持方式 |
| --- | --- |
| 位置、宽高 | 声明式：Core 最终 `x/y/width/height` 的视觉插值；改变 flex、margin、padding 等可间接产生 frame 动画 |
| 透明度 | `opacity`，0～1 |
| 平移 | `translateX / translateY`，逻辑点 / dp / CSS px |
| 缩放 | `scaleX / scaleY`，默认 1，中心为原点 |
| 旋转 | `rotate`，角度，顺时针，中心为原点 |
| 圆角 | `borderRadius`，非负逻辑尺寸 |
| 背景色 | `backgroundColor`，跨端推荐 `#RRGGBB`；命令式目标严格使用该格式 |

所有 `CommonProps` 节点均可使用动画，包括通过扩展注册的原生组件外层。动画不自动改变原生组件内部私有属性。字体、文字颜色、边框颜色/粗细、媒体播放进度、ScrollView 滚动位置不属于本次属性动画范围；滚动继续使用 `ref.scrollTo(x, y, true)`。

| 参数 | 默认值与含义 |
| --- | --- |
| `duration` | 300 毫秒，每个单程的时长，允许 0（下一平台帧立即到终态）；最大 600000 |
| `delay` | 0 毫秒，仅整段动画开始前等待，最大 600000 |
| `easing` | `easeInOut`；可选 `linear / easeIn / easeOut / easeInOut / spring` |
| `iterations` | 1；正整数 1～10000，或 -1 持续循环直到取消 |
| `autoreverse` | false；true 时每个周期包含“前进 + 返回”，总时长是 `delay + duration × 2 × iterations` |

`spring` 是三端相同的阻尼振荡缓动预设，有轻微超调，在指定 duration 内结束；目前没有可调质量、阻尼、刚度的物理弹簧模型。透明度、颜色、圆角和尺寸在绘制时限制到合法范围。`duration: 0` 不能与无限重复组合。

`onLayout` 仍报告 Core 确认的**目标布局**，不是每帧的视觉位置。变换不会挤开其他节点。原生滚动容器以最终布局预留内容范围。系统可能在页面不可见、锁屏或后台时暂停帧回调；恢复后根据经过的时间更新。

## 当前边界

这是常用属性动画的首版：暂不提供子树动画作用域、单节点独立多轨时间线、关键帧、3D 变换、路径动画、暂停/恢复/seek，以及声明式结束回调。需要准确编排完成、取消与串行操作时使用 ref Promise API。布局宽高动画通过更新原生 view 的布局实现，比纯透明度/变换动画更昂贵，大列表中应优先使用变换。

协议 minor 已更新为 1.3；新增 `animation` 配置以 JSON 字符串放入 `SetProps`，新增变换为数值属性；命令式调用沿用 `__view` 模块，不新增逐帧协议消息。更新业务 bundle 时需要同时更新三端 renderer。

## 验证

- `npm run typecheck:framework`、`npm run test:framework`：类型与时间线单测。
- `npm run test:core:native`、`npm run test:core:wasm`：真实 AOT Core 中的动画配置、ref 请求/完成/取消与所有输出 frame 合法性。
- iOS `RenderViewTests.testAnimationFramesCancellationAndDisposal` 与 Android `RenderViewTest.animationFramesCancellationAndDisposal`：真实平台帧时钟、中间帧、终态、取消、重复、销毁。
- 两端 `SharedCoreUITests.testAnimationShowcase` / `SharedCoreTest.testAnimationShowcase`：完整组件页、桥调用与串行动画。
