# 参与开发

本文只说明怎么改这个仓库。编写 App 请从 [快速开始](docs/getting-started/quick-start.md) 开始。

## 先看哪份文档

- 本地环境、仓库示例、测试和发布：[框架开发](docs/contributing/framework-development.md)
- 源码归属、生成文件和检查选择：[仓库维护](docs/contributing/repository-workflow.md)
- 运行原理：[架构](docs/architecture/overview.md)

## 改动放在哪里

- App 示例和页面：`examples/`
- 框架、协议、Renderer、CLI：`packages/` 和 `scripts/`
- 用户可见行为：同时更新 `docs/` 中对应文档
- 设计依据和实验：`internal/`。公开 API 只写在 `docs/`

## 提交前

按改动选择检查。命令见 [本地验证](docs/contributing/repository-workflow.md#本地验证)。

未运行的设备检查要在结果里写明。
