# 路由参数与页面状态保留

- Status: done
- Last updated: 2026-11-10
- Current focus: 四端按路由条目缓存页面实例，返回时恢复原 Hook state 并读取各自参数。
- Workspace: `/Users/ailuoku6/web_project/TSNative`

## Document Map
- `../recording-preferences.md`: 记录偏好
- `brief.md`: 需求与验收
- `tech.md`: 页面栈实现
- `protocol.md`: 路由 API 与参数
- `files.md`: 重要文件
- `decisions.md`: 决策
- `changes.md`: 验证
- `handoff.md`: 续接

## Latest Summary
- Router API 已支持 `push/replace(page, params?)` 与 `getParams<T>()` JSON 快照。
- iOS、macOS、Android 按栈条目保留 Host/Root；Web 使用 `BrowserPageStack` 保留 Host/root。
- 已添加 Counter/AsyncForm 与脚手架传参与状态保留示例。

## Next Actions
- 无。可在实际设备集成后观察返回手势和长期运行内存占用。

## Open Questions
- None
