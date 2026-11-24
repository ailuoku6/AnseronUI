# 文本尺寸测量

- Status: done
- Last updated: 2026-11-24
- Current focus: API、示例、文档和 JS/Wasm/AppKit 排版专项验证完成。
- Workspace: `TSNative`

## Document Map

- `../recording-preferences.md`: 记录偏好
- `brief.md`: 目标与验收范围
- `tech.md`: 实现边界
- `protocol.md`: API 与生命周期
- `files.md`: 文件入口
- `decisions.md`: 决策
- `changes.md`: 验证记录
- `handoff.md`: 恢复入口

## Latest Summary

- 提供 `useTextMeasurer()` 与 `useServices().measureText()`。
- 复用现有 MeasureRequest/MeasureResult，各宿主使用实际 Text 排版器。
- WebKit 的 JS 和真实 Wasm 测量值均与展开、折叠后 Text 高度一致。

## Next Actions

- 本轮实现完成。后续在配置 JDK17 后运行 Android 仪器回归；iOS/Harmony 按平台流程验收。

## Open Questions

- Android 设备在线，但本机未发现项目要求的 JDK 17；尚未执行新增 Android 仪器回归。
