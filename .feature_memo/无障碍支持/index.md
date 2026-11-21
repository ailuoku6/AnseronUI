# 无障碍支持

- 状态：done
- 更新：2026-11-21
- 当前重点：实现、文档、共享示例及自动验证已完成。
- 入口：`brief.md`（范围）、`tech.md`（实现）、`protocol.md`（契约）、`files.md`（文件）、`decisions.md`（决策）、`changes.md`（验证）、`handoff.md`（接续）。
- 参照：Kuikly 本地 `docs/API/components/basic-attr-event.md` 748–846 行及相关实现。在线页面工具无法打开，已读取同源本地文档。
- 仓库存在其他文档整理、生命周期清理等未提交改动；本需求保留这些改动。
- 验证：类型检查、102 项 framework 测试、53 项 Harmony 测试、WebKit DOM/Wasm 回归、iOS 模拟器与 Android 真机专项、macOS AOT 集成、鸿蒙 HAP 构建均通过。
- 后续人工验收：开启 VoiceOver/TalkBack/鸿蒙屏幕朗读，检查实际语音与焦点顺序；本次未启用这些系统读屏服务，鸿蒙也无连接设备。
