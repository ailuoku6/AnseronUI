# flexily 的 scriptc 源码适配验证

日期：2026-11-07。基于 flexily 0.8.5 提交 `4850f1fb475f8147458059b45fb4f148d14a6ab4` 和 scriptc 提交 `294bb3608da12ae6af7f54f67b47c222c93cb2aa`。

更新：本文前几节记录早期 scriptc 0.2.1 原型；本轮用户已授权正式克隆并适配为 AnseronUI 布局引擎，实际实现见 `../../packages/flexily/` 与 `../../packages/layout/`，项目工具链锁定 scriptc 0.4.8。最新验证与实施范围见文末补充节。

## 结论

可以通过改写 flexily 源码规避已覆盖布局路径的静态编译障碍。本轮归类为 9 类适配点，修改 7 个上游源码文件，另增加静态布局入口；没有改动 scriptc compiler/runtime，没有启用 dynamic island 或 JS 引擎。底层 Node API 已完成 LLVM 生成、macOS arm64 原生编译与行为差分；这不是整包可用或移动端框架落地的结论。

源码副本、逐项说明、可应用补丁与复现脚本位于 [flexily 静态布局原型](../experiments/flexily-scriptc/README.md)。来源、文件清单及验证状态分别记录于该目录的 UPSTREAM.json 和 validation.json；不提交生成的原生 executable 或 LLVM IR。

## 障碍分类与改写

| 类别 | 改写方式 |
| --- | --- |
| 可选日志依赖与自动发现 | 从核心移除日志导入、调用和专用计时；不引入可空 rest/unknown 日志 stub |
| 异构 style record 动态键读写 | 按字段类型显式 switch，Partial<Style> 改逐字段处理，保留 own-property、比较和一次 dirty 提交 |
| tuple 动态索引 | Style 的 edge/gap 及对应参数改为 Value[]，运行时保持原向量长度 |
| tuple/array 联合遍历 | clamp 先收窄并按三个固定下标读取，其余仍遍历数组 |
| 嵌套空数组类型推断 | Array.from 回调显式声明返回 Node[] |
| 带非空断言的复合赋值目标 | 去掉赋值目标的 !，保留索引、运算与控制流 |
| 可空函数属性直接调用 | 先读取局部函数变量，判空后调用 baseline/CQ 回调 |
| freeze 已命名数组 | 改为冻结新数组字面量或副本，保留 AST 冻结行为 |
| return never 辅助调用与联合返回映射 | 两处改为直接 throw 同样的 LengthError |

9 是按已覆盖代码路径归类的数量，不能理解为整个 flexily 的全部不兼容特性数量。日志首先是依赖/集成问题，其余包含 scriptc 当前类型表示、lowering 与推断边界；没有将它们都归因于 TS 语法不支持。原先的几十条诊断中有级联项，也有临时日志 stub 引入的问题，本轮不以条数估算工作量。

## 实际验证

- 原版 Node、改写版 Node 和改写版原生程序，两组探针分别输出 421 行与 596 行；共 1017 行 stdout、stderr、退出码逐字节一致，均正常退出且 stderr 为空。
- 覆盖 wrap/RTL、grow/shrink、gap/padding/margin、percent、aspect-ratio、absolute、baseline/measure、dirty/cache/remove、嵌套重排、测量回调重入、calc/clamp、容器查询、CQI、fit-width 和解析错误。
- 上游 JS 单测范围与性能基准结果以 [验证摘要](../experiments/flexily-scriptc/validation.json) 为准；JS 单测通过只证明改写后在 Node 的行为，原生证据来自上述两组独立差分。
- 上轮 helper 0.2.0/compiler 0.2.1 不匹配已在本轮验证中解决：在临时目录安装官方 0.2.1 helper/runtime pack，保留所有版本检查，helper 确认使用 LLVM 22.1.8；工作区依赖未修改。

## 尚未覆盖的整包能力

`createFlexily()` 的 composable 入口仍失败，主要诊断指向 `FlexilyNode extends Node` 的类型表示，随后产生方法调用级联错误。源码还通过 bind、动态混入/替换实例方法提供文本服务；本轮未重写这套插件系统，也未将其终端文本测量服务列为已编译能力。原生适配范围不能因这些 API 的 Node 单测通过而扩大。

为 AnseronUI 使用底层 Node 入口即可接入自有 LayoutEngine，无需先采用 composable 文本 API。框架仍需定义宿主文本测量、异步结果缓存、逻辑单位/取整、显式释放与 RuntimeAdapter 生命周期。Style 的 tuple 改成数组会放宽 TS 固定长度约束；回调按显式参数/闭包使用，不承诺动态 this 或猴子补丁语义；Partial<Style> 以普通数据对象使用。

尚无 Android/iOS library、Wasm 或长期内存/RC 测试；调用 freeRecursive 的数值探针不能证明无泄漏。容器查询回调需在销毁时解除；各端文本排版和实际页面性能仍需 P0 验收。完整性能基准没有形成全部通过的结论，不承诺小于 5% 回退，也不把 Node 基准当作 native/Wasm 性能。

本轮将 flexily 从“需要移植的候选”推进为“已验证原生执行的底层布局原型”，尚未决定替代主方案第 6 节的布局基线。

## 2026-11-07：extends 支持边界澄清

不能将 composable 入口失败理解成 scriptc 不支持 extends。本轮进一步用独立最小程序、dynamic=false 和匹配的 0.2.1 native 工具链验证：

| 形式 | 结果 |
| --- | --- |
| class Derived extends Base，含 super 构造、方法重写、super.read、通过 Base 类型调用、instanceof | 原生通过，输出 `10 true true`，与 Node 一致 |
| interface Derived extends BaseRecord，增加数据字段 | 原生通过，输出 `10`，与 Node 一致 |
| interface Alias extends BaseClass {}，不增加成员 | 原生通过，输出 `7`，与 Node 一致 |
| interface Extended extends BaseClass { extra(): number }，Concrete 子类确实实现 extra，但变量标为 Extended | 失败，SC2001 指向 Extended 的静态表示，随后 SC1090 方法调用级联 |
| 同一个 Concrete 子类实例，变量改为 Concrete 类型 | 原生通过，输出 `7 3`，与 Node 一致 |

失败样例的关键结构如下；因此限制涉及新增方法的接口视图如何映射到 class 实例，不是 extends 关键字整体不支持，也不能概括为所有 interface extends class 都失败。

```ts
class Base {
  value: number = 7;
  read(): number { return this.value; }
}
interface Extended extends Base { extra(): number; }
class Concrete extends Base { extra(): number { return 3; } }
const item: Extended = new Concrete(); // 本轮 SC2001；改标为 Concrete 则原生通过。
console.log(item.read(), item.extra());
```

这进一步支持将 flexily 的动态文本 mixin 重写为真实子类、在类中声明方法，并修改工厂以构造该子类的方向；本轮仅验证其继承基础，没有完成 composable/text plugin 的移植。最小程序临时存于 `/private/tmp/scriptc-extends-probes`，未修改 compiler/runtime。

## 2026-11-07：正式引入 AnseronUI 布局引擎

按用户要求把上游真实克隆到 `packages/flexily/`，固定同一 0.8.5 提交，保留 `.git` 与 MIT 许可。在 clone 上应用前述 7 文件兼容改写并清理新增行的尾随空格；没有修改 scriptc compiler/runtime。包名改为私有 `@anseronui/flexily`，默认导出 `src/index-scriptc.ts`，完整上游入口保留为 `./upstream`，不把尚未移植的终端文本 mixin 当作静态布局能力。上游发布/站点工具依赖由项目根目录的验证依赖替代，源码和上游回归用例仍保留。

新增 `packages/layout/`，框架通过 **`@anseronui/layout`** 使用 Flexily。`LayoutEngine` 按 surface 保存其创建的节点，默认显式使用 CSS preset；提供 `createNode()`、`calculateLayout()`、`releaseSubtree()`、`dispose()` 和 `getNodeCount()`。释放时清理父子关系、measure/baseline/CQ 回调，覆盖已经移出根树的节点；拒绝通过 engine 计算或释放另一个 engine 的根节点。调用者不能把不同 engine 的节点混入一棵树，也不能继续使用已释放的原始 Node 句柄。

项目本地锁定 **scriptc 0.4.8**、匹配的 LLVM helper、native/Wasm runtime pack；上游 main 的 Prepare v0.4.9 在本轮 npm 查询时尚未发布。全局旧版 scriptc 与临时 0.2.1 工具链均不参与本轮正式验证。新增的公共包入口已在原生 executable、native library 与 Wasm reactor 编译中实际使用。

本轮实测结果：

| 验证 | 结果 |
| --- | --- |
| TypeScript：静态 Flexily 入口和布局包 | 通过 |
| 两组原版 Node / 适配版 Node / 适配版 native 差分 | 421 + 596 = 1017 行，stdout、stderr、退出码一致 |
| LayoutEngine 公共包入口、重排与生命周期探针 | 16 组通过，含 measure/baseline/CQ 清理、释放多层子树、离树节点销毁、重复 dispose、已销毁/异属 engine 拒绝 |
| native 静态库 + C 宿主实际调用 | 编译、链接与运行通过，输出与 Node/native executable 一致 |
| Wasm reactor + Node WASI 宿主实际调用 | 编译与运行通过，16 组输出与 native 一致；真实分配输出槽，处理 memory growth，并调用 reset/collect/free |
| 上游布局/行为回归 | 50 文件，2648 通过、1 上游跳过、0 失败 |
| 单独运行上游粗粒度性能回归 | 8 项通过 |
| 两组上游基准，改写前/后 | 两次均 55 项完成、1 项明确跳过；5000 节点项沿用已知超时排除，不计作通过 |

原生可执行程序的动态链接检查只列出 libSystem。静态编译使用 `--tier static-only --node-islands off`，library 采用静态库模式；未引入 JS 引擎。所有新编译产物、LLVM 和实时日志留在根目录 `.verification/`；可审查的摘要、版本和源代码 hash 存在 [`packages/layout/validation.json`](../../packages/layout/validation.json)。上游发布/Bun 日志测试与 benchmark 报告 CLI 测试不在本轮布局回归范围，排除项明确记录，不算通过。前后基准都运行了 warmup/rich 两个文件；主机另有持续 CPU 负载，且未做 null control，因此没有形成小于 5% 回退、性能提升或 native/Wasm 速度结论。

复现命令（AnseronUI 根目录）：

```sh
npm ci --ignore-scripts
npm run prepare:tools
npm run typecheck:layout
npm run test:layout
npm run test:layout:wasm  # 额外需要 zig
npm run test:layout:upstream
npm run bench:layout -- --testNamePattern='^(?!.*Flexily: 5000 nodes)'
```

**本轮已将 Flexily 选定为项目当前布局计算引擎**，主方案第 6 节已同步，取代原先从零自研有限 Flex 的建议。这是布局 Core 的集成结论。Android/iOS library 嵌入、浏览器 WASI/DOM、真实宿主异步文本缓存、长期 RC/内存与端上性能仍待验收。另已明确当前 Flexily 内部整数网格取整与原先渲染边界按设备像素取整的目标存在差异，尚未实现设备像素比例/连续坐标配置；不能将整数数值差分当作高 DPI 布局完整验收。
