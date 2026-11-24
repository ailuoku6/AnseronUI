# 框架开发与仓库示例

本文面向修改 AnseronUI 框架的贡献者。贡献入口见 [CONTRIBUTING.md](../../CONTRIBUTING.md)。用已发布的 npm 包创建应用，请从[快速开始](../getting-started/quick-start.md)开始。以下命令均在框架仓库根目录执行。

## 开发环境与依赖

当前构建脚本以 macOS Apple Silicon 开发环境为主要验证环境：iOS 模拟器和设备构建固定 arm64，Android 产物固定 `arm64-v8a`。不要把这些命令视为已经覆盖 Intel 模拟器或所有开发主机。

- 通用：Node.js 24+、npm、Python 3、C/C++ 工具链；`prepare:compiler` 安装编译器依赖时还需要 pnpm。
- 编译器：仓库包含固定版本的 [scriptc](https://github.com/vercel-labs/scriptc) 0.4.8 及异步 embedding 适配；首次准备会安装 npm 依赖。
- iOS：完整 Xcode 和已选择的 Developer 目录；部署目标为 iOS 15+。
- Android：JDK 17、Android SDK（compileSdk 35）、NDK；应用最低 Android API 26。
- macOS：Apple Silicon、macOS 15+ 构建主机与完整 Xcode；产物声明最低 macOS 14，兼容性验证边界见 [AppKit Renderer](../../packages/render-macos/README.md)。
- Web/Wasm：同一套 [scriptc](https://github.com/vercel-labs/scriptc)/WASI 编译链。Wasm 相关编译需要可用的 Zig 工具链。

在框架仓库根目录执行：

```sh
npm ci --ignore-scripts
npm run prepare:tools
npm run prepare:compiler
```

`internal/toolchain/scriptc` 是主仓库内管理的 [scriptc](https://github.com/vercel-labs/scriptc) 0.4.8 上游源码，已包含 `internal/toolchain/async-embedding.patch` 的适配。`prepare:compiler` 安装必要依赖、复用匹配的 LLVM helper 并编译编译器入口，不会克隆 Git 子仓。

## 用本仓库源码创建应用

要让应用直接编译本仓库里的框架源码时，使用 `--local-framework`：

```sh
npm run prepare:compiler
npm run anseronui -- create ../dev-app --local-framework
cd ../dev-app
npm run setup
npm run ios
```

这种应用的页面路径相对于框架仓库，并和仓库共享编译缓存。多个这样的应用要串行构建。缓存规则见[Core 与业务包](../architecture/core-bundles.md)。

普通应用使用 `npx anseronui create`。它依赖已发布的 `anseronui` 包，并在应用自己的 `.anseronui/sdk` 里保存 SDK 和缓存。`--package <版本或tarball>` 可以指定依赖版本。

把页面嵌进已有原生工程见[接入已有工程](../guides/project/existing-app.md)。

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

### macOS

```sh
npm run build:macos
open .verification/macos/App.app
npm run test:macos
```

仓库宿主位于 `examples/native/macos`，通过 Navigate 菜单切换页面。`test:macos` 编译并运行真实 AOT Core + AppKit 集成；它覆盖控件、路由、异步、扩展和销毁，不能代替 IME、媒体、无障碍等专项设备验收。

### 示例内容

「组件」页使用全部八个基础组件，包含计数、禁用按钮、输入、富文本、触摸传播、离线图片和视频；页面内还可以切换「布局样式」和「动画」。悬浮球由共享 TSX 和触摸事件实现。「扩展」页演示 Module、自定义原生开关和 ref。

示例媒体在 `examples/components/assets/`，通过 `asset://showcase.png` 和 `asset://showcase.mp4` 使用。业务自己的资源需要按宿主打包规则加入，详见[组件参考](../reference/components.md)。

## 检查与验证

每次 push 的自动测试、平台套件和设备 runner 配置见[自动测试](testing.md)。本地统一入口为 `npm test`；完整平台入口为 `npm run test:ci -- <suite>`。

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

`test:layout` 会在忽略的 `.verification/` 目录获取固定版本的上游参照，首次需要网络，详见[布局验证说明](../../packages/layout/README.md)。原生/Wasm 测试要求先构建对应 Core；iOS UI 测试和 Android `connectedDebugAndroidTest` 还依赖可用设备、SDK 和 HTTP fixture。历史验证记录不代表每次修改都已重新跑过全量设备测试。

## 打包与发布

`npm pack` 运行 `prepack`，按根 `package.json` 的文件清单生成 `dist/sdk`。发布包包含 CLI、框架源码、编译器、runtime、原生头文件、模板和第三方声明。它不包含 Git 历史、测试或本机产物。`prepublishOnly` 会运行类型检查、工具测试、构建输入测试和打包测试。

打包前运行发布检查：

```sh
npm run test:tooling
npm run test:build
npm run test:package
npm pack --dry-run
```

AnseronUI 自有代码采用 MIT。第三方许可见根目录 `THIRD_PARTY_NOTICES.md`。npm 自动发布工作流见下文。消费者工程可以用 `--package <npm版本或tarball路径>` 指定 SDK 版本或本地 tarball。

## 自动发布到 npm

[Publish 工作流](../../.github/workflows/publish.yml) 使用 GitHub 托管的 Ubuntu runner 和 Node.js 24。推送 `v*` 标签时自动触发，也可以在仓库 Actions → Publish → Run workflow 手动触发。标签触发时，标签去掉 `v` 后必须与根目录 `package.json` 的版本完全相同。

工作流执行 `npm ci --ignore-scripts`，再通过 `npm publish --access public --provenance` 发布根目录的 `anseronui` 包。发布命令自动执行现有 `prepublishOnly` 检查和 `prepack` 打包；任一检查失败都会终止发布。它不构建 iOS/Android 应用，也不发布各 workspace 包。

npm 上的包名是 `anseronui`。认证采用 [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)，无需配置 `NPM_TOKEN`。publisher 配置为：

| 字段 | 值 |
| --- | --- |
| Organization or user | `ailuoku6` |
| Repository | `AnseronUI` |
| Workflow filename | `publish.yml`，只填文件名 |
| Environment name | 留空，工作流未配置 environment |
| Allowed actions | 允许直接使用 `npm publish` |

字段需与仓库及工作流大小写一致。重新创建 trusted publisher 后，要在两天内成功发布一次，配置才会保持有效。

提交并推送待发布的源码和工作流后，使用匹配当前版本的标签触发发布：

```sh
release_version="$(node -p "require('./package.json').version")"
git tag "v${release_version}"
git push origin "v${release_version}"
```

后续版本先执行 `npm version patch --no-git-tag-version`，提交并推送 `package.json`、`package-lock.json` 和本次修改，再创建相应标签。同一个版本号不能再次发布。手动触发也会发布所选 ref 里的版本，所以要选择 npm 上还没有的版本。手动入口需在默认分支包含此工作流后才会出现在 Actions 中。
