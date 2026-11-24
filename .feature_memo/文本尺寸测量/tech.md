# Technical Notes

## Current Approach

- `packages/ui/src/text-measurement.ts` 提供类型与参数预处理。
- BusinessRuntime 的 Services facade 提供绑定 surface/owner 的异步函数。
- 保留独立 nodeId，只用于响应匹配，不创建 render node。
- 复用 surface.modules 存储待处理 Promise，借用现有卸载、销毁、renderer reset 清理。
- 通过 measureNodeId 区分测量与 ModuleResult，避免不同响应类型误完成 Promise。
- 复用 iOS UILabel、Android TextView、macOS TextKit、Harmony MeasureUtils 与 Web DOM 测量。

## Key Constraints

- 原生测量属性必须包含 text 和 fontSize；Android setProps 会覆盖事先设置的内容/字号。
- Android numberOfLines=0 归一化为 Int.MAX_VALUE，保证不限行与其他宿主一致。
- Core 各平台构建共享 staging，需串行。
- 不新增协议消息或 ABI；maxHeight 在业务侧裁剪返回高度，不改变换行。

## Risks

- 宿主字体、字体缩放、宽度取整存在平台差异。
- 本次没有公共自动缓存；业务复用结果，并在内容、宽度或字体环境变化时重测。
