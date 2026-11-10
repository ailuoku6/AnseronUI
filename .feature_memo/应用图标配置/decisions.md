# Decisions

## 2026-11-10

- 字符串保留简单用法，对象承载平台差异；不把 iOS dark/tinted 与 Android monochrome/night 强行合并成相同语义。
- 接入原生 Composer / appiconset / Android res 目录，支持高级原生配置，具体语义交由官方构建工具处理。
- 使用纯 JS pngjs 与自有面积采样，避免为 Android/Web 引入 Apple 图像工具或原生图片依赖。
- 在生成工程后补 iOS 资源、幂等追加 Android 条件脚本，支持已复制旧版模板的应用，不覆盖原始宿主文件。
- Web 在 CLI 的 Vite API 入口中注入插件，兼容旧 Vite 模板且支持 base 子路径。
- 不自动反色或从彩色图片派生 monochrome，避免错误设计结果。
