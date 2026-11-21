# 决策记录

## 2026-11-08：公开中文文档与历史记录分层

- 根 README 与 `docs/` 描述当前实现，历史设计保留原有证据并加快照说明。
- 不把上游完整 Flexily API、性能数字或旧方案写成框架支持承诺。

## 2026-11-08：保留第三方原文

- Flexily 上游 README/CHANGELOG/CONTRIBUTING/LICENSE 保留原文，只在 README 顶部加中文使用入口。
- 编译器 checkout 由固定版本准备脚本重建，根 ignore 忽略其本机目录，保留补丁与构建脚本。

## 2026-11-08：不代选根许可证

- 用户要求整理开源文档，但没有指定 MIT/Apache 等授权选择；记录根 LICENSE 尚缺，不把第三方许可当作项目级许可。

## 2026-11-08：忽略规则按实际产物制定

- 依赖/缓存与构建目录忽略；源码树中的生成 Core、manifest 和生成示例工程单独覆盖。
- 保留锁文件、媒体源资产、fixture、环境样例和共享 IDE 配置。

## 2026-11-21：文档按应用的四部分组织

- 唯一目录是 `docs/README.md`。根 README 不再重复课程列表。
- 指南分成 `guides/navigation`（页面）、`guides/ui`（界面）、`guides/services`（能力）、`guides/project`（工程）。
- `docs/reference/build.md` 是构建参考。`docs/getting-started/` 只保留两篇学习文档。

## 2026-11-20：已发布包是应用入口

- `anseronui` 已在 npm 发布。应用文档从 `npx anseronui create` 写起，不写「尚未发布」或本地 tarball 作为默认路径。
- 学习顺序是快速开始、编写页面、样式、路由、系统服务。构建参数、接入已有工程和架构不放在第一步。
- `--local-framework` 只给修改本仓库的人使用。

## 2026-11-20：按读者任务分目录

- 教程留在 `docs/getting-started/`，操作留在 `docs/guides/`，查阅留在 `docs/reference/`，原理解释留在 `docs/architecture/`。
- 根 `CONTRIBUTING.md` 只写流程。环境、测试和发布仍在 `docs/contributing/`。
- 不新增空的平台页。iOS、Android、macOS 的宿主说明继续放在对应 Renderer README。

## 2026-11-08：明确当前实现与拆分提案

- 源码 package 分层不等于独立编译 ABI；不能声称已有框架预编译/业务单独热更新。
- 将拆分作为设计方向，讲清业务仍需编译、原生仍需链接打包；本次只改文档。
- 限制以固定 scriptc 0.4.8 和补丁为基线，官网最新文档与 Node API 兼容表仅为参考，不能跨模式直接套用。
- 不把泛型、继承、async 或 any 全面写成“不支持”；写出具体受限场景与替代方式。
