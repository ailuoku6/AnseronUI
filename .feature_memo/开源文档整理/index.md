# 开源文档整理

- 状态：done
- 更新日期：2026-11-08
- 当前重点：补充 Core 多页合包、独立编译设计边界、scriptc/Flexily 技术基础与 TS/TSX 限制；许可证仍待所有者选择。
- 工作区：AnseronUI（本地目录名仍为 TSNative）。

## 文档地图

- `../recording-preferences.md`：项目记录偏好，当前无自定义要求。
- `brief.md`：目标、范围与验收。
- `tech.md`：文档依据、实现边界和仓库规则。
- `protocol.md`：本轮核实的 API 与配置约定。
- `files.md`：变更文件和用途。
- `decisions.md`：中文化、第三方原文和许可处理决策。
- `changes.md`：本轮改动与验证结果。
- `handoff.md`：后续继续工作的入口。

## 最新结果

- 根 README、公开文档索引、能力清单、架构原理与两端接入文档均已完成中文整理。
- 新增 `docs/core-bundles.md` 与 `docs/typescript-limitations.md`；框架/业务独立分包仅为设计方向，本轮未改变打包实现。
- 修正应用配置命令、Web 输出路径、HTTP fixture 端口、布局测量与跨页状态等说明。
- `.gitignore` 覆盖源码树中的生成 Core 副本、编译器 checkout、依赖缓存和本机状态；保留源码、锁文件和示例资源。
- 前轮：类型检查、36 项框架测试、CLI/构建测试、107 个链接、5 段 TSX 示例及 50 个忽略用例通过。
- 本轮增补：类型检查、36 项框架测试、构建指纹测试通过；21 份文档 140 个链接通过；3 个新示例通过类型检查、4 项 JSX/Hook 拒绝规则及 4 个固定版 library 编译探针符合文档。

## 后续事项

- 文档任务无剩余必做项。
- 正式发布前由项目所有者选择根 LICENSE；当前未选择，也未提交或推送仓库。
- 若执行发布，确认 Flexily 适配源码以普通文件入库，避免嵌套仓库被误录为 gitlink。
