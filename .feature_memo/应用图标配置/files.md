# Files

| Path | 作用 |
| --- | --- |
| `scripts/app-icons.mjs` | 配置、生成、平台接入、Web 插件 |
| `scripts/app-icons.test.mjs` | 配置、缩放、各端生成、Web、可选原生编译测试 |
| `scripts/web-app.mjs` | Vite API 入口 |
| `scripts/standalone-app.mjs` | check/build/dev 路径、SDK pngjs 链接、新工程 README |
| `scripts/anseronui.mjs` | CLI check 校验 |
| `scripts/macos-app.mjs` | .app 图标及输入指纹 |
| `scripts/sdk-files.mjs` | 新脚本和图标文档打入 SDK |
| `scripts/npm-package.test.mjs` | 验证包内脚本和文档 |
| `package.json`, `package-lock.json` | pngjs 与工具测试入口 |
| `README.md`, `docs/README.md`, `docs/tooling.md`, `docs/app-icons.md` | 文档入口和完整配置说明 |
| `THIRD_PARTY_NOTICES.md` | pngjs 许可说明 |

## Ownership

- 开始时工作区已有持久化布局树及 Core 等改动；未改动这些业务文件。
- `.verification/icon-*-probe` 等是本轮隔离验证工程和日志，不参与发布。

默认图标新增：`assets/icons/`、`scripts/templates/app/assets/icons/`、`scripts/generate-default-icons.mjs`。演示接入：`anseronui.config.json`、`scripts/build-app.mjs`、`examples/native/web/vite.config.ts`、Android app Gradle 条件接入和根 `.gitignore`。
