# 决策

## 2026-11-10

- 第一阶段只持久化布局树，保留完整树 JSON 边界。这样保留现有 diff/ACK 的已提交树来源，降低迁移范围。
- 不重写 Flexily，不迁到 UI 线程；复用其脏节点和约束缓存。
- 测量缓存追踪记录实际使用的 key/value，placeholder 必须跨轮失效；否则持久化后会错误命中 0 尺寸缓存。
- 每个 runtime 有独立 Kernel，原生和 Wasm 额外导出 Framework.dispose，避免全局 JS 实例间共享 surface。
- 批量卸载在 Wasm 的数组所有权登记出现 Layout node belongs to another engine；LLVM 中嵌入 indexOf 的路径比较完整 i64 slot，而 Wasm 引用写入为 ptr32。最终改 Set 所有权登记，规避该路径且降低删除复杂度；未修改编译器上游。
- 临时用于显示原始 Wasm panic 的 adapter try/catch 已撤回，不纳入产品修改。
