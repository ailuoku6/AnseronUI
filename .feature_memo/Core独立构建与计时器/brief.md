# 目标与验收

用户要求实施独立 Core/业务包，并支持共享 TS/TSX 的 setTimeout。
验收：业务源码变化不触发 Framework Core 编译；两份真实产物通过版本化消息协作；现有组件、Hooks、事件、ref、路由保持行为；计时器支持取消和页面退出自动清理；验证 native/Wasm 运行与移动目标构建。
