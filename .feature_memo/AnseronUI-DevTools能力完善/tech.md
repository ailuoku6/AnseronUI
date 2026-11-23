# 技术

延续 Debug staged BusinessRuntime 插桩。新增 editing.inc 注入 props/style 覆盖和 state Hook 更新；通过 CommitAck 后回读确认。服务端分配 requestId/deadline，ingest 取命令，snapshot 带 commandResults。CLI 和面板共用 HTTP API。
Browser Vite serve 自动插桩与 Core snapshot 合并，命令转发回同一 Core；__devtools.capture 提供真实图像分块（每块 24000 字符）。Swift #if DEBUG；Android Gradle 按 variant 生成移除调试块的 Release 源码；Harmony build 复制后移除调试块。
