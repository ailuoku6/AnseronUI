# Technical Notes

- `scripts/app-icons.mjs` 负责同步校验、PNG 面积采样缩放、各平台资源生成及宿主接入；pngjs 7.0.0 是纯 JS 的生产工具依赖，懒加载以支持未安装依赖的解包 SDK 执行 create/help/check（无图标时）。
- 生成资源按平台置于 `.anseronui/icons/`；先在临时目录生成再替换，其他平台输出不删除。
- iOS 原有 Python 工程生成器执行后，通过 plutil 读取 pbxproj 并增加 PBX 资源和 AppIcon 设置，兼容旧模板；Composer 的 file type 为 `folder.iconcomposer.icon`，已用 Xcode 实际构建验证。
- Android 为 Gradle 追加一次条件接入；生成脚本读取原有插件权限 overlay 后添加图标 application 属性，使用 SDK 35 验证。
- Web CLI 改用 `scripts/web-app.mjs` 启动 Vite，插件注入 base-aware favicon，开发期中间件提供图片；原有 Vite 配置保持可用。
- macOS 生成含标准及 Retina PNG chunk 的 ICNS，加入资源和 Info.plist；输入及包内图标加入构建校验。

## Constraints

- iOS images/appiconset 接入要求 Xcode 16+，Composer 要求 26+；images 的 iOS 输入必须为 1024 方形，默认不透明，tinted 可见像素为灰度。
- Android night 资源无法保证所有 Launcher 即时更新，主题图标主要依赖 monochrome 与用户设置。
- 不含设备桌面视觉验收；原生目录完整语义由平台工具校验。
