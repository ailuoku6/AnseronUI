# 框架开发与仓库示例

本文面向修改 AnseronUI 框架的贡献者。创建独立 App、编写页面和运行应用，请从[根 README](../README.md)开始。以下命令均在框架仓库根目录执行。

## 开发环境与依赖

当前构建脚本以 macOS Apple Silicon 开发环境为主要验证环境：iOS 模拟器和设备构建固定 arm64，Android 产物固定 `arm64-v8a`。不要把这些命令视为已经覆盖 Intel 模拟器或所有开发主机。

- 通用：Node.js 24+、npm、Python 3、C/C++ 工具链；`prepare:compiler` 安装编译器依赖时还需要 pnpm。
- 编译器：仓库包含固定版本的 [scriptc](https://github.com/vercel-labs/scriptc) 0.4.8 及异步 embedding 适配；首次准备会安装 npm 依赖。
- iOS：完整 Xcode 和已选择的 Developer 目录；部署目标为 iOS 15+。
- Android：JDK 17、Android SDK（compileSdk 35）、NDK；应用最低 Android API 26。
- Web/Wasm：同一套 [scriptc](https://github.com/vercel-labs/scriptc)/WASI 编译链。Wasm 相关编译需要可用的 Zig 工具链。

在框架仓库根目录执行：

```sh
npm ci --ignore-scripts
npm run prepare:tools
npm run prepare:compiler
```

`internal/toolchain/scriptc` 是主仓库内管理的 [scriptc](https://github.com/vercel-labs/scriptc) 0.4.8 上游源码，已包含 `internal/toolchain/async-embedding.patch` 的适配。`prepare:compiler` 安装必要依赖、复用匹配的 LLVM helper 并编译编译器入口，不会克隆 Git 子仓。

## 运行仓库示例

以下命令都在框架根目录运行。

### Web

```sh
npm run build:web
npm run dev:wasm
```

打开终端显示的地址；配置端口为 5175，端口占用时以 Vite 实际输出为准。默认生产产物位于 `examples/dist/wasm-web/`。修改共享 TSX/Core 后需要重新执行 `build:web`，仅刷新 Vite 不会更新 AOT 业务包；未变化的 Framework Core 会复用。

`npm run dev:counter`、`npm run dev:async-form` 启动的是 JavaScript 参考宿主，适合调试参考运行时，不能替代真实 Wasm 验证。

### iOS 模拟器

```sh
npm run build:ios
open "$(xcode-select -p)/Applications/Simulator.app"
xcrun simctl list devices available
```

在 Simulator 中启动一个 arm64 iPhone/iPad 模拟器后执行：

```sh
xcrun simctl bootstatus booted -b
xcrun simctl install booted .verification/ios-app/Build/Products/Debug-iphonesimulator/AnseronUIDemo.app
xcrun simctl launch --terminate-running-process booted org.anseronui.demo
```

有多个模拟器时，把 `booted` 换成目标设备的 UDID。使用完整路径打开 Simulator 可以避免 `open -a Simulator` 无法查到应用；`xcode-select -p` 必须指向完整 Xcode。可在启动命令末尾加 `--components` 直接打开组件页。

`npm run build:ios-device` 生成 `.verification/ios-device-app/` 下的未签名设备产物。Xcode 工程每次构建会核对 Core 源码指纹；提示 Core 过期时应重新执行对应的 `build:ios` 或 `build:ios-device`，单独编译 Swift 不会更新 Core。

### Android

```sh
npm run build:android
adb install -r examples/native/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n org.anseronui.demo/.MainActivity
```

请先启动 arm64 Android 模拟器或连接设备；多个设备时使用 `adb -s <设备序列号>`。SDK 路径可通过 `ANDROID_HOME` / `ANDROID_SDK_ROOT` 设置，NDK 可通过 `ANDROID_NDK_ROOT` 设置。

异步表单的 HTTP 演示依赖本地 fixture：另开终端运行 `npm run dev:async-form -- --port 5174 --strictPort`，Android 再运行 `adb reverse tcp:5174 tcp:5174`。没有 fixture 时，HTTP 演示或依赖它的设备测试会失败。

### 示例内容

「组件」页使用全部八个基础组件，包含计数、禁用按钮、输入、富文本、触摸传播、离线图片和视频；页面内还可以切换「布局样式」和「动画」。悬浮球由共享 TSX 和触摸事件实现。「扩展」页演示 Module、自定义原生开关和 ref。

示例媒体在 `examples/components/assets/`，通过 `asset://showcase.png` 和 `asset://showcase.mp4` 使用。业务自己的资源需要按宿主打包规则加入，详见[能力清单](capabilities.md)。

## 检查与验证

文档和常规框架修改可以先执行：

```sh
npm run typecheck:framework
npm run test:framework
npm run test:tooling
npm run test:build
```

修改布局、Core 或平台渲染时，还需要按影响范围执行：

```sh
npm run test:layout
npm run test:layout:wasm
npm run build:core:native
npm run test:core:native
npm run build:core:wasm
npm run test:core:wasm
```

`test:layout` 会在忽略的 `.verification/` 目录获取固定版本的上游参照，首次需要网络，详见[布局验证说明](../packages/layout/README.md)。原生/Wasm 测试要求先构建对应 Core；iOS UI 测试和 Android `connectedDebugAndroidTest` 还依赖可用设备、SDK 和 HTTP fixture。历史验证记录不代表每次修改都已重新跑过全量设备测试。


## 自动发布到 npm

[Publish 工作流](../.github/workflows/publish.yml) 使用 GitHub 托管的 Ubuntu runner 和 Node.js 24。推送 `v*` 标签时自动触发，也可以在仓库 Actions → Publish → Run workflow 手动触发。标签触发时，标签去掉 `v` 后必须与根目录 `package.json` 的版本完全相同。

工作流执行 `npm ci --ignore-scripts`，再通过 `npm publish --access public --provenance` 发布根目录的 `anseronui` 包。发布命令自动执行现有 `prepublishOnly` 检查和 `prepack` 打包；任一检查失败都会终止发布。它不构建 iOS/Android 应用，也不发布各 workspace 包。

认证采用 [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)，无需配置 `NPM_TOKEN`。先在 npm 的 `anseronui` 包设置中添加 GitHub Actions trusted publisher：

| 字段 | 值 |
| --- | --- |
| Organization or user | `ailuoku6` |
| Repository | `AnseronUI` |
| Workflow filename | `publish.yml`，只填文件名 |
| Environment name | 留空，工作流未配置 environment |
| Allowed actions | 允许直接使用 `npm publish` |

如果包尚不存在，先在本机登录 npm 完成首次发布，再配置 trusted publisher。新建的 trusted publisher 需要在两天内成功发布一次才能完成验证；配置过期时需重新创建。所有字段需与仓库及工作流大小写一致。

提交并推送待发布的源码和工作流后，使用匹配当前版本的标签触发发布：

```sh
release_version="$(node -p "require('./package.json').version")"
git tag "v${release_version}"
git push origin "v${release_version}"
```

后续版本先执行 `npm version patch --no-git-tag-version`，提交并推送 `package.json`、`package-lock.json` 和本次修改，再创建相应标签。同一 npm 版本不能重复发布；手动触发也会发布所选 ref 中的版本，因此需要选择尚未发布的版本提交。手动入口需在默认分支包含此工作流后才会出现在 Actions 中。
