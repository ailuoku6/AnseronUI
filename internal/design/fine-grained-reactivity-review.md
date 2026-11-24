# 细粒度响应式更新设计审查

日期：2026-11-23。范围：当时采用公开 signal 的目标方案、当前 Business/Core/Renderer 实现与最小 ReferenceRuntime 探针。

历史审查结论：当时方案发现 4 项 P1 正确性/兼容性问题与 3 项 P2 合同/验收缺口。本文保留反例和证据，以下位置编号指当时版本。

当前状态：用户要求保持现有 TSX/Hooks 写法，[最终方案](fine-grained-reactivity.md)第 17 节记录 R1–R7 的处置。公开 signal/computed 与全局 MVCC 不属于当前实现。实施及回归证据见[验证记录](../verification/fine-grained-reactivity-2026-11-23.md)；本文保留历史审查时的反例与判断。

P1 表示在大规模实现前需要解决。P2 表示必须纳入合同和测试，但不要求更换总体架构。未实现方案的缺口通过事件时序或反例分析确认，不冒充新运行时的实测 bug。

## R1 [P1] 受控输入需要独立于 signal 相等判断的回写失效

位置：目标方案第 4 节相等判断、第 13 节 inputRevision、第 15.2 节“set 相同值完全不启动事务”。

反例：

```tsx
const text = useSignal("7");
<TextInput value={text.get()}
  onChangeText={next => text.set(next.replace(/\D/g, ""))} />
```

用户输入 `7x`，原生文本已成为 `7x`，但过滤结果仍为 `7`。按 signal 相等规则不会触发绑定，宿主无法收到值校正和新 inputRevision。最终模型与界面不同。文档只要求“旧 patch 不覆盖新输入”，没有定义同值时谁触发校正。

当前代码会在处理 InputChange 时记录 inputRevision，重新生成 TextInput 属性时带回它。最小探针使用现有 useState 验证，即使过滤结果与原模型相等，仍产生 `value="7", inputRevision=1` 的 SetProps。这条能力不能因 signal 的同值跳过消失。

建议：增加受控节点的宿主输入 dirty 来源，与状态依赖失效独立。定义同一输入响应中的 `{value, inputRevision}` 配对，以及何时回写；PatchProps 只变 inputRevision 时也须运行受控 value 校正器。若业务异步决定值，明确接受输入与最终校正的时序。将“同值不启动事务”限定为没有宿主同步或其他失效的纯状态写入。

验收：过滤/拒绝输入返回原值、快速连续输入、旧事务 ACK、composition 中延迟校正，模型与可见文本均正确。

## R2 [P1] call site 和 branch 身份改变现有状态保留语义

位置：目标方案第 5 节 identity 与 branch 卸载规则。

反例：

```tsx
return <View>{flag
  ? <Counter label="a" />
  : <Counter label="b" />}</View>;
```

当前身份由逻辑路径/位置、key 和组件类型决定。切换 flag 时 Counter 仍在同一位置，状态保留。方案把编译 call site 纳入实例 identity，又规定离开分支卸载输出，因此两侧会变成不同实例，计数归零、effect 清理重建、ref 更换。不同编译回退路径还可能表现不同。

ReferenceRuntime 探针确认：Counter 更新到 7 后切换分支，节点 ID 不变、文本仍为 7、挂载 effect 仅一次、切换时 cleanup 为零。

建议：分离“编译重启位置标识”与“用户组件实例身份”。自动插入的 branch/binding 边界对现有位置/key/type 协调保持透明；结构块通过稳定输出 slot 协调同位置同类型实例。若决定采用新的分支身份语义，必须明确为编程模型破坏性变更，提供迁移规则和独立的兼容性验收，不能同时宣称保留现有语义。

验收：同类型条件两侧、同 key 两侧、helper 返回组件、未带 key 列表以及带 key 重排，在不同编译粒度下具有一致实例语义。

## R3 [P1] prop binding 产生的新组件失效没有在同一事务中闭合

位置：目标方案第 6.1 节“自定义组件动态 prop”、第 7 节调度步骤 4–6。

反例：`<Child value={count.get()} />`，Child 根据 value 选择不同子树。count 变化只使父级 prop binding 失效。文档先处理 component/结构作用域，再执行 binding；binding 执行后 Child 才变脏。此时组件队列已经处理完，方案没有规定回到组件协调阶段。

按一次顺序执行会使 Child 不更新或滞后一轮。父子同时变脏时，还可能先用旧 prop 执行 Child，再用新 prop 重跑，增加副作用/Hook 草稿覆盖风险。Provider 的动态 value 也有相同的拓扑要求。

建议：区分 input/prop binding 与 host field binding。prop binding 作为目标组件的输入前置任务，在该组件执行前求值；结构/Provider/输入变化持续入队，直到当前快照的工作队列为空才封闭草稿。按输入版本去重，不仅按“本轮已经执行”去重。终端 host binding 在相关结构和输入稳定后执行。

验收：只更新动态 prop、父子同脏、prop 改变分支、Provider value 绑定和多级 prop 链，都在一次事务提交最终结果。

## R4 [P1] computed 缺少 derive/capture 的草稿版本隔离

位置：目标方案第 4 节 factory 更新、第 7 节派生缓存独立提升、第 8 节按快照缓存。

反例：

```tsx
const total = useComputed(() => amount.get() * props.factor);
```

props.factor 可以来自 legacy useState 或组件输入，在 signal writeEpoch 没变时从 2 变为 3。相同 snapshotEpoch 对应不同计算器/capture。已有 computed 句柄还被已提交回调或其他 surface 使用时，新草稿不能直接替换其 factory。否则草稿尚未 ACK 或已经 abort，外部读取仍可能使用 factor=3。

文档规定新建 computed 在 ACK 发布，但没有规定已有 computed 的 factory、capture、缓存和依赖如何分版本。“纯缓存可独立提升”的例外也没有排除依赖未提交 props 的派生结果。仅按 signal 快照做版本区分不足。

建议：computed 配置采用 committed configuration + transaction overlay，包含 derive/captureVersion。缓存至少区分配置版本和读快照/依赖版本。事件读取已提交配置与最新信号值；草稿读取本事务配置与固定快照。只有基于已提交配置的纯派生缓存/依赖可独立提升。Abort 丢弃草稿配置，ACK 才发布。明确跨 surface 读取局部 computed 的所有权与失效范围。

验收：仅 props/legacy Hook 改变 derive capture、等待测量、其他 surface 读取、最终 abort/ACK，均不能泄漏草稿配置，也不能返回旧缓存。

## R5 [P2] 多轮测量缺少跨 round 的最终 frame 差分规则

位置：目标方案第 10 节 Prepared.changedFrames、第 11 节“本次计算”候选收集。

场景：同一事务中 A 的几何在第 1 轮已确定并改变，B 还需平台文本测量。第 2 轮 A 命中布局缓存，不再进入本轮候选集。ready=false 时不能提交命令；如果最终 ready 仅消费最后一轮 collector，就漏掉 A 的 SetFrame。

另一种场景是 A 在早期轮次有临时 frame，最后又回到原值。简单累积早期命令也会提交过期结果。文档虽然要求与已提交 frame 比较，但没有明确候选跨 round 累积，以及最终命令必须基于整个事务候选并集和最终几何值生成。

建议：Core 维护 transactionFrameCandidates，跨所有 round 合并候选。ready 时读取最终工作树值，与 baseRevision 的已提交 frame 比较，生成最终差分。Business 的草稿 frame 也使用同一结果；中间几何不能触发宿主命令或 onLayout。ACK/Abort 后清空该集合。

验收：A 第一轮变化、B 后续测量，以及 A 临时变化后恢复原值两种情况，最终宿主 frame 和 onLayout 与全量几何结果一致。

## R6 [P2] 物理重建后的 effect 与 imperative handle 恢复规则缺失

位置：目标方案第 13 节保留逻辑组件、旧 handles 失效、effect 不无条件重跑。

现有 useImperativeHandle 基于 useEffect 实现。业务可以在其 create 中捕获 `nodeRef.current`，向父组件提供固定 handle。reset 后直接节点 ref 绑定新 handle，但 deps=[] 的 imperative effect 不重跑，父组件仍持有失效 handle。通过普通 effect 建立的原生节点资源也可能丢失且无法重新建立。

“不无条件重新运行”是合理约束，但缺少哪些 effect 必须恢复、如何识别、cleanup 与 ref 的顺序。不能指望仅凭依赖数组识别 effect 是否拥有原生资源。

建议：明确选择可执行的恢复合同。可采用保留状态、重新挂载 effect/ref 的受控恢复，并声明恢复 effect 的幂等要求；也可引入独立 host attachment 生命周期、重新创建 imperative handle，并为普通 effect 的节点依赖制定限制与迁移规则。不能由五个平台各自决定。保留旧 handles 失效合同，不通过静默重定向隐藏节点重建。

验收：捕获 NodeHandle 的 useImperativeHandle、effect 初始化的原生资源、模块订阅和 cleanup，在 reset 后均有明确且一致的结果。

## R7 [P2] 强制全量求值不能作为完整生命周期 oracle

位置：目标方案第 15.1 节全量 oracle。

增量路径有意不执行干净组件，强制全量执行会重新创建事件闭包，也会重跑没有 deps 的 effect。即使增量实现完全正确，两边生命周期日志仍可能不同。当前 ReferenceRuntime 已经跳过干净组件，该问题并非新增 signal 才存在。

最小探针确认：Parent 的 `useEffect(() => ..., undefined)` 在 Child 自身状态更新后仍只执行一次。若强制 Parent 求值，提交会再运行该 effect，无法与正确增量路径逐条比较。

建议：拆成两个 oracle。几何/宿主 oracle 消费同一逻辑输出，使用全量同步和 diff 验证最终节点/props/frame。反应性与生命周期 oracle 使用明确的状态机和期望 scope invalidation，验证实例身份、事件捕获、effect/ref 顺序及故障行为。若使用全量求值参考，只对无生命周期副作用的纯 fixture 比较输出。

验收：干净父组件的无 deps effect、子节点绑定更新、事件普通值捕获、条件卸载和失败恢复，分别具有精确断言。

## 其他设计取舍

- 完整 MVCC 状态历史和 Core 布局逆日志不是错误，但增加实现与验证成本。当前求值同步完成、测量期间不读业务状态，应论证哪些实际路径需要保留旧 signal 版本；不能仅因为借鉴 Compose 就预设相同复杂度。
- useMemo 的 signal 读取目前按“订阅组件但仍只看 deps”定义。`useMemo(() => s.get(), [])` 会触发组件重启却继续返回旧值。这可以作为显式 deps 的既有语义，但必须明确说明并诊断建议使用 useComputed，避免让使用者以为读取追踪会自动更新 memo。
- 既有 props/Context 相等判断使用 Object.is。AOT 对象表示探针不仅需验证可编译，还需验证 identity、callback capture、跨具体 record 类型传递后的行为。

## 验证记录

- 阅读并对照目标方案、BusinessRuntime、Core 合同/布局、Web Renderer、UI Hook 实现和 staging。
- 使用 `node --import ./scripts/bench-loader.mjs --input-type=module` 的临时 stdin 探针，通过现有 TestHost/ReferenceRuntime 验证三个现状：条件同类型组件保留状态、同值受控输入回写、新增子更新不重跑父 effect。
- 探针输出：Counter=7、同一 nodeId、mounts=1、cleanups=0；输入校正 value=7/inputRevision=1；Parent effect 次数=1。
- 未实现新方案，未执行新状态图、compiler、ABI 3 或五端新协议测试。R3–R6 的风险来自合同与时序审查。

历史建议修订顺序：先确定实例兼容性和 prop/结构调度闭合，再确定配置隔离、输入同步及恢复生命周期，最后补多轮几何累积与正确的 oracle。当前处理结果以最终方案第 17 节为准，实施时仍需逐项验证。
