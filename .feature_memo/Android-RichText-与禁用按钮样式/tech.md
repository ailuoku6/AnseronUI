# Technical Notes

## Current Approach

- `packages/core` 将 `spans` 作为 JSON 字符串放进协议的 scalar `RenderProps`。
- Android `richTextSpans()` 先接受原生 `JSONArray`，否则解析字符串；无效输入回退为空数组。Core 同时下发每个 span 的 `clickable` 标记。
- Android Button 通过 `ColorStateList` 为 disabled/enabled 提供不同文字颜色；`NodeAnimation.paint()` 对 disabled Button 乘以 0.5 alpha，同时保留声明式 opacity。点击 span 覆盖 `ClickableSpan.updateDrawState()`，避免 Android 默认 link color 覆盖 span 颜色。

## Key Constraints

- 协议 RenderProps 只允许 JSON scalar，因此不能假设嵌套 JSONArray 一定保留在 Android JSONObject 中。
- `NodeAnimation.commit()` 会重绘 alpha/background，disabled 视觉处理必须在动画绘制层合并，否则会被覆盖。

## Dependencies and Patterns

- Android Renderer 使用 `SpannableString`、`ForegroundColorSpan`、`StyleSpan`、`AbsoluteSizeSpan` 和 `ClickableSpan`。
- Android 仪器测试通过 `AndroidRenderer.applyJson()` 构造真实 TextView/Button。

## Risks

- 整套设备测试的 HTTP 页面断言需要测试 fixture 服务；未启动服务时 `testSharedPages` 会失败。
