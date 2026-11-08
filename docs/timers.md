# 跨端计时器

共享业务 TS/TSX 已支持 `setTimeout(callback, delay)`、`clearTimeout(id)`，以及通过 `useTimers()` 获取页面绑定的计时器。iOS、Android 和 Wasm 业务包使用同一实现，实际等待由平台宿主完成。

## 基本使用

```tsx
import { Button, Text, View, definePage, useEffect, useState } from "@anseronui/ui";

function Home() {
  const [message, setMessage] = useState("等待中");
  useEffect(() => {
    const id = setTimeout(() => setMessage("一秒到了"), 1000);
    return () => clearTimeout(id);
  }, []);
  return <View><Text>{message}</Text></View>;
}
export const homePage = definePage("home", Home);
```

AOT staging 会把业务目录内未被局部声明或 import 遮蔽的全局 `setTimeout` / `clearTimeout`（包括 `globalThis.setTimeout` / `globalThis.clearTimeout`）绑定到框架实现，`.ts` 工具模块也会处理。对象方法和局部同名函数保持原样，不通过文本查找替换改写变量。

也可以显式导入；这对直接在 JavaScript 参考宿主执行的页面尤其重要，因为未经过 staging 的浏览器全局函数仍然是浏览器自己的计时器：

```ts
import { setTimeout, clearTimeout } from "@anseronui/ui";
```

## async 与多 surface

在组件中获取 `useTimers()` 可以明确绑定页面，即使调用发生在 `await` 之后：

```tsx
import { Button, useTimers } from "@anseronui/ui";

function Action() {
  const timers = useTimers();
  return <Button title="稍后执行" onClick={async () => {
    await Promise.resolve();
    timers.setTimeout(() => { /* 更新页面状态 */ }, 20);
  }} />;
}
```

事件、effect、ref、布局回调和计时器回调会带入所属页面的同步作用域。作用域之外若只有一个活动 surface，可使用该页面；多个 surface 同时活动且异步调用没有可确定的作用域时，全局接口会报 `TIMER_SCOPE_REQUIRED`，此时应使用提前获取的 `useTimers()`，避免把任务交给错误页面。通用原生壳的各页面运行时分别隔离。

## 行为与生命周期

- 返回不透明的数字句柄；使用 `clearTimeout` 取消，不使用 Node 的 `ref/unref/refresh`。
- 延迟单位为毫秒，默认 0；负数/非有限数归为 0，小数取整，上限为 2,147,483,647。
- 即使延迟为 0，也通过宿主事件队列异步回传；不在 `setTimeout` 调用栈中同步触发。
- 回调只触发一次，取消和触发后再次清理均安全。取消后迟到的宿主结果会被忽略。
- 页面销毁时自动取消该页面所有未触发计时器；组件局部卸载仍建议在 effect cleanup 中清理。
- 回调异常输出 `TIMER_ERROR` 诊断。已经开始执行的回调/Promise 无法由 `clearTimeout` 中断。
- 不允许在组件 render 过程中创建计时器，避免渲染重试重复产生副作用；应在事件或 effect 中创建。
- 页面尚未创建的模块初始化阶段没有计时器所属页面，不应启动全局计时任务。

目前接口支持无参数回调；需要传参时用闭包 `setTimeout(() => work(value), 100)`。不支持字符串源码回调、`setInterval`、`node:timers`、`timers/promises` 或 Node Timeout 对象。原有 `useServices().sleep(ms)` 继续可用。

## 实现与示例

业务侧保留 callback 和数字句柄，发送已有 `timer.sleep` Module 请求；宿主超时后发送 `ModuleResult`，回调在业务 owner thread/事件循环执行。取消发送 `CancelRequest`，页面 generation/requestId 防止迟到回调污染新页面。此机制无需启用 scriptc 的 Node 事件循环。

运行默认示例的 `timers` 页面可以体验启动、取消和 await 后调度。源码：[页面](../examples/timers/page.tsx)、[计时器 API](../packages/ui/src/timers.ts)、[编译适配](../scripts/lower-timers.mjs)、[业务运行时](../packages/core/src/business-runtime.ts)。

验证命令：`npm run test:framework` 检查计时器及生命周期；`npm run test:core:native` / `npm run test:core:wasm` 覆盖真实 AOT 业务页；构建 Wasm 后，macOS 可用 `npm run test:browser:split` 验证两个 Wasm 经宿主真实计时器更新 DOM、取消和退出清理。WebKit 测试需要系统图形/窗口服务，运行器会创建测试窗口以避免隐藏页暂停计时器。
