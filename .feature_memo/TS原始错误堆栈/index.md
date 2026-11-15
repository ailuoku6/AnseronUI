# TS原始错误堆栈

- 状态：done
- 更新：2026-11-15
- 当前重点：实现及针对性验证已完成，接入说明见 `docs/diagnostics/error-stacks.md`。

## 文档

- [需求](brief.md)
- [技术实现](tech.md)
- [协议](protocol.md)
- [文件](files.md)
- [决策](decisions.md)
- [验证记录](changes.md)
- [交接](handoff.md)

原生和 Wasm 的真实 Release 产物已验证能够输出原始 TSX 行列。业务异常出口保留 stack，SDK 提供各端 onDiagnosticDetails。Native 信号崩溃和历史异步父链不在本次实现范围。
