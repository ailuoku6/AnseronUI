# 文件清单

| 路径 | 用途 |
| --- | --- |
| `README.md` | 中文开源首页、环境、三端运行、创建/接入、代码示例与验证 |
| `docs/README.md` | 公开文档索引与历史设计入口 |
| `docs/capabilities.md` | 组件属性/事件、Hooks、触摸、媒体、动画、路由与平台范围 |
| `docs/architecture.md` | 架构、运行链路、协议、并发、生命周期和仓库规则 |
| `docs/tooling.md` | 修正命令 cwd，增加配置字段/路径、通用宿主和构建边界 |
| `docs/native-extensions.md` | 增补 router 保留名与 ref 动画方法 |
| `docs/routing.md` | 澄清错误文本平台差异和跨页状态寿命 |
| `packages/render-ios/README.md` | 中文链接、容器、路由、生命周期和验证说明 |
| `packages/render-android/README.md` | 中文 JNI 接入、容器、平台约束和验证说明 |
| `packages/layout/README.md` | 更新测量状态，说明上游 Git 对象与复现步骤 |
| `packages/flexily/README.md` | 添加中文来源提示，保留下方原文 |
| `packages/flexily/README.scriptc.md` | 更新文本测量和宿主已集成的事实 |
| `internal/design/anseronui-framework.md` | 标注历史方案，改用可移植路径描述 |
| `internal/design/framework-implementation-status.md` | 标注阶段验证快照，链接当前文档 |
| `internal/design/ts-layout-libraries-research.md` | 历史代码示例不再绑定作者机器绝对路径 |
| `.gitignore` | 依赖/生成物/本机设置与签名文件忽略规则 |

`docs/animations.md` 和 `docs/back-press.md` 原主体已为中文，本轮核对并从新索引链接，未更改实现。验证用临时示例与链接报告位于被忽略的 `.verification/docs/`。

## 2026-11-08 新增与更新

| 路径 | 用途 |
| --- | --- |
| `docs/core-bundles.md` | 多页合包、产物与实例的区别、重编原因、未实施的分离设计 |
| `docs/typescript-limitations.md` | 固定版本、官方参考、TSX/TS/宿主限制、示例和排查 |
| `README.md` | 增加技术依赖表与 Core 合包解释 |
| `docs/architecture.md` | scriptc / Flexily / AnseronUI 职责和构建边界 |
| `docs/README.md`、`docs/tooling.md`、`docs/capabilities.md` | 新指南入口及相关范围说明 |

临时验证脚本/结果在 `.verification/docs-limitations/`，不发布为源码。
