# Brief

## User Goal

- 实现应用图标配置，涵盖基础格式、iOS 和 Android 的复杂图标及暗黑适配，并写入文档。

## Scope

- 单 PNG 四端图标；iOS Light / Dark / Tinted、Icon Composer、原生 appiconset。
- Android legacy / round / adaptive foreground / background / monochrome、night 覆盖、原生 res 目录。
- 配置检查、SDK 分发、已有 create 工程接入、Web favicon 和 macOS icns。
- 新建 App 自动附带默认图标及外观图层，仓库演示也配置图标。

## Acceptance Criteria

- 合法配置生成对应原生资源并进入目标打包流程，错误配置可提前诊断。
- 生成资源可清理，插件权限不会因图标 overlay 丢失。
- `docs/app-icons.md` 包含配置示例、升级方法和平台限制。

## Non-Goals

- 动态 Alternate App Icons / Activity Alias API，商店素材上传，自动生成深色／单色图稿。

## Open Questions

- 无。
