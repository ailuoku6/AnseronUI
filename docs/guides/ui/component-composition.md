# 自定义 Hook 与组件组合

AnseronUI 支持函数组件、自定义 Hook、返回组件的高阶函数、组件属性、JSX 插槽、render prop 和 children。这些能力使用 AnseronUI 自己的组件运行时，并经过 scriptc AOT 编译，不依赖 React。组件不是可跨宿主 Module 边界传输的 JSON 值。

## 自定义 Hook

自定义 Hook 是以 `use` 加大写字母开头的普通函数，可组合框架已有的 Hook。在组件或其他自定义 Hook 顶层调用，保持调用顺序固定。

```tsx
import { Button, Text, View, useCallback, useMemo, useState } from 'anseronui/ui';

function useCounter(initial: number) {
  const [count, setCount] = useState(initial);
  const increment = useCallback(() => setCount(value => value + 1), []);
  const doubled = useMemo(() => count * 2, [count]);
  return { count, doubled, increment };
}

function Counter(props: { initial: number }) {
  const counter = useCounter(props.initial);
  return <View>
    <Text>{counter.count}</Text>
    <Button title="+1" onClick={counter.increment} />
  </View>;
}
```

不能在条件、循环、事件回调、effect 回调或普通嵌套回调中调用 Hook。自定义 Hook 使用调用者的 Hook 状态，每个组件实例彼此独立；effect 可返回清理函数。

页面感知主题变化同样可封装为自定义 Hook：在 effect 中使用 `useServices().appearance.subscribe()`，收到 `light` / `dark` 后更新 state，并在清理函数取消订阅。初始读取与订阅的完整写法见[主题文档](styles.md#页面读取与监听主题)。

## 高阶组件

可以把函数组件传给工厂，并返回新的函数组件。返回的组件应使用大写名称；其中可以有自己的 Hook。

```tsx
import { View, useState, Button } from 'anseronui/ui';
import type { Component, UIElement } from 'anseronui/ui';

interface CounterProps { initial: number; }

function withCard(Body: Component<CounterProps>): Component<CounterProps> {
  return function Card(props: CounterProps): UIElement {
    const [count, setCount] = useState(0);
    return <View style={{ padding: 16 }}>
      <Body initial={props.initial} />
      <Button title={String(count)} onClick={() => setCount(value => value + 1)} />
    </View>;
  };
}

// 在模块顶层创建，保持组件函数身份稳定。
const CardCounter = withCard(Counter);
```

不要在页面每次渲染时重新执行 `withCard(Counter)`，否则会创建新的组件类型并使子树状态重建。当前 JSX lowering 不支持 `<Body {...props} />`；请显式转发已知属性。上例验证的是明确 props 类型的 HOC，不能据此推断任意复杂泛型 HOC 或 React 库都能 AOT 编译。

## 组件、元素与渲染函数作为属性

三种形式都有各自用途：

| 传入值 | 示例 | 接收方用法 |
| --- | --- | --- |
| 组件函数 | `Content={Counter}` | `<props.Content initial={2} />` |
| 创建好的元素 | `header={<Text>标题</Text>}` | `{props.header}` |
| 渲染函数 | `renderFooter={(value: number) => <Text>{value}</Text>}` | `{props.renderFooter(2)}` |

```tsx
import { Text, View } from 'anseronui/ui';
import type { Component, UIElement } from 'anseronui/ui';

interface PanelProps {
  Content: Component<{ initial: number }>;
  header: UIElement;
  renderFooter: (value: number) => UIElement;
  children?: UIElement;
}

function Panel(props: PanelProps): UIElement {
  return <View style={{ flexDirection: 'column', gap: 12 }}>
    {props.header}
    <props.Content initial={2} />
    {props.renderFooter(2)}
    {props.children}
  </View>;
}

function Page(): UIElement {
  return <Panel Content={Counter} header={<Text>标题</Text>}
    renderFooter={(value: number) => <Text>{'值: ' + value}</Text>}>
    <Text>children 插槽</Text>
  </Panel>;
}
```

此处 `Counter` 使用上文定义。多个插槽子元素可以放入 Fragment；更广泛的 children 结构应按公开 Child 类型及 TSX 类型检查约束声明。render prop 是普通函数，不能直接在其中调用 Hook；需要状态时返回一个独立函数组件。用 JSX 创建组件，才能获得独立的组件状态和生命周期。

支持 `<Content />` 和 `<props.Content />` 这种标签形状；复杂属性链或运行时表达式应先赋给大写局部变量。动态切换组件类型时，旧组件会卸载，新组件重新初始化。React 的类组件、`memo`、`forwardRef`、Suspense 等不属于这里的兼容承诺；使用本框架明确提供的 API。

## 可运行示例和验证

组件实验室的 `07 · Hooks / HOC / Slots` 使用同一段代码验证以上形式：点击自定义 Hook 和 HOC 的按钮后，再触发父组件更新，两个计数均应保留。源码见 [composition-showcase.tsx](../../../examples/components/composition-showcase.tsx)。

回归入口为 `npm run test:framework`、原生 Core 的 `node scripts/test-native-core.mjs .verification/core-native/probe components`，以及安装最新构建后的 `node scripts/test-harmony-demo.mjs <device>`。目标平台 AOT 构建仍是确认 scriptc 支持边界的必要步骤。
