# TypeScript / TSX 编写限制

AnseronUI 不是把任意 TypeScript 原样交给 JavaScript 引擎运行。共享页面先经过本项目的 TSX lowering，再经 scriptc 静态编译；**TypeScript 类型检查通过、浏览器参考宿主可运行，都不等于对应代码能编成三端产物。**

## 版本与资料适用范围

核对日期：2026-11-08。本项目固定 scriptc **0.4.8**、源码提交 `3d1888ae5e82a01434edd49f59bff5fab7c5a9c7`，并应用仓库的 `async-embedding.patch`。布局使用经适配的 Flexily 0.8.5。

上游参考：

- [scriptc 语言与运行时限制](https://scriptc.dev/docs/limitations)：语言写法和与 Node 行为不同的地方；
- [scriptc Node.js API 兼容表](https://scriptc.dev/compatibility)：按 API 查看状态和验证依据；
- [固定提交的限制文档源码](https://github.com/vercel-labs/scriptc/tree/3d1888ae5e82a01434edd49f59bff5fab7c5a9c7/docs/content/limitations)：用来区分网站后续更新与本项目实际版本。

官网会更新，不能直接把网站新增支持当成当前项目已支持。本指南还核对了本地 compiler 的 library 准入规则、框架补丁、UI compiler 与宿主实现；升级编译器后应重新检查。

## 四层限制要一起看

| 层次 | 本项目要求 |
| --- | --- |
| AnseronUI TSX | 自己的函数组件、Hooks 与 JSX lowering，不是 React 运行时 |
| scriptc 语言编译 | 类型必须能映射到可用的原生表示；支持的是 TS/JS 子集，不是完整 Node |
| library / Wasm embedding | 本项目走静态 library 模式，并启用专用 async 补丁；不是带完整事件循环的 Node 可执行程序 |
| 平台宿主 | 网络、计时器、文件/设备能力等需由宿主提供；浏览器对象不在共享 Core 内 |

固定版 `compileLibrary` 使用 `static-only`。上游某些模式能回退到 dynamic slot，不代表当前产物也会回退；不要通过启用 Node island 绕过问题，本项目没有嵌入 Node/JS 引擎。

## TSX 与 Hooks 的明确限制

| 写法 | 当前规则 | 建议 |
| --- | --- | --- |
| `<View {...props} />` | 框架 lowering 报 `DYNAMIC_SPREAD` | 显式传入 `style={props.style}` 等已知属性 |
| `<div>`、`<input>` 等 DOM 标签 | 小写标签报 `DYNAMIC_TAG`；Core 也没有 DOM | 使用 `View`、`TextInput` 等组件 |
| 复杂动态标签、命名空间属性 | 不属于当前 JSX lowering 支持形状 | 使用显式命名的组件，必要时用条件分支选择整段 JSX |
| 条件、循环或嵌套回调里的 Hook | 会改变 Hook 调用顺序，报 `HOOK_NOT_TOP_LEVEL` | 在组件或自定义 Hook 顶层调用，把条件放入回调或返回值 |
| 模块顶层调用 `useState/useServices` | 报 `HOOK_OUTSIDE_COMPONENT` | 在函数组件或自定义 Hook 内获取 |
| React 专用组件/插件 | 不会因为语法相似就兼容 | 使用 `@anseronui/ui` API，先移植依赖的运行时语义 |

这些是本项目 [UI compiler](../packages/ui-compiler/src/index.ts) 的约束，不等于 scriptc 原生 JSX 功能的全部范围。JSX 属性展开受限，也不等于所有普通对象展开都被禁用。

```tsx
import { Button, View, useState } from "@anseronui/ui";
import type { Style } from "@anseronui/ui";

function CounterCard(props: { style?: Style; initial: number }) {
  const [count, setCount] = useState(props.initial);
  return <View style={props.style}>
    <Button title={String(count)} onClick={() => setCount(value => value + 1)} />
  </View>;
}
```

## TypeScript 写法与改写方向

下表列出对业务常见的影响，不是每个 scriptc API 的完整限制清单。

| 场景 | 边界 | 更稳妥的写法 |
| --- | --- | --- |
| 结构化对象类型 | record 采用原生布局；不同字段集合的转换可能诊断，或复制为另一布局 | 保持明确稳定的对象类型，需要 DTO 时逐字段创建；不依赖宽窄类型转换后的引用相等或互相修改 |
| 联合类型 | `string` 与数组等不同表示混合时，操作前可能必须收窄；部分 union widening 不支持 | 先用 `typeof` 或判别字段分支，再访问相应成员 |
| 泛型 | 不是全面禁用；静态可解析的具体实例可以编译；嵌套泛型函数、泛型类表达式、需要动态分派的泛型方法有限制 | 泛型函数尽量放模块顶层，调用时给出具体类型；复杂动态分派改为具体函数 |
| `any` / `unknown` | 部分操作使用带运行时检查的原生值；并非任意 JS 行为都能编译，无法表示的静态槽位仍可能失败 | 外部数据用 `unknown`，校验/收窄后使用；不要用 `as any` 掩盖编译错误 |
| interface 与 class | 普通类继承和接口不是整体不支持；具体接口视图、成员表示、动态方法特化仍可能受限 | 使用明确实现的接口和可静态解析的方法；遇到诊断保留最小复现，不泛化成“不能 extends” |
| 脱离实例的方法 | 使用 `this` 的方法直接作为回调、借给无关对象，可能诊断或失去合法接收者 | 用 `() => instance.method()` 保持接收者，不依赖运行时混入和方法替换 |
| 动态属性操作 | 异构字段的动态索引与写入可能无法映射为一致布局 | 同类数据使用明确值类型的 Map/字典；异构字段用分支分别处理 |
| JSON | scriptc 的 `JSON.parse` 类型为 `unknown`，不能靠 TypeScript 断言证明输入正确 | 校验字段后转为业务类型；Module 边界只传 JSON 值，不传函数、原生实例、BigInt 或循环引用 |
| 生命周期 | 不应把资源释放依赖于 GC finalizer；上游 `WeakRef` 不支持，`FinalizationRegistry` 清理回调不执行 | 使用 effect cleanup、原生 `dispose/destroy` 和明确取消函数 |

例如联合类型在操作前收窄：

```ts
export function itemCount(value: string | string[]): number {
  if (typeof value === "string") return value.length;
  return value.length;
}
```

上游还记录了字符串、日期、排序、数组边界和 API 重载的行为差异。对这些语义敏感的业务，按固定版本对应小节核对并补目标平台测试；不要把“能编译”当成全部 Node 行为一致。

## 不能在运行时编译或加载任意 JS 源码

- `eval`、`Function` / `new Function` 不能成为执行动态业务代码的方式；上游以抛出错误等方式拒绝源码生成执行。
- 运行时计算的 `import(path)` 不是动态加载新页面的机制。上游支持的部分字面量 import 针对已纳入编译图的模块，仍需经过 AnseronUI 的 staging 和当前 library 模式检查。
- 不依赖 Node `vm`、`.node` 原生 addon 或 Node island 在共享 Core 内加载新实现。平台能力通过 Module/原生组件扩展。

因此，新增 TSX 页面要加入配置并编译；仅把文件拷贝到 App 资源目录不会让它执行。业务包如何独立编译、何时可复用 Framework Core，见[页面与 Core 合包](core-bundles.md)。

## 网络、计时器和 async 的特别说明

**业务可以使用 Promise 和 async/await。** 上游固定版文档中 library / Wasm reactor 的默认 async-free 限制，已由本项目的 `async_embedding.version=1` 补丁定向扩展；不能据此说 AnseronUI 不支持 async，也不能反过来说补丁开放了所有 Node 异步 API。

| 需求 | 共享 TSX 使用方式 | 不应直接依赖 |
| --- | --- | --- |
| HTTP 文本请求 | `useServices().http.getText(url)` | Core 内直接 `fetch`、`node:http/https` 或 socket |
| 延迟与计时器 | `setTimeout` / `clearTimeout` 经 staging 适配，`useTimers()` 绑定页面，或 `useServices().sleep(ms)` | Node `timers` / `timers/promises`、`setInterval`、Timeout 对象方法 |
| 系统/文件/设备能力 | `useServices().invoke(module, method, args)`，各宿主实现 | 把 Node `fs`、进程、线程 API 当作跨端接口 |
| DOM 操作 | Web Renderer 或 Web Module 内实现 | 共享页面访问 `window`、`document`、HTMLElement |
| 动画 | `animation` 或节点 `animate()` | 在 Core 内自行用浏览器帧时钟逐帧驱动 |

全局 `setTimeout` / `clearTimeout` 是 AnseronUI 的编译适配，并非放开 scriptc 原生 Node timer 实现；详见[计时器](timers.md)。显式导入同名框架函数也可使用，局部/其他库的同名绑定不会改写。

生成器函数、Node 网络/流/进程/worker 等仍受 library 准入限制；Wasm 宿主也没有开放完整文件系统或 Node 环境。本项目统一把这些副作用交给宿主。

```tsx
import { Button, Text, View, useServices, useState } from "@anseronui/ui";

function LoadMessage() {
  const services = useServices();
  const [message, setMessage] = useState("未加载");
  return <View style={{ flexDirection: "column", gap: 12 }}>
    <Text>{message}</Text>
    <Button title="加载" onClick={async () => {
      try {
        await services.sleep(20);
        const text = await services.http.getText("/hello.txt");
        setMessage(text);
      } catch {
        setMessage("请求失败或页面已卸载");
      }
    }} />
  </View>;
}
```

服务请求随组件生命周期取消等待；宿主可通过取消函数停止实际工作。任意已经挂起的业务异步任务不能被强制回收，业务应处理 rejection、避免遗留永不结束的 Promise。

## 如何阅读兼容表和选择依赖

官方 compatibility 页面是 Node API 的实现与证据清单，不是 AnseronUI 平台白名单：

| 标记 | 应如何理解 |
| --- | --- |
| Supported | 对应实现有验证依据；仍须看具体重载、目标和运行模式 |
| Partial | 只有列明范围支持，必须读详情 |
| Refused / By design | 当前模式明确拒绝或按架构排除，需要改写/宿主适配 |
| Not implemented / Unreviewed | 尚未实现或未确认，不能作为已可用能力 |
| N/A | 该执行层不适用，不代表功能通过 |

例如 Node 可执行模式中的网络或计时器支持，不能绕过本项目 library 模式的拒绝规则。也不能用兼容表中的单个 API 状态推导一个 npm 包整体可用。

业务依赖除了类型定义，还需要检查其运行时代码、传递依赖、动态加载、浏览器/Node 假设与许可。`npm install` 成功和纯 TS 编写都不是跨端兼容证明。新增依赖后，应把实际使用路径纳入页面，执行目标 AOT 构建和行为测试；需要平台能力的库可以放到宿主 Module 一侧。

## 验证与排查

1. 先运行 `npm run typecheck:framework` 和 `npm run test:framework`，排除框架类型与参考行为问题。
2. 把页面/共享源码加入应用配置，执行 `npm run anseronui -- build <ios|android|web> --config <配置路径>`。目标平台构建才会检查相应 library/Wasm 边界。
3. lowering 报错先查 JSX/Hook；scriptc 报错从第一个诊断和源位置查起，避免只修后续级联错误。
4. 在最小页面复现，并在目标宿主验证。上游 `scriptc coverage` 可辅助分析，但普通 CLI 分析不等于本项目打过补丁的 library 构建通过。

框架根 `typecheck:framework` 默认包含 `examples/`，不自动覆盖任意新建 `apps/` 目录。业务应用如需独立类型检查，应自行维护包含对应页面的 tsconfig；CLI 的 `check` 主要验证配置，不是 TypeScript 或 AOT 检查。

本页依据的项目文件：[UI compiler](../packages/ui-compiler/src/index.ts)、[业务 profile](../packages/core/native/business.profile.json)、[async 补丁](../internal/toolchain/async-embedding.patch)、[编译器准备](../scripts/prepare-compiler.mjs)、[Wasm 宿主](../packages/render-web/src/wasm-runtime.ts)。准备编译器后还可核对本地 `library/prepare.ts` 的 `static-only` 与 `library/ir-policy.ts` 的准入规则。
