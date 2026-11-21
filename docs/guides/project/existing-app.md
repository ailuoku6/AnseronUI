# 接入已有工程

新应用用 `npx anseronui create` 生成完整宿主，见[快速开始](../../getting-started/quick-start.md)。已有 iOS、Android、macOS 或 Web 工程只想嵌入页面时，用 `integrate`。

在框架仓库根目录执行，参数指向已有项目：

```sh
npm run anseronui -- integrate ../existing-app --name existing-app
```

命令只新增这些文件：

- `anseronui.config.json`：页面构建配置。页面路径相对于框架仓库。
- `src/anseronui/pages/home.tsx`：最小页面。
- `ANSERONUI_INTEGRATION.md`：挂载入口和生命周期。

它不修改现有入口、路由、网络或状态管理，也不替宿主完成原生链接。目标里已有配置时，命令会拒绝覆盖；确认要替换生成文件后再加 `--force`。

宿主链接对应 Core 静态库和 C transport 后，用 `AnseronUIRenderView.load(page)` 打开页面，离开或销毁时调用 `destroy()`。Web 使用 `BrowserHost.mount(page, width, height)`。链接步骤见 [iOS](../../../packages/render-ios/README.md)、[Android](../../../packages/render-android/README.md)、[macOS](../../../packages/render-macos/README.md)。

先挂一个页面，确认布局和事件，再逐页迁移。宿主可以继续用自己的导航，直接调用 `load`、`push`、`pop`；也可以在 TSX 里使用 `useRouter()`。模块名 `router` 由框架保留。

Web 项目继续使用自己的 Vite 入口时，在配置中补充 `web.viteConfig`，再从框架仓库运行 `anseronui build web --config <配置路径>`。

图标仍由已有宿主负责。`anseronui create` 的图标配置见[应用图标](app-icons.md)。
