# 决策

## 2026-11-23：完整目标架构

- 采用：显式 signal 读取 + compiler 重启作用域/属性绑定 + 持久图 + Core 增量事务 + 宿主字段 patch。
- 理由：仅减少组件执行不能消除整树遍历、跨库序列化和宿主冗余命令。
- 替代：只加 memo、只修 MoveChild、Proxy 深追踪、完全取消结构协调，不作为本需求目标方案。
- 影响：ABI 与宿主 major 升级，五端同步落地，AOT/布局/故障测试是交付门槛。

## 2026-11-23：兼容与安全粒度

- 保留 useState/useReducer 原值快照与 watermark；不自动改写成 signal。
- 普通函数/捕获不能证明安全时用组件作用域，保证原求值语义。
- computed 相等值不通知下游；不提供自定义 equality。

## 2026-11-23：提交确认

- 采用宿主 ACK → Core Finalize 确认 → Business 发布 → 生命周期。
- 理由：跨库持久图必须有明确已提交基线，UI 失败不能污染下一次局部更新。
- 影响：增加内部确认往返；需幂等、超时查询和 reset 屏障。
- 恢复保留逻辑组件状态，重建物理节点；旧事务拒绝下界防止迟到消息重放。

## 2026-11-23：最终方案保持现有 TSX/Hooks（取代上述 signal 相关决策）

- 用户选择：不改变 TSX 写法，调整产出最终方案。
- 采用：Hook owner 定向调度 + compiler 静态模板/动态槽 + 安全纯计算优化 + 持久图 + 增量 Core/宿主。
- 移除：公开 signal/computed/get、运行时读取图、全局 MVCC。保留 pending queue/watermark，同步完成 Evaluate。
- 原因：保留业务心智模型与可观察语义；优化主要整树成本，不以任意 TS 自动局部求值为前提。
- 身份：call site 只用于编译定位；内部边界对逻辑位置/key/type 透明。
- 受控输入：独立 inputSyncDirty，value/inputRevision 原子回写；同值不能漏校正。
- 恢复：选择保留 state/ref 容器、重新建立所有 effect/ref 资源，取代不重跑 effect 的不完整规则；恢复副作用不承诺 exactly-once。
- 验证：几何/宿主 oracle 与生命周期状态机分开，R1–R7 设计处置详见主设计第 17 节。
