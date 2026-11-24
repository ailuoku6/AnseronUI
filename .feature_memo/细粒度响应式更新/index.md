# 细粒度响应式更新

- Status: implemented；Harmony 真机验收待设备。
- Last updated: 2026-11-23。
- Workspace: TSNative。
- 用户要求：完整实现最终方案，保持现有 TSX/Hooks。

当前采用 Hook owner 调度、静态模板/动态槽、持久图、增量 Core ABI 3 和宿主协议 2.0。完整组件求值为安全基础，不提供 signal/computed 或任意表达式依赖追踪。

- 唯一实现合同：`internal/design/fine-grained-reactivity.md`。
- 实测结果：`internal/verification/fine-grained-reactivity-2026-11-23.md`。
- 当前清单：`implementation.md`。
- 接续：`handoff.md`；文件职责：`files.md`。
- `changes.md`、`decisions.md` 保留历史，历史 signal 设计已明确被兼容方案取代。

Harmony 没有连接设备，不能宣称五端设备验收全部完成。禁止把合成 Renderer 的 AOT 时延当作原生 UI 时延。
