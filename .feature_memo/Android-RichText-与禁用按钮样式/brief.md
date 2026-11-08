# Brief

## User Goal

- 修复 Android 组件页 RichText 不展示的问题。
- 让 disabled Button 与普通 Button 具有可见的禁用样式差异。

## Scope

- Android Renderer 的 spans 解码、RichText TextView 属性应用、Button disabled 视觉表现和回归测试。

## Non-Goals

- 不改变 Core RichText 协议格式；不重做 iOS/Web 的已有实现。

## Acceptance Criteria

- Core 发送的字符串化 spans 在 Android 显示完整文本和 span 样式。
- disabled Button 仍不可点击，并且 alpha/文字颜色与 enabled Button 不同。
- Android Renderer 单独仪器测试通过，Android APK 构建通过。

## Open Questions

- None confirmed.
