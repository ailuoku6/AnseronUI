# Handoff

从 `index.md` 恢复。本次参考本地 KuiklyUI 文档及 TextShadow 实现，已实现 useTextMeasurer()/Services.measureText。

关键入口是 `packages/ui/src/text-measurement.ts` 与 `packages/core/src/business-runtime.ts`。测量复用既有 MeasureRequest/MeasureResult，不挂载节点。text/fontSize 必须同步带入 props 以适配 Android setProps；Android 0行已统一为不限行。

组件页新增 TextMeasurementShowcase，真实 WebKit JS/Wasm 排版与 Text 高度对照均通过。框架321项、构建20项、工具31项和 native/wasm Core 五页回归通过。

`npm run test:macos -- --text-measurement` 已通过，实际原生 Text 折叠/展开高度均与测量一致。本轮实现完成。Android 仪器测试缺 JDK17，勿宣称通过；iOS/Harmony 尚未执行设备验证。所有构建共享 staging 必须串行。

工作区原有 app skills/template/SDK packaging 变更不属于本需求，不要覆盖。
