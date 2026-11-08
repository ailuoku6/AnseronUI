# 应用创建与接入

AnseronUI 仓库提供一个轻量 CLI，统一处理新应用骨架、现有项目接入、配置检查和构建入口。命令在框架仓库根目录执行：

```sh
npm run anseronui -- create apps/shop
npm run anseronui -- check --config apps/shop/anseronui.config.json
npm run anseronui -- build web --config apps/shop/anseronui.config.json
```

先在框架根目录完成 `npm ci --ignore-scripts`、`npm run prepare:tools`、`npm run prepare:compiler`；具体工具链要求见[根 README](../README.md#环境与安装)。当前 CLI 随源码仓库使用，不是已发布的独立 npm 创建器。

本项目采用 scriptc 静态 library/Wasm 构建。业务代码需满足 [TS/TSX 编写限制](typescript-limitations.md)；一个配置中的全部页面进入业务包，Framework Core 独立编译和复用；详见[独立 Core 与业务包](core-bundles.md)。

## 新建应用

`create` 会生成一个可以直接进入共享 Core 构建链路的应用：

```sh
npm run anseronui -- create apps/my-app --name my-app
cd apps/my-app
npm install
npm run check
npm run build:web
```

生成内容包括：

- `anseronui.config.json`：页面、源码目录、Web 入口和 Wasm 静态资源目录。
- `src/pages/home.tsx`、`src/pages/details.tsx`：带 `useRouter()` 跳转示例的页面。
- `web/index.html`、`web/main.ts`、`web/vite.config.ts`：可直接构建的 Web/Wasm 入口。
- `package.json`：转发到框架 CLI 的 `check`、`build:web`、`build:ios` 和 `build:android` 脚本。

默认生成目录必须在 AnseronUI 工作区内，这样 Core 编译器可以访问 `packages/core`、`packages/ui` 和原生 renderer。业务代码可以继续放在 `apps/<name>` 下，多个应用共享同一份框架源码。

回到框架根目录后，原生构建使用同一份配置：

```sh
npm run anseronui -- build ios --config apps/my-app/anseronui.config.json
npm run anseronui -- build android --config apps/my-app/anseronui.config.json
```

新应用的 iOS/Android 构建直接使用框架提供的通用宿主和页面清单，新增 TSX 页面、路由跳转和返回键监听不需要编写 `App.swift` 或 `MainActivity.kt`。生成的宿主会从 Core manifest 读取页面名称，连接 `AnseronUIRenderView`、路由栈和系统返回键。只有需要自定义原生模块、原生组件或品牌化 App 壳时，才需要扩展宿主代码。

## 接入现有应用

在 **AnseronUI 框架根目录** 执行，参数指向已有项目目录：

```sh
npm run anseronui -- integrate ../existing-app --name existing-app
```

命令会生成：

- `anseronui.config.json`：接入页面的构建配置。
- `src/anseronui/pages/home.tsx`：最小接入页面。
- `ANSERONUI_INTEGRATION.md`：iOS、Android、Web 的具体挂载步骤和生命周期要求。

接入命令只新增 AnseronUI 文件，不修改现有 App 的入口、路由、网络层或状态管理，也不会自动完成原生依赖链接。iOS 需链接对应 Core 静态库和 C transport；Android 需构建并打包 JNI 库，详见 [iOS](../packages/render-ios/README.md) 和 [Android](../packages/render-android/README.md) 接入说明。推荐先挂载一个页面，验证布局和事件，再逐页迁移。原生侧使用 `AnseronUIRenderView.load(page)` 启动页面，页面离开或宿主销毁时调用 `destroy()`；Web 侧使用 `BrowserHost.mount(page, width, height)`。

现有项目可以保留自己的导航系统：导航按钮可以直接调用原生容器的 `load`/`push`/`pop`，或者在 TSX 内使用 `useRouter()`。框架 module 名 `router` 由 AnseronUI 保留，业务 module 应使用自己的命名空间。Web 项目继续使用自己的 Vite 入口时，在配置中补充 `web.viteConfig` 后再运行 `anseronui build web`。

## 配置检查

```sh
npm run anseronui -- check --config path/to/anseronui.config.json
```

当前 `check` 校验 buildId、非空页面数组、导出标识符、重复 export 及源码文件存在性；它不会解析源码来证明导出实际存在，也不能替代类型检查、AOT 构建或设备验证。页面名称与真实 `definePage` 应保持一致，并在运行时验证可跳转。

## 配置示例与路径

以下为放在 `apps/shop/anseronui.config.json` 中的配置。源码目录、页面 source、`web.viteConfig` 和 `web.publicDir` 按 **框架根目录** 解析；不要因为配置位于子目录就省略 `apps/shop/`。

```json
{
  "buildId": "shop-app",
  "sourceDirs": ["apps/shop/src/pages"],
  "pages": [
    { "name": "home", "source": "apps/shop/src/pages/home.tsx", "export": "homePage" },
    { "name": "details", "source": "apps/shop/src/pages/details.tsx", "export": "detailsPage" }
  ],
  "web": {
    "viteConfig": "apps/shop/web/vite.config.ts",
    "publicDir": "apps/shop/web/public"
  }
}
```

`sourceDirs` 应包含页面及其共享 TS/TSX 依赖；`source` 指向 TSX 文件，`export` 是该文件实际导出的页面定义。`buildId` 标识 bundle，不等于原生应用包名。新增页面需要同时编写 `definePage` 和更新 `pages`，然后重新构建 Core。

`integrate` 支持工作区外的既有工程，生成路径仍相对于框架根目录；移动框架与业务目录后需要同步更新。Web 接入需自行提供 Vite 入口和 `web` 配置，生成器的 `create` 才会生成完整 Web 壳。

## 开发与构建约束

- 从生成应用目录执行 `npm run build:web`、`npm run build:ios` 或 `npm run build:android` 会使用该目录配置；从框架根目录选择非默认应用时请使用 `npm run anseronui -- build <目标> --config <配置>`。根目录的 `npm run build:ios` 等快捷脚本不会解析 `--config` 参数。
- 修改共享 TSX/Core 后需要重新 AOT 构建；Web 开发服务器只刷新入口并不能替代 Core 编译。生成应用可在框架根目录用 `npx vite --config apps/my-app/web/vite.config.ts` 预览，先执行一次对应 `build web`。
- 当前原生目标共用示例工程、`org.anseronui.demo` 包名和产物目录；`--name` 不会自动生成独立品牌、签名、图标或原生包名。多个应用/目标构建请串行执行，避免覆盖共用 staging 和 manifest。
- 自定义媒体不是应用目录的自动发现功能。iOS 加入 bundle 的 `assets` 资源目录，Android 加入 assets/sourceSets，Web 放入配置的 public 目录；参见[媒体说明](capabilities.md#图片视频和富文本)。
- 默认遇到已有目标文件会报错；`--force` 会覆盖生成器管理的同名文件，仅在确认可覆盖时使用。

更多入口：[文档总览](README.md) · [架构与原理](architecture.md)。
