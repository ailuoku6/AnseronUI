# 应用图标配置

- Status: done
- Last updated: 2026-11-10
- Current focus: 图标配置、默认图稿、新建模板与演示宿主均已接入。
- Workspace: `TSNative`

## Document Map

- `../recording-preferences.md`: 项目记录要求（无额外要求）。
- `brief.md`: 用户目标与验收范围。
- `tech.md`: 实现边界、依赖和平台限制。
- `protocol.md`: 配置协议与回退规则。
- `files.md`: 变更文件。
- `decisions.md`: 方案决策。
- `changes.md`: 实施与验证记录。
- `handoff.md`: 后续接手入口。

## Latest Summary

- `app.icon` 支持字符串或按平台配置的对象；完整用户文档为 `docs/app-icons.md`。
- create 默认附带蓝色 A 标志及 iOS 深色/着色、Android 自适应/主题/night 图层；根演示四端也读取图标配置。
- 生成目录为 `.anseronui/icons/`；支持原有 create 模板，不覆盖业务宿主的原始 Manifest / Info.plist。
- 已确认原生资源编译、Composer 最小 Xcode 工程构建、Android Gradle 资源及权限合并、Web 实际 HTTP favicon 均可行。

## Next Actions

- 无待办；发布前按文档在目标设备做桌面外观验收。

## Open Questions

- 无阻塞问题；设备桌面视觉验证尚未执行。
