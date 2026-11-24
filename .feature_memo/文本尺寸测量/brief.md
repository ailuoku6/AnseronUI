# Brief

## User Goal

- 参考 KuiklyUI 文本尺寸测量，为 AnseronUI 提供业务可调用工具。
- 参考源码：`/Users/ailuoku6/kuiklyProject/KuiklyUI`，`docs/DevGuide/text-measure.md`、TextShadow、Shadow。

## Scope

- 纯文本宽高、宽高上限、字体样式与行数限制。
- 生命周期清理、并发响应、参数校验、组件页展开/收起示例与公开文档。

## Acceptance Criteria

- 不挂载隐藏 Text，不依赖业务 ref，测量走现有平台排版器。
- Web/Wasm 和原生 AOT 可编译；实际排版测量与 Text 高度一致。
- 组件卸载和页面销毁时拒绝请求；render 中禁止调用。

## Non-Goals

- 本次不加入 RichText spans、Canvas 字形边界、字体族、字间距和行间距。
