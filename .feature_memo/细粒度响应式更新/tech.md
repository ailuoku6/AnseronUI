# 当前技术摘要

唯一当前方案：`internal/design/fine-grained-reactivity.md`。

- Hook slot 增加 ownerComponentId；脏孩子集合/路径索引避免扫描所有兄弟。
- 编译器用 Program/TypeChecker 生成内部模板、组件输入槽、结构块、宿主字段槽；动态表达式保持原求值，通用纯计算 DAG 为可选优化。
- 用户实例身份与编译 site 分离，编译边界透明；可观察对象分配和闭包 identity 保留。
- 同步不可重入 Evaluate；输入先于子求值，任务处理到稳定。保留 pending watermark，不采用全局 MVCC。
- 组件/memo/capture/内部缓存 committed 与 draft 隔离；只在 ACK/Core Finalize 后发布。
- inputSyncDirty 独立于 state 相等，value/inputRevision 原子组防止同值过滤失败。
- Core 持久图与事务，transactionFrameCandidates 跨所有测量 round 合并，最终比较 committed frame。
- reset 保留逻辑 state/ref 容器，退役旧 handles，cleanup 后重建物理节点及所有 effect/ref 资源。
- 几何 oracle 与生命周期状态机分别验证；不能强制全量求值后比较 effect 日志。

## 验证边界

- record/closure/身份、模板回退、布局 collector、输入、恢复与消息预算已有回归；具体平台覆盖见独立验证记录。Harmony 真机仍缺设备。
- 设计无性能倍数承诺，不把组件求值下降作为唯一证据。
