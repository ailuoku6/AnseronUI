# 编写页面

应用已经能运行之后，再改页面。创建步骤见[快速开始](quick-start.md)。

## 首页

`src/pages/home.tsx` 是第一个页面：

```tsx
import { Button, Text, View, definePage, useRouter, useState } from "anseronui/ui";
import type { UIElement } from "anseronui/ui";

export function Home(): UIElement {
  const router = useRouter();
  const [count, setCount] = useState(0);
  return <View style={{ flexDirection: "column", padding: 24, gap: 16, flexGrow: 1 }}>
    <Text style={{ fontSize: 24, fontWeight: "bold" }}>Hello</Text>
    <Text>计数: {count}</Text>
    <Button title="+1" onClick={() => setCount(value => value + 1)} />
    <Button title="打开详情页" onClick={() => { void router.push("details", { count }); }} />
  </View>;
}

export const homePage = definePage("home", Home);
```

`View`、`Text` 和 `Button` 是共享组件。`useState` 保存页面状态。`definePage` 的名字必须和配置里的 `name` 一致。iOS 安全区和 Android 系统栏背景跟随根 `View` 的背景色，内容留在安全区内。

改 `Button` 的 `title`，然后重新运行刚才的平台命令。组件和事件见[组件参考](../reference/components.md)。

共享页面不使用 DOM 或 React Native 组件。能写的语法见[TypeScript 与 TSX 限制](../reference/typescript.md)。

## 登记页面

`anseronui.config.json` 的 `pages` 决定哪些文件会进入构建：

```json
"pages": [
  { "name": "home", "source": "src/pages/home.tsx", "export": "homePage" },
  { "name": "details", "source": "src/pages/details.tsx", "export": "detailsPage" }
]
```

`export` 是文件导出的 `definePage` 结果。新增页面时，同时增加 TSX 文件和这一项。

## 第二个页面

生成工程已经包含 `src/pages/details.tsx`。首页的「打开详情页」调用 `router.push("details")`，详情页调用 `router.back()` 返回。

参数、返回栈和页面保留见[路由](../guides/navigation/routing.md)。

## 下一步

其余文档按页面、界面、能力、工程排在[文档目录](../README.md#指南)。

- 页面规则从[路由](../guides/navigation/routing.md)继续。
- 界面从[样式](../guides/ui/styles.md)继续。
- 设备能力从[系统服务](../guides/services/native-services.md)继续。
