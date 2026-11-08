# Handoff

从 index.md 进入。本需求已完成：两端 AnseronUIRenderView、原生 Demo 迁移、接入文档、模拟器验证。

- load(page) 每次创建独立 root + Host；等待正尺寸启动，之后自动 resize；generation 隔离旧回调。
- 显式 destroy 为终止且幂等；detach/reparent 保留页面；onReady 仅握手成功。
- 失败后暂停 resize，可再次 load 恢复；Android Host 忽略关闭后的 resize。
- iOS 最终容器测试 4 项通过，已有页面 UI 回归 2 项通过；Android 最终 5 项通过（4 lifecycle + 1 real Core）。日志见 changes.md。
- Workspace 根无 Git。期间 Renderer、Host、compiler 有并行修改，请保留他人工作。
- Core rebuild 工具链现有 TypeScript 7/5 依赖不匹配，与本容器独立；最终使用现存 Core 二进制通过实际页面测试。Android requiredNodes 保持基础五类，扩展节点可选。
