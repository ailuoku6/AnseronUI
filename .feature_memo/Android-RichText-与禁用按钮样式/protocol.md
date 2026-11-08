# Protocols and Contracts

## API Contracts

- `RichTextProps.spans` 在 Core 到 native 的 RenderProps 中编码为 JSON 字符串。
- `ButtonProps.disabled` 为 boolean；false/缺省为 enabled，true 为 disabled。

## Data Models

- spans 字符串示例：`[{"text":"粗体","fontWeight":"bold","color":"#275de5","clickable":true}]`；`clickable` 由 Core 根据 `span.onClick`/`onSpanClick` 生成。
- disabled 文本颜色为普通颜色的 45% alpha；disabled Button 视图 alpha 为共享 opacity 的 0.5 倍。

## Storage and Config

- None.

## Compatibility Notes

- Android 同时接受直接 `JSONArray` 和字符串化 JSON，兼容 Renderer 直接调用和真实 Core transport。
- iOS 已经按字符串解析 spans，本次不修改。
