# App 开发手册

本手册带你从空工程走到可运行的跨端 App。按顺序完成各节。遇到平台细节时，再打开对应参考文档。

## 1. 选择工程方式

新项目使用独立 App 工程。框架仓库尚未发布 npm 包时，从仓库根目录运行：

```sh
npm run prepare:compiler
npm run anseronui -- create ../hello-app --local-framework
cd ../hello-app
npm run setup
```

独立工程把页面和平台宿主放在同一个目录。开发时主要修改 `src/`。需要把页面嵌入已有 iOS、Android、macOS 或 Web 工程时，使用 `integrate` 流程。两种方式的依赖和宿主要求见[工程创建与接入](tooling.md)。

## 2. 准备目标平台

先为要验证的平台安装构建工具。Node.js 24+ 和 npm 是共同要求。平台 SDK、JDK、Xcode、DevEco Studio、Zig 及最低系统版本见[环境要求](tooling.md#首次准备与创建)。

一次只需要准备当前要运行的平台。页面仍由同一份 TSX 代码构建，平台宿主负责原生视图和系统服务。

## 3. 认识生成工程

```text
hello-app/
├── src/pages/                 # 共享页面
├── anseronui.config.json      # 页面清单和构建配置
├── platforms/                 # 各平台原生宿主
├── web/                       # Web 入口和资源
├── assets/                    # 图片、视频和图标
└── package.json               # App 命令
```

页面清单中的每一项指定路由名、源文件和导出符号。只有已注册页面会进入构建。新增页面时，同时新增 TSX 文件并更新 `anseronui.config.json`。

## 4. 编写第一个页面

在 `src/pages/home.tsx` 使用框架组件构建界面：

```tsx
import { Button, Text, View, definePage, useState } from "anseronui/ui";
import type { UIElement } from "anseronui/ui";

function Home(): UIElement {
  const [count, setCount] = useState(0);

  return <View style={{ flexGrow: 1, flexDirection: "column", padding: 24, gap: 12 }}>
    <Text>计数：{count}</Text>
    <Button title="加一" onClick={() => setCount(value => value + 1)} />
  </View>;
}

export const homePage = definePage("home", Home);
```

页面由 `View`、`Text`、`Button` 等 AnseronUI 组件组成。`useState` 更新页面状态。`definePage` 把页面导出给页面清单。组件、属性和事件见[组件参考](../guides/capabilities.md)。

不要把 DOM 节点或 React Native 组件放入共享页面。框架编译 TSX 到原生宿主支持的操作。语法、第三方依赖和运行时限制见[TypeScript 与 TSX 限制](typescript-limitations.md)。

## 5. 组织页面与导航

按页面拆分文件，并在配置中登记：

```json
[
  { "name": "home", "source": "src/pages/home.tsx", "export": "homePage" },
  { "name": "details", "source": "src/pages/details.tsx", "export": "detailsPage" }
]
```

页面内调用 `useRouter()`，通过 `router.push("details")` 前往详情页，通过 `router.back()` 返回。路由参数使用 JSON 数据。页面保活和回收规则见[路由与页面生命周期](../guides/routing.md)。

## 6. 完成界面与交互

先使用框架组件和共享样式完成页面。然后按需要加入主题、动画、媒体、滚动和系统返回处理：

- 组件、事件和布局：[组件参考](../guides/capabilities.md)
- 主题、颜色和阴影：[样式指南](../guides/styles.md)
- 动画：[动画指南](../guides/animations.md)
- 图片和视频：[组件参考](../guides/capabilities.md#资源与媒体)
- 点击、触摸和手势：[事件与手势](../guides/interactions.md)
- 大型滚动内容：[虚拟列表](../guides/virtual-list.md)
- 系统返回键：[返回键处理](../guides/back-press.md)

页面共享布局和业务状态。平台差异只在框架能力或原生服务不一致时处理。各端 Renderer 和平台边界见[平台文档](../README.md#平台)。

## 7. 使用系统能力

使用 `useServices()` 访问 HTTP、存储、权限、文件、分享和设备服务。先检查该服务是否支持目标平台，再处理权限拒绝、取消和网络错误。服务 API 和平台差异见[标准系统服务](../guides/native-services.md)。

标准服务无法满足需求时，再编写平台 Module 或原生组件。扩展需要实现目标平台宿主代码，并为每个平台分别验证。见[原生扩展与插件](../guides/native-extensions.md)。

## 8. 检查并运行

每次改动后先检查配置和类型，再构建并在目标平台运行：

```sh
npm run check
npm run typecheck
npm run ios
```

用 `npm run android`、`npm run macos` 或 `npm run harmony` 验证其他原生平台。Web 使用 `npm run build:web` 和 `npm run dev:web`；页面修改后重新构建 Wasm，再刷新浏览器。

构建、设备选择、Release 和签名命令见[构建与运行参考](tooling.md)。平台实现与验证范围见[平台文档](../README.md#平台)。

## 下一步

- [API 与专题索引](../README.md#按任务查阅)
- [框架架构](../architecture/architecture.md)
- [平台 Renderer 与接入](../README.md#平台)
