# Handoff

从 `index.md` 恢复。图标配置、默认图稿和四端演示接入均已完成。

- `scripts/app-icons.mjs` 支持字符串/平台对象及原生资源；文档 `docs/app-icons.md`。
- create 默认复制 `scripts/templates/app/assets/icons/` 并配置 light/dark/tinted、adaptive/monochrome/night；PNG 二进制复制。蓝色 A 源图/可复现生成器在 `scripts/generate-default-icons.mjs`，同步根 `assets/icons/`。
- 根演示 `anseronui.config.json` 已配图；`build-app.mjs` iOS/Android 读取根 icon；Web Vite 和 macOS ICNS 接入。helpers 可选工程路径/target，维持 standalone 默认行为。
- Android night legacy 会盖过默认 adaptive XML，已增加 night adaptive v26/v33 保持遮罩。不要承诺所有 Launcher 即时切换 night 或主题图标。
- 工具测试 27 通过/2 原生默认跳过；显式原生图标测试 11/11；npm 包 1/1，包含模板 PNG 原始字节与四端生成断言；iOS/Android 完整构建成功；Web favicon 构建和 ICNS 生成成功。
- iOS/Android 模拟器均安装更新；iOS 桌面截图 `.verification/default-icon-ios-home.png`，Android 应用信息截图 `.verification/default-icon-android-info.png`。
- 所有用户已有布局、Core 和夜间样式修改仍保留；没有 commit。
