# 快速开始

用已发布的 `anseronui` 包创建应用，并在一个平台上跑起来。页面怎么写，见[编写页面](pages.md)。

## 准备一个平台

需要 Node.js 24+ 和 npm。安装依赖时保留 optional dependencies。

先只准备你要运行的那一个平台。各平台 SDK 见[环境](../../README.md#环境)。

## 创建并运行

```sh
npx anseronui create hello-app --application-id com.example.hello
cd hello-app
npm install
npm run setup
npm run ios
```

`npm install` 只安装依赖。`setup` 在应用自己的 `.anseronui/sdk` 里构建编译器，创建后要运行一次。升级 `anseronui` 后再次运行 `npm install` 和 `npm run setup`。

其他平台：

```sh
npm run android
npm run macos
npm run harmony
npm run build:web && npm run dev:web
```

Web 修改 TSX 后要重新 `build:web`，再刷新浏览器。设备选择、Release 和签名见[构建与运行](../reference/build.md)。

## 生成的工程

```text
hello-app/
├── src/pages/          # 共享页面，先改这里
├── anseronui.config.json
├── platforms/          # iOS、Android、macOS、HarmonyOS 宿主
├── web/
├── assets/
└── package.json
```

首页是一个计数器，并有打开详情页的按钮。页面文件使用 `anseronui/ui`。

## 下一步

打开 `src/pages/home.tsx`，按[编写页面](pages.md)改一处文字并重新运行。
