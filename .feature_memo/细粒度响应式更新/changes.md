# 记录

## 2026-11-23

- 用户要求由可行性分析转为完整设计。
- 核对 Business visit/dispatch/ACK、Core 持久布局与 diff、compiler lowering、Core ABI、宿主协议上限和 Renderer 整表处理。
- 完成主设计与内部索引，创建本 memo。
- 设计审阅补充 helper 读取追踪、cell version/writeEpoch、Program/TypeChecker、computed 相等传播、布局 abort 修复及 reset baseline/旧事务拒绝。
- 验证：10 份文档的空白、末尾换行、代码围栏检查通过；17 个本地 Markdown 链接有效；主设计 17 节与 8 份 memo 完整；`git diff --check` 通过。
- 未执行运行时测试，未修改运行时代码；编译、布局、性能与真实宿主结果均不作已通过声明。
- 未验证工程项见主设计第 17 节。
- 下一步：后续实施任务从 AOT 探针开始，按统一目标完成全部工作包。

## 2026-11-23 设计审查

- 用户要求核对上述方案。
- 新增 `internal/design/fine-grained-reactivity-review.md`，记录 4 项 P1 和 3 项 P2；原方案正文未改写，问题待后续修订。
- 通过现有 TestHost 的 3 个 stdin 探针确认：条件同类型组件保留状态和 nodeId；受控输入值相同时仍回传 inputRevision；干净父组件无 deps effect 不因子状态更新重跑。
- computed 配置隔离、prop binding 调度闭合、多轮 frame 及 reset 生命周期属于尚未实现合同的时序审查，非新实现实测。
- 后续优先解决审查问题，再冻结 compiler/ABI 接口；先前“完整设计已完成”不代表方案已通过正确性审查。

## 2026-11-23 最终方案调整

- 用户确认保持现有 TSX/Hooks，并要求产出最终方案。
- 重写主设计为 17 节兼容方案；移除公开 signal/computed 和全局 MVCC。
- 明确组件逻辑求值、模板与动态槽、保守纯计算缓存、prop/Context 队列闭合、身份透明。
- 补齐输入独立同步、跨 round frame、reset effect/ref 重建、两类 oracle 与对应硬断言。
- 审查报告标为历史依据，R1–R7 在主设计有处置映射；同步内部索引和全部当前 memo 摘要。
- 当前只改文档；设计正确性审阅与文档校验不等同新运行时/AOT/五端测试。
- 最终校验：11 份文档的代码围栏、末尾换行和空白通过；20 个本地链接有效；主设计 17 节和 R1–R7 处置完整；`git diff --check` 通过。未重跑无关运行时测试。

## 2026-11-23 完整实施

- 用户授权完整实现，落地 owner/模板/增量事务/布局/五端宿主/恢复/DevTools/构建与回归。
- 公共文档同步 ABI 3、宿主协议 2.0、字段补丁与物理树恢复的 effect/ref 合同。
- 真实 Native/Wasm AOT、iOS 模拟器、Android 真机、AppKit、WebKit 和 Harmony API 21 构建分别验收。
- Harmony 无连接设备；精确证据与边界见 `internal/verification/fine-grained-reactivity-2026-11-23.md`。
