# 变更与验证

## 2026-11-08

- 完成根 README、平台包 README 中文化，延续上一轮新增的文档索引、能力与架构文档并核对源码。
- 补齐组件属性/事件表、资源示例、路由和 CLI 的实际限制；修复错误工作目录、HTTP 端口假设、Web 输出目录和已过期的测量说明。
- 增加 `.gitignore` 生成物与本机状态规则，保留必要源码和配置样例。
- 历史设计增加定位说明；Flexily 保留上游原文并补中文入口。

验证成功：

- `npm run typecheck:framework`。
- `npm run test:framework`：5 个测试文件、36 项测试通过。
- `npm run test:tooling`：1 项 CLI 创建/接入/检查集成测试通过。
- `npm run test:build`：1 项构建指纹测试通过。
- `npm run anseronui -- check --config anseronui.config.json`。
- 19 份文档、107 个本地链接/锚点、代码围栏、npm script 名称和公开入口机器路径检查通过。
- 5 段完整 TSX 示例：原始与 lowering 后源码均通过 TypeScript 检查，lowering 无诊断。
- 50 个 ignore 检查用例：33 个应忽略路径、17 个应保留路径全部符合预期。

本轮为文档和忽略规则修改，没有重新构建三端应用、重跑设备 UI 或布局差分。历史 Android 全套测试的 HTTP fixture 前置条件仍需满足，不能把本轮快速验证写成全套设备通过。

剩余发布事项：项目所有者选择根 LICENSE；仓库发布/提交不属于本轮执行范围。

## 2026-11-08：合包解释与语言限制增补

- 新增 `core-bundles.md`、`typescript-limitations.md`，同步 README、架构、能力、工具链与索引。
- 标注 scriptc 0.4.8 + async 补丁、Flexily 0.8.5 的技术依赖与来源职责。
- 读取官网 limitations / compatibility 入口，核对固定提交的原始限制文档、compatibility ledger 和 library 准入源码。
- 验证通过：框架类型检查、36 项框架测试、构建指纹测试；21 份文档 140 个本地链接。
- 3 个新文档代码示例通过类型检查，2 个 TSX 示例 lowering 通过；4 种拒绝规则与诊断一致。
- 固定版实际 library 编译探针：启用 async_embedding 的 Promise/await + 收窄 union 成功输出 archive；关闭 async_embedding、直接 timer 和 generator 均按预期 SC4005 拒绝。
- 临时探针首次把 clang 绝对路径传给 SCRIPTC_CC，被工具拒绝；按工具要求改用 `clang` 并通过 PATH 选择 Xcode clang 后全部通过。未修改产品代码。
- 未实施框架/业务独立分包，未重建三端完整应用，也未重跑设备 UI。
