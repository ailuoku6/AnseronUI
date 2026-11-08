# 方案决策记录

## 2026-11-07：引入项目内 Flexily 布局引擎

- 用户要求把 Flexily 克隆到 AnseronUI，改写为 scriptc 可编译的形式，成功后采用为布局引擎。
- 真实上游 clone 位于 `packages/flexily/`，固定报告使用的 0.8.5 提交 `4850f1f`；保留 MIT 和 `.git`，以便离线重建上游差分参照。
- `@anseronui/flexily` 默认导出静态低层入口；`@anseronui/layout` 提供 surface 节点所有权和释放，不依赖 composable/终端文本 mixin。
- 项目独立锁定 npm 可安装的 scriptc 0.4.8 及匹配 runtime；main 的 Prepare v0.4.9 不代表 npm 已发布。旧 0.2.1 证据保留为历史。
- 适配不修改 compiler/runtime；宿主字体测量、异步缓存、移动端及像素比例取整需单独验收。

以下是 2026-11-06 的技术建议，尚未由用户要求开始实施。

- 选原生控件 renderer + 共享 Core，借鉴 KuiklyUI 分层；暂不选择自绘和 DEX backend，复用静态库/Wasm 能力。
- 初版历史建议（已被用户新增要求取代）：同步事务 + 宿主 effect，Promise embedding 延后。v2 必须交付真正 Promise/async-await，仍保持同步 ABI，补 host step/context。
- 正常路径优先导出 bytes 结果，避免细粒度同步 callback 和回调重入。
- 用 TypeScript 实现有限共享布局，P0 验证后再决定是否切换宿主 Yoga；library FFI 当前不能直接调用 Yoga。
- v2 历史建议（热更新部分已被取代）：每 bundle generation 单 runtime、多 surface；更新期间候选/旧代双 runtime 并存。线程实例不是任意实例，显式 teardown/context 升为 P0。
- 将 fatal trap 隔离、文本测量收敛、内存稳定性列为 P0 关键判断，不提前承诺生产级容错或性能。
- 独立实现架构/协议；KuiklyUI LICENSE 对为动态加载/live update 创建衍生作品要求书面许可，不能直接复制移植。

## 2026-11-06 v2 历史建议（热更新部分已被取代）

- 当时建议 native AOT + 可更新 Wasm interpreter、禁用 JIT/下载 native AOT；该执行路线与更新流程不再是当前决定。
- 当时提出 P0 验证解释器与双代迁移；当前热更新暂缓，相关探针不属于首版门槛。
- Promise 不可取消、平台 I/O 可取消以及 epoch 隔离迟到结果仍是运行时设计约束，与热更新选型无关。

## 2026-11-06 v3 补充决策

- 用户要求组件和页面写法接近 React，但不直接使用 React。采用自有函数组件、TSX、props/children、单向数据流和基础 Hooks；不依赖 React、react-reconciler、React DOM/Fiber，也不承诺 React 库兼容。
- 首版纳入 TSX/useState/useReducer/useRef/useEffect/useMemo/useCallback/Context、自定义 Hooks 与 keyed children；显式 Binding 留作内部机制，不作为主要业务编程模型。
- 每组件 Hook slot 由自有 UI compiler 生成具体 frame；组件函数重执行、state 快照、setter 队列、key/type 身份、Effect setup/cleanup 都写入方案合同。首版不做 concurrent render、Suspense、render 中抛 Promise 或 `useLayoutEffect`。
- scriptc 可解析 TSX AST/解析 `.tsx`，不代表有 JSX lowering；新增 UI compiler、JSX 类型和静态 Hook 规则分析，保持 compiler typed IR 边界。
- 当时开发重载建议只恢复有 schema 的可序列化 state；该状态恢复行为当前不承诺，待热更新/重载设计时再定。

## 2026-11-07 热更新范围收敛

- 当前只保留 RuntimeAdapter 生命周期、artifact/source 抽象、Runtime 身份/epoch 与能力协商；首版按随包产物启动。
- 不决定中间码格式、执行引擎、下载和校验、状态迁移、实例切换、回滚或 OTA 渠道策略。

## 2026-11-07 工作区迁移

- 用户指定 AnseronUI 作为技术方案和需求记录存放目录，保留现有相对目录结构、v3 设计结论与全部决策历史；scriptc 仍为外部编译器源码仓库。

## 2026-11-07：先隔离 flexily 布局核心

- 采用仅用于验证的独立源码副本和 index-scriptc 入口，不修改 scriptc 来迁就依赖，不启用 JS 引擎。
- 底层 Node 原生差分已通过；暂不移植 createFlexily 动态 mixin/终端文本插件，AnseronUI 优先用自有宿主测量 adapter 接布局核心。
- 这是原型边界，不是生产依赖选择；待移动端 library/Wasm、测量、生命周期和性能证据齐备后再评估替代主方案有限 Flex。

## 2026-11-07 框架实施边界

- Web 先提供 JS 参考宿主以验证共享组件/协议行为；不将它称为目标 Wasm 交付。Android/iOS 先提供可独立编译的渲染模块，等待 compiler/runtime async embedding 再连接。
- 保留 scriptc 库模式 SC4005；不通过删除诊断或无生命周期语义的薄封装声称 Promise 库已支持。
- 测量协议显式传控件 kind，使 Web/Android/iOS 使用对应平台控件计算文字与内边距；有限重试上限 8 次，失败以诊断暴露。
