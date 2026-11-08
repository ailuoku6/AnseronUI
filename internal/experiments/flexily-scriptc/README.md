# flexily 的 scriptc 静态布局原型

本目录是技术验证源码，基于 flexily 0.8.5 的固定提交 `4850f1fb475f8147458059b45fb4f148d14a6ab4`，保留上游 MIT 许可。它验证的是底层 `Node` 布局 API、长度表达式与指定回调路径，不是整个 flexily 包、插件系统或 AnseronUI 框架的生产实现。

## 结果与入口

原版源码在前轮探针中未通过静态编译；本轮仅改写 flexily，在 `dynamic: false` 下生成 LLVM IR 和 macOS arm64 原生 executable。未修改 scriptc compiler/runtime，未使用 dynamic island 或 JS 引擎。compiler、LLVM helper、runtime pack 均为 0.2.1，helper 为 LLVM 22.1.8；helper/runtime pack 仅安装在临时验证目录，通过 Node 模块解析钩子选择匹配的官方包，没有关闭版本校验。

使用 [静态入口](src/index-scriptc.ts) 导入 `Node`、常量、`parseLength` 与基础类型。该入口不导出 `createFlexily()`、插件和终端文本测量服务。

- [扩展布局探针](probe-layout.ts)：wrap、RTL、padding/margin/gap、grow/shrink、dirty/cache/remove、measure/baseline、百分比、绝对定位、aspect-ratio、calc/clamp、容器查询回调。
- [进阶探针](probe-advanced.ts)：嵌套增量重排、测量回调重入、fit-width、CQI、解析错误。
- 两组探针分别输出 421 行和 596 行，原版 Node、改写版 Node、改写版原生 executable 的 stdout、stderr、退出码均一致；预期输出保存在本目录的 `*.expected.txt`，原生退出码均为 0，stderr 为空。
- [验证摘要](validation.json) 记录真实测试范围、输出 hash 和限制；LLVM IR、原生 executable、上游 JS 单测是不同层次的证据。

## 9 类源码适配点

该数量按已验证的底层布局与长度解析路径归类，不是整个包的语言特性普查；诊断会级联，不能将诊断条数当作独立缺陷数。

| 类别 | 上游写法与障碍 | 本轮改写 |
| --- | --- | --- |
| 1. 可选日志依赖与自动发现 | 核心导入 logger，后者异步动态加载 debug/loggily；前轮缺可选模块时先在解析阶段失败 | 从布局核心移除日志导入、调用和专用计时，不以可空 rest/unknown 日志 stub 替代；日志能力不属于本入口 |
| 2. 异构 record 的动态读写 | `this._style[key]`、`Object.keys(overrides)`，字段混合 number、Value、array、boolean | 按字段类型生成显式 switch 与逐字段 override，保留 Object.is/Value 比较、own-property 检查和一次 dirty 提交 |
| 3. tuple 的动态下标 | `style.gap[isRow ? 0 : 1]`、`arr[physicalIndex]` | Style 边数组及参数改用 `Value[]`，保持原初始化长度/索引规则；TS 类型层不再保证这些向量的固定长度 |
| 4. tuple/array 联合容器遍历 | `expr.args` 同时可能是 clamp 三元 tuple 或 min/max 数组，统一调用 some/for-of 受阻 | 先按 `fn === "clamp"` 收窄，显式访问三个元素；其余分支保留数组遍历，保留 clamp tuple 合同 |
| 5. 嵌套空数组推断 | `Array.from(..., () => [])` 在 scriptc 中推为 number[][]，与 Node[][] 不匹配 | 回调显式返回 `Node[]`，不改变独立子数组初始化行为 |
| 6. 非空断言作为复合赋值目标 | `_lineCrossOffsets[i]! += x`、`mainPos! -= x` 的 AST 目标受阻 | 删除赋值目标上的 `!`，保留原赋值和索引；读操作中的必要断言保留 |
| 7. 可空函数属性的直接调用 | `child.baselineFunc(...)`、`node.cqResolve()` | 先读取到局部函数变量，检查非 null 后调用；本入口的回调按显式参数/闭包使用 |
| 8. freeze 已命名数组 | `Object.freeze(args)` 被视为可能存在别名、需要运行时 frozen bit | freeze 新数组字面量；clamp 使用显式三元组，min/max 使用新数组副本，保留返回 AST 的冻结行为 |
| 9. never 辅助函数作为联合返回值 | `return fail(...)` 被 lowering 为 void，不能映射到 MathExpr 联合布局 | 在两处返回错误分支直接 throw 同样的 LengthError，保留 input/reason |

实际修改 7 个上游源码文件：`layout-flex-lines.ts`、`layout-helpers.ts`、`layout-zero.ts`、`length.ts`、`node-zero.ts`、`types.ts`、`utils.ts`。另新增 `index-scriptc.ts` 作为明确的布局入口。完整可审查差异见 [upstream.patch](upstream.patch)，来源见 [UPSTREAM.json](UPSTREAM.json)；补丁已在固定提交原始源码上通过 `git apply --check`。

## 复现与边界

[verify.mjs](verify.mjs) 接受 scriptc 仓库绝对路径，默认验证两组 Node 输出、静态编译和原生执行；添加 `--llvm-only` 时只验证 Node 输出与 LLVM 生成。运行端需要该 scriptc checkout 的 tsx 和匹配的 native helper/runtime pack。产物写入 `.verification/`，不会写入 compiler/runtime。`SCRIPTC_VALIDATION_DEPS` 可指向独立安装匹配官方包的目录，本轮为 `/private/tmp/flexily-validation-deps`；该路径不是持续存在的项目依赖。

上游 `createFlexily()` 的 composable API 仍未通过探针：`FlexilyNode extends Node` 的形状无法静态表示，随后的方法调用产生级联诊断。它在实现中还会通过 bind、实例方法混入/替换安装文本方法；本轮没有将这套机制移植成静态类，也没有声称终端文本插件已可编译。其 Node 测试通过不等于其原生实现可用。

跨端文本由宿主测量，不使用默认等宽字符宽度代替系统字体。同步 measure 与框架的异步测量结果缓存仍需适配。回调不承诺动态 this/猴子补丁语义；Partial<Style> 以普通数据对象使用。未验证 Android/iOS library、Wasm、完整库导出、长期内存/RC 周期和跨端字体行为。调用 `freeRecursive()` 的数值探针不证明无泄漏，容器查询回调需在 adapter 销毁时显式解除。

上游 JS 行为回归与两组原生差分结果见 validation.json。布局/行为主轮排除了日志专测、依赖 Bun 的基准报告工具专测，以及需要单独调度的性能回归文件；其中性能回归文件随后单独运行通过，另外两项排除不算通过。性能基准状态单独记录，不给出跨 Node/native 的性能比值或小于 5% 回退保证。

## 本轮基准状态

两组上游 benchmark 文件均已运行。原版 56 项中 55 项完成，Flexily: 5000 nodes 项在 120 秒限制下超时；改写版显式排除该项，其余 55 项完成，1 项跳过。没有把被排除项算通过，完整性能 gate 仍缺；日志移除、主机负载和缺少 null control 也使这些结果不足以证明小于 5% 的差异。

最终 JS 行为回归：50 个文件、2648 项通过、1 项上游跳过、0 项失败，包含 1749 项 relayout-consistency 用例。独立运行的粗粒度性能回归：8 项通过；它不是跨 native/Wasm 性能或小于 5% 回退的证据。
