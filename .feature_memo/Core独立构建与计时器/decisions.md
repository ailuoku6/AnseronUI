# 决策

## 2026-11-08 - 以纯数据 kernel 为预编译 Framework Core

- 决策：内核拥有 Flexily 布局、text measure 规划、frame 和 render diff；业务侧拥有 Hooks/组件求值/closures/ref/effects/业务 state。
- 原因：Hooks 泛型值和业务闭包不能作为安全的 scriptc ABI 对象跨 archive 传递；JSON 消息适用于原生 C 和 Web 独立 Wasm memory。
- 影响：业务 SDK 按 bundle 重编；稳定 kernel 可以缓存。消息不提供热更新；有 JSON marshal 和复制开销。
- 原生 localize_runtime 隔离符号并由 facade 顺序进出；Web 每层一个 Wasm instance。

## 2026-11-08 - 以宿主 Module 承载计时器

- 决策：不开放 scriptc Node timer/事件循环。计时器通过已有 timer.sleep/CancelRequest，使用数字句柄，页面 dispose 清理。
- 原因：同一业务 API 可在 iOS Dispatch、Android Handler、Web setTimeout 上调度，且可以丢弃迟到结果。
- 影响：只支持回调形式 setTimeout/clearTimeout；多页面异步作用域不明时用 `useTimers()`。
