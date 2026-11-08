# 原生页面容器

- Status: done
- Last updated: 2026-11-07
- Current focus: 已完成容器、Demo 接入、文档和模拟器验证。
- Workspace: `AnseronUI`

## Document Map

- `../recording-preferences.md`: 项目记录偏好
- `brief.md`: 目标与验收
- `tech.md`: 架构和边界
- `protocol.md`: 容器 API
- `files.md`: 修改文件
- `decisions.md`: 技术决策
- `changes.md`: 验证记录
- `handoff.md`: 接续说明

## Latest Summary

- 在现有 Host / Renderer 上增加可嵌入原生 View 容器。
- 每次 load 创建独立根视图；等待有效尺寸启动；尺寸变化自动转发。

## Next Actions

- 无本需求遗留实现项；后续接入遵循显式 destroy 和主线程约定。

## Verification

- iOS：4 项容器测试通过；另一次回归中的 2 项真实页面 UI 测试通过。
- Android：最终构建成功，最终 instrumentation 共 5 项通过（4 项容器 + 1 项真实页面流程）。
