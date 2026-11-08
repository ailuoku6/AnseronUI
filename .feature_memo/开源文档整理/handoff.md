# 交接

从 `index.md` 进入。中文开源文档及本轮补充已完成。

新增 `docs/core-bundles.md` 解释：所有配置页面与框架当前合编为一个目标产物，不是每页一份 Core；实例隔离不同于产物划分。框架预编译与业务包分离只是设计方向，必须解决 ABI、Hook/闭包、runtime 内存与重入，尚未实施。

新增 `docs/typescript-limitations.md`，根据官网入口和固定 scriptc 0.4.8 源码/补丁整理 JSX、Hooks、TS 类型、静态 library、Module 与 npm 依赖边界。README/架构显式说明 scriptc 负责原生编译、Flexily 负责布局。

本轮验证：类型检查、36 项框架测试、构建指纹；21 文档 140 链接；3 新示例类型检查/2 TSX lowering；4 JSX/Hook 拒绝规则；4 library 编译探针均符合预期。async 补丁可编译 Promise/await，但直接 timer 与 generator 仍被拒绝。未重建完整移动应用或设备 UI。

若用户下一步要求拆分 Core，请从该文档与 `scripts/stage-core.mjs`、profile、transport 入手，不能把本文的提案当成已落地能力。发布前仍需所有者选择根 LICENSE；Flexily 源码应普通文件入库，避免误录 gitlink。没有提交或推送。

后续用户要求的独立内核和业务包已另在 `.feature_memo/Core独立构建与计时器/` 实施；`docs/core-bundles.md` 已由提案更新成实际 ABI/构建说明。
