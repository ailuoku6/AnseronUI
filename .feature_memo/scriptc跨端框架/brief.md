# 需求背景

- 用户目标：借鉴 `/Users/ailuoku6/kuiklyProject/KuiklyUI` 的设计，获得基于 scriptc 的跨端框架技术方案。
- 当前硬要求：Promise/async-await，不引入 JS 引擎。热更新暂不做具体方案设计，仅保留 RuntimeAdapter、artifact/source 抽象、身份/epoch 和能力协商等扩展边界；不预选 Wasm VM、JS 字节码或其他执行层。
- 新增开发体验要求：组件/页面写法贴近 React，但不能直接使用 React；方案选择自有函数组件、TSX、props/children 与 Hooks，不引入 React runtime 或承诺 React 库兼容。
- 当前范围：框架架构方案继续保留；2026-11-07 用户已授权克隆并适配 Flexily，成功后正式作为 AnseronUI 布局引擎。其余组件/运行时/renderer 尚未实施。
- 建议首批平台：Android arm64/API 26+、iOS arm64 device/simulator/iOS 15+、Web Wasm。
- 热更新边界：不设计下载、校验、状态迁移、实例切换、回滚或渠道策略；后续有明确需求时再针对目标平台评估。
- 交付验收：明确借鉴点和现有能力，给出新增模块与 P0/P1 阶段门槛，保存完整方案。
- 开放问题：正式命名、仓库组织、目标业务、性能预算与人员周期需后续确定。

- 2026-11-07 用户要求将技术方案和需求记录迁入 `/Users/ailuoku6/web_project/TSNative`；保留方案与历史决策，外部 compiler/runtime 源码不迁移。
