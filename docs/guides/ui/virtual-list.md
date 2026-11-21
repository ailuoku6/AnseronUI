# 可变高度虚拟列表

`VirtualList<T>` 适合纵向长列表。它只挂载视口和预渲染区域内的行，使用实际布局结果更新行高，不要求所有行等高或预先知道高度。文本换行、展开/收起、异步内容变化都会重新测量。

```tsx
import { Text, View, VirtualList, useRef } from 'anseronui/ui';
import type { UIElement, VirtualListHandle } from 'anseronui/ui';

interface Row { id: string; text: string }
function Results(props: { rows: Row[] }): UIElement {
  const list = useRef<VirtualListHandle | null>(null);
  return <View style={{ flexGrow: 1, flexDirection: 'column' }}>
    <VirtualList<Row>
      ref={list}
      data={props.rows}
      keyExtractor={(row: Row) => row.id}
      estimatedItemHeight={80}
      overscan={240}
      renderItem={(row: Row) => <View style={{ padding: 12, flexDirection: 'column' }}>
        <Text>{row.text}</Text>
      </View>}
    />
  </View>;
}
```

原生/Wasm AOT 页面应显式写泛型实参 `<VirtualList<Row>>`，并给回调参数标明类型。完整示例见 [`examples/virtual-list/page.tsx`](../../../examples/virtual-list/page.tsx)：5000 行不同长度文本、动态展开、头部插入和深处定位。

| 属性 | 语义 |
| --- | --- |
| `data` | 数据数组；更新、插入、删除和重排时传新数组 |
| `keyExtractor` | 稳定且唯一的字符串或数字 key；内部按字符串比较，`1` 和 `'1'` 视为重复 |
| `renderItem` | 渲染一行；行包装容器提供视口宽度，行高自然计算 |
| `estimatedItemHeight` | 未测量行的估计高度，默认 48，必须为正的有限数 |
| `overscan` | 预渲染距离下限，默认估计高度的 4 倍，必须非负；窗口还会结合视口大小和速度预测 |
| `layoutVersion` | 字体、行布局规则等发生全局变化时修改，使历史行高失效 |
| `style` | 滚动视口样式，默认占用纵向 Flex 的剩余空间，也可显式设置高度 |
| `onScroll` | 与 ScrollView 相同的偏移和内容范围事件 |
| `onError` | 接收内部滚动方法的宿主错误 |

列表需要有界的父级布局。默认 `height: 0`、`flexBasis: 0`、`flexGrow: 1` 和最小宽高 0，使视口参与 Flex 空间分配，避免被内容总高度撑开。需要固定高度时传 `style={{ height: 400, flexBasis: 400, flexGrow: 0 }}`。行间距应放在行内部 padding 或显式分隔内容中，行内容宜使用纵向容器。

`list.current?.scrollToIndex(index)` 使用前缀高度估算跳转，挂载目标区域后继续按实测高度修正，顶部对齐；末尾不足一屏时受合法最大偏移限制。`scrollToOffset(offset)` 按布局单位定位，自动截断到内容范围。返回 Promise 表示定位请求已经进入状态更新，不表示所有未测量行已完成布局。用户主动滚动会结束目标跟随。

测量缓存按 key 保存，插入和重排会保留已有测量。列表以当前首个可见 key 及其行内偏移为锚点，将累计高度补偿 `scrollAnchorOffset` 与行位置一起提交，由 Renderer 在同一次布局中叠加到最新滚动位置。测量修正不再排队执行绝对 `scrollTo`，避免回滑时拉回旧位置。显式定位仍使用 `scrollTo` 跟随目标。Android 还会以提交当时实际可见的原生行校正锚点，并平移惯性滚动的坐标原点以保留速度。视口宽度或 `layoutVersion` 改变会使旧行高失效；过期布局回调被代际标记拒绝。完全未测量的行仍使用估计值，因此总滚动范围在探索新区域时会逐步校正。

窗口在静止时也保留双向约两屏的预渲染距离；快速滚动时根据速度和提交延迟增加前进方向的距离，同时保留反向缓冲。窗口目标最多 32 行，若可见内容本身超过 32 行则优先完整覆盖视口。已有窗口的剩余空间足够时，单纯滚动不触发重新渲染；父组件更新和行高测量也会保留这批行。速度预测会扣除原生已应用的累计布局补偿，避免将补偿误判为反向滚动。

快速滚动期间，Android 宿主在 JSON 编码前、Core 在处理队列时都会将排队的连续 `scroll` 更新按节点合并为最新位置，避免逐个渲染已离开屏幕的区域。点击、输入等离散事件会分隔合并范围，保持操作顺序。原生滚动位置在跨线程传输时即使被新提交版本超越，仍会更新存活的滚动节点；已卸载节点的事件继续忽略。业务 `onScroll` 应处理最新位置，不应依赖每个中间偏移都收到回调。Android 滚动视口显式裁剪预渲染内容，屏幕外的行不会覆盖列表外的控件。

行离屏会卸载，其组件内部 Hook state 和 ref 不会长期保留。展开状态、选中项、编辑草稿等需要持久的数据应放入父级数据模型并按 key 保存。当前支持纵向单列；横向列表、瀑布流和粘性分组头不在此组件 API 中。

Android 的 VirtualList 惯性滚动还会检查已挂载行的边界：剩余距离不足两屏时，按剩余距离平滑减小本帧位移，窗口补齐后恢复正常推进。未消耗的距离不会积累成后续跳跃。这能在异步渲染暂时跟不上时避免冲入空白，代价是重负载下单次猛烈甩动的总距离可能变短；显式定位和普通 ScrollView 不使用这项保护。

Android 文本测量按一轮请求批量往返，另有 128 KiB 的原生文本测量 LRU，主题变化和销毁时清空。提交直接复用已解析的数据；不变节点不重复刷新绘制属性，内容尺寸不变时不重复请求布局。离屏普通文本/按钮可复用，分别最多保留 64/32 个原生控件；复用前清理样式状态与事件绑定，销毁 Renderer 时清空。输入框、媒体和自定义原生组件不进入复用池。

高度索引用 Fenwick 树实现，单行测量、偏移查找和可见范围查询为 O(log n)，数据数组重置为 O(n)。预渲染距离受行数目标约束，内存占用取决于每行节点复杂度和实际可见行数。
