# 应用创建、构建与运行

AnseronUI 以单个 `anseronui` npm 包提供 CLI、TSX API、Web Renderer、原生 Renderer 源码和应用模板。目前尚未发布 npm；可以先使用本地 tarball 验证。

## 首次准备与创建

发布后的使用方式：

```sh
npx anseronui@0.1.0 create myApp --application-id com.example.myapp
cd myApp
npm install
npm run setup
npm run check
npm run typecheck
```

尚未发布时，从框架根目录创建本地包：

```sh
npm ci --ignore-scripts
npm pack --pack-destination /tmp
node scripts/anseronui.mjs create ../myApp --package /tmp/anseronui-0.1.0.tgz
cd ../myApp
npm install
npm run setup
```

需要 Node.js 24+。`setup` 在应用自己的 `.anseronui/sdk` 准备 SDK；npm 包已包含 scriptc 0.4.8 上游源码和 AnseronUI async embedding 适配，因此 setup 只安装必要依赖并构建编译器，不创建 Git 子仓。普通 npm 安装不构建编译器，必须显式运行 `setup`。iOS 还需要 macOS、Xcode、Python 3 及已安装的 Simulator runtime；macOS 构建需要 Apple Silicon Mac、macOS 15+ 和完整 Xcode；Android 需要 SDK 35、NDK、JDK 17–22（推荐 17，兼容 Android Studio JBR 21）及 ARM64 模拟器或设备。LLVM 和 runtime pack 由 scriptc 的 npm 依赖提供；不要禁用 optional dependencies。

目录可位于框架内部或外部；`--name` 保留应用显示名称的大小写，npm 包名和 buildId 转为小写。名称需以英文字母开头，只包含字母、数字、下划线或连字符。`--application-id` 同时设置 iOS Bundle ID 与 Android applicationId，使用小写反向域名；未指定时默认为 `com.<去除名称中连字符和下划线的名称>.app`。

生成内容：

- `src/pages/home.tsx`、`details.tsx`：共享页面、Router 跳转与返回。
- `platforms/ios/App.swift`、`Info.plist`：独立 UIKit 宿主；构建时生成 `App.xcodeproj`。
- `platforms/android`：独立 Gradle App、Renderer 引用和 Gradle wrapper。
- `platforms/macos/App.swift`：独立 AppKit 宿主；直接通过 Xcode 工具构建 `.app`。
- `web`：Web/Wasm 宿主，整个视口展示 TSX 页面。
- `anseronui.config.json`：框架引用、应用标识和页面清单。
- `scripts`：iOS 工程生成及本地 Core 校验。
- `package.json`：固定版本的 `anseronui` 依赖和 npm bin 脚本。

新工程使用 `anseronui/ui`、`anseronui/ui/jsx-runtime` 和 `anseronui/render-web`，无需安装私有 workspace 子包。SDK 内部引用在打包时改成相对路径。`setup` 将 SDK 源码复制到应用的 `.anseronui/sdk`，工具依赖链接到实际 npm 安装位置；应用 `node_modules` 由 npm 正常管理。不同应用拥有各自的编译器、staging 和缓存。升级 npm 包后重新运行 `npm run setup`。

宿主不添加页面选择器或调试说明；诊断写入日志。iOS 安全区域和 Android 系统栏背景跟随 TSX 根背景，内容保持安全间距。

目标目录非空时默认拒绝创建。`--force` 覆盖模板管理的同名文件，包括页面、宿主和配置；自定义工程应先保存改动。框架本身及包含框架的祖先目录不能作为目标。

## 一条命令构建并启动

在生成工程目录中：

```sh
npm run ios
npm run android
npm run macos
```

等价的应用内 CLI：

```sh
npx --no-install anseronui run ios
npx --no-install anseronui run android
```

`run` 依次选择/启动设备、构建、安装、启动。构建或安装失败后停止，错误不会被后续启动命令掩盖。

```sh
npm run ios -- --device <模拟器UUID或名称>
npm run android -- --device <adb序列号>
npm run android -- --avd <AVD名称>
npm run ios -- --no-build
npm run android -- --dry-run
```

- iOS：默认使用唯一已启动模拟器；没有已启动设备时选择第一个可用 iPhone 并启动。多个已启动模拟器或重复名称需要指定 UUID，可用 `xcrun simctl list devices available` 查询。窗口优先打开 Simulator，较新 Xcode 则尝试 Device Hub。
- Android：默认使用唯一在线设备。没有连接设备且只有一个 AVD 时自动启动；多个 AVD 请用 `--avd`，多个连接设备请用 `--device`。`adb devices` 查看序列号，`emulator -list-avds` 查看 AVD。离线/未授权设备会提示处理后重试，不自动绕过授权。
- macOS：构建 Apple Silicon arm64 `.app` 并在当前 Mac 启动，不涉及设备选择；可用 `npm run macos -- --no-build` 启动已有且身份校验通过的产物。
- Android 安装前检查 `arm64-v8a` 支持，拒绝向 x86 模拟器安装。启动 AVD 使用与 adb 一致的 SDK 环境，启动日志位于应用 `.verification/emulator.log`。等待启动最多 180 秒。
- `--device` 和 `--avd` 互斥，`--avd` 仅用于 Android。
- iOS/Android 的 `--no-build` 安装并启动已有产物，不检查业务源码是否变化；macOS 会校验 Core、宿主及插件输入，变化后要求重建。
- `--dry-run` 仅打印平台、应用标识、设备选择条件和步骤，不访问设备、不构建、不创建依赖链接。

`run ios` 只面向模拟器。iOS 真机需开发团队与签名，使用下方 `build:ios-device` 后通过 Xcode 配置安装。Android 可直接选择模拟器或已授权的 ARM64 真机。

## 只构建与 Web 开发

新建 App 已附带 `assets/icons/` 默认图标和对应配置，第一次构建即可显示。应用图标在 `app.icon` 配置：支持单张 PNG、iOS 浅色／深色／着色及 Icon Composer、Android 自适应／单色主题和 night 资源。配置示例、平台限制和旧工程兼容方式见[应用图标](app-icons.md)。修改图标后重新构建，`--no-build` 仍使用上次产物。

```sh
npm run build:ios
npm run build:ios-device
npm run build:android
npm run build:macos
npm run build:web
npm run dev:web
```

四端正式构建使用对应的 `:release` 命令：

```sh
npm run build:web:release
npm run build:ios:release
npm run build:android:release
npm run build:macos:release
```

三端签名分发使用 `:signed` 命令。iOS 默认为 App Store Connect 导出方式（可用 `ANSERONUI_IOS_EXPORT_METHOD` 改成其他 Xcode 导出类型）；Android 必须配置完整 keystore；macOS 必须配置 Developer ID Application。缺少必要签名身份时命令会提前失败。

```sh
npm run build:ios:signed
npm run build:android:signed
npm run build:macos:signed
```

Web 产物位于 `dist/web/`。iOS 产物位于 `.verification/ios-release/`，未签名的 `:release` 命令只生成 `App.xcarchive`；`:signed` 设置 `ANSERONUI_IOS_TEAM_ID` 并使用 Xcode 自动签名证书导出签名 IPA。`ANSERONUI_IOS_EXPORT_METHOD` 可选 `app-store-connect`（默认）、`ad-hoc`、`development` 或 `enterprise`。Android 的 `:signed` 同时要求 `ANSERONUI_ANDROID_KEYSTORE`、`ANSERONUI_ANDROID_STORE_PASSWORD`、`ANSERONUI_ANDROID_KEY_ALIAS`、`ANSERONUI_ANDROID_KEY_PASSWORD`，构建签名 APK/AAB；缺少部分值或找不到 keystore 会直接报错。macOS 的 `:signed` 要求 `ANSERONUI_MACOS_SIGN_IDENTITY` 为 Developer ID Application 证书名称，构建 hardened runtime 签名 `.app` 和同目录 ZIP。配置 `ANSERONUI_NOTARY_PROFILE`（由 `xcrun notarytool store-credentials` 创建）后，构建会先公证并 staple，再生成分发 ZIP。

Web 默认地址为 `http://localhost:5175`；修改 TSX 页面后重新 `build:web` 生成 AOT Wasm，再刷新页面。Vite 刷新不能代替 Core 编译。

产物路径：

| 目标 | 应用内路径 |
| --- | --- |
| iOS 模拟器 | `.verification/ios/Build/Products/Debug-iphonesimulator/App.app` |
| iOS 未签名真机 | `.verification/ios-device/Build/Products/Debug-iphoneos/App.app` |
| Android Debug | `platforms/android/app/build/outputs/apk/debug/app-debug.apk` |
| macOS | `.verification/macos/App.app` |
| Web | `dist/web` |

Android SDK 通过 `ANDROID_HOME` / `ANDROID_SDK_ROOT` 指定，NDK 通过 `ANDROID_NDK_ROOT` 指定。构建脚本会在兼容 JAVA_HOME、macOS 安装的 JDK 17 和 Android Studio JBR 中选择可用 Java，不修改系统 Java 设置。

Framework/业务编译 staging 和缓存位于当前应用的 `.anseronui/sdk/.verification`。CLI 使用其中的 `app-build.lock` 防止同一应用的构建同时覆盖 staging，完成后释放；不同应用互不争用。进程被强制终止遗留锁时，先确认锁文件记录的 PID 已停止，再删除锁后重试。

## 本地框架开发模式

框架开发者可继续使用旧的源码引用模式：

```sh
npm run prepare:compiler
npm run anseronui -- create ../devApp --local-framework
cd ../devApp
npm run setup
npm run ios
```

该模式保留框架相对路径和共享构建缓存，用于联调尚未打包的源码；旧工程仍可使用原配置。使用 npm 包的普通用户应选择默认创建模式。

## npm 分发与发布准备

`npm pack` 自动执行 `prepack`，从显式文件清单生成 `dist/sdk`，分发运行所需脚本、框架源码、scriptc 编译器和 runtime 源码、原生头文件、模板、Gradle wrapper 及第三方许可证。不包含 Git 历史、测试、编译产物或本地依赖。源仓库的 workspaces 仅用于开发，不是消费者的 registry 依赖。发布包的根 `exports` 指向单包 API，根 `bin` 指向打包后的 CLI。`prepublishOnly` 在发布前自动运行类型检查、CLI、构建输入和打包测试。

```sh
npm run test:tooling
npm run test:build
npm run test:package
npm pack --dry-run
```

AnseronUI 自有代码采用 MIT，第三方说明见根目录 `THIRD_PARTY_NOTICES.md`。发布前确认 npm 包名所有权、版本号和发布账号；自动发布配置及标签操作见[框架开发文档](framework-development.md#自动发布到-npm)。`--package <npm版本或tarball路径>` 可覆盖生成工程的依赖来源，方便本地包或预发布版本验证。模板有二进制 Gradle wrapper 和 gitignore，打包测试会检查它们没有被 npm 遗漏。

## 接入现有应用

在 **AnseronUI 框架根目录** 执行，参数指向已有项目目录：

```sh
npm run anseronui -- integrate ../existing-app --name existing-app
```

命令会生成：

- `anseronui.config.json`：接入页面的构建配置。
- `src/anseronui/pages/home.tsx`：最小接入页面。
- `ANSERONUI_INTEGRATION.md`：iOS、Android、macOS、Web 的挂载入口和生命周期要求。

接入命令只新增 AnseronUI 文件，不修改现有 App 的入口、路由、网络层或状态管理，也不会自动完成原生依赖链接。原生宿主需链接对应 Core 静态库和 C transport；详见 [iOS](../packages/render-ios/README.md)、[Android](../packages/render-android/README.md) 和 [macOS](../packages/render-macos/README.md) 接入说明。推荐先挂载一个页面，验证布局和事件，再逐页迁移。原生侧使用 `AnseronUIRenderView.load(page)` 启动页面，页面离开或宿主销毁时调用 `destroy()`；Web 侧使用 `BrowserHost.mount(page, width, height)`。

现有项目可以保留自己的导航系统：导航按钮可以直接调用原生容器的 `load`/`push`/`pop`，或者在 TSX 内使用 `useRouter()`。框架 module 名 `router` 由 AnseronUI 保留，业务 module 应使用自己的命名空间。Web 项目继续使用自己的 Vite 入口时，在配置中补充 `web.viteConfig` 后再运行 `anseronui build web`。

## 配置与路径

```json
{
  "schemaVersion": 2,
  "buildId": "myapp-app",
  "app": {
    "name": "myApp",
    "applicationId": "com.example.myapp",
    "framework": ".anseronui/sdk"
  },
  "sourceDirs": ["src"],
  "pages": [
    { "name": "home", "source": "src/pages/home.tsx", "export": "homePage" }
  ],
  "web": {
    "viteConfig": "web/vite.config.ts",
    "publicDir": "web/public"
  }
}
```

`schemaVersion: 2` 的 sourceDirs、page.source、web 路径均相对于应用配置目录，`app.framework` 固定为 `.anseronui/sdk`。CLI 自动生成 `.anseronui/build.config.json` 供底层编译器使用，不要手工维护此中间配置。移动整个工程后重新运行 setup/build 即可刷新工具依赖链接和原生工程引用。

旧源码模式没有 schemaVersion；app.framework 相对于应用配置目录，sourceDirs、page.source、web 路径相对于框架根目录，移动目录后仍需手动调整。`integrate` 保持已有源码仓库接入流程，暂不自动迁移现有宿主到 npm 模式。

应用标识已写入生成的宿主、Info.plist 与 Gradle 配置；手动修改配置中的 name/applicationId/buildId 时需同步调整这些文件。新增 TSX 页面需要导出 definePage 并更新 pages。`sourceDirs` 覆盖页面与共享依赖，API 和静态编译要求见 [TS/TSX 限制](typescript-limitations.md)。

`check` 检查 buildId、页面数组、重复 export、源码存在性；不能替代类型检查、AOT 构建和设备验证。旧版配置没有 app 字段时，build 仍按原通用示例宿主流程执行；run 仅支持独立工程配置。

自定义原生能力通过 Module/ComponentAdapter 接入；资源放入 assets（原生）或 web/public（Web），参见 [能力清单](capabilities.md)。

## macOS AppKit 应用

新建应用可以使用 `anseronui build macos` / `anseronui run macos`（对应 `npm run build:macos` / `npm run macos`），输出到 `.verification/macos/App.app`。当前构建支持 Apple Silicon、macOS 15+ 构建主机与完整 Xcode。`run macos --dry-run` 预览本机启动步骤；`--no-build` 校验已有产物和输入指纹。macOS 不接受设备/AVD 参数。

平台源码位于 `platforms/macos/App.swift`；旧工程升级时从新建应用补充该文件及 npm scripts。应用资源目录 `assets` 打包到 Resources/assets。插件需要 schema 2 的显式 macos 适配，缺失时提前报错。详细 API 和验证边界见 [macOS Renderer](../packages/render-macos/README.md)。

iOS 模拟器构建使用临时签名（`CODE_SIGN_IDENTITY=-`），以支持系统 Keychain，不要求开发团队或证书；真机构建仍输出未签名产物供 Xcode 配置。
