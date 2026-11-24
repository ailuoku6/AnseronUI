# 需求

用户授权完整实现最终方案，保持现有 TSX/Hooks 写法。无需 signal/get/computed、包装组件或手工 memo。

实现范围为 Hook owner 调度、持久输出、编译模板/动态槽、增量 Core ABI 3、准确布局、五端宿主协议 2.0、事务恢复、构建/DevTools/SDK 与验证。

组件完整求值是兼容基础。静态宿主常量提升与动态槽消除输出遍历，不承诺任意 TS 表达式独立重算。状态、闭包、effect、key/type/位置身份保留。恢复保留 state/ref 容器，重建物理节点和 effect/ref 资源。

实现和验证详见 `implementation.md` 及 `internal/verification/fine-grained-reactivity-2026-11-23.md`。Harmony 缺少真机连接，只有构建与适配测试证据。
