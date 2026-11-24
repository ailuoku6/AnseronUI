# 构建与运行

命令在 `anseronui create` 生成的应用目录中执行。创建应用见[快速开始](../getting-started/quick-start.md)。

## 运行

```sh
npm run ios
npm run android
npm run macos
npm run harmony
```

等价命令：

```sh
npx --no-install anseronui run ios
npx --no-install anseronui run android
```

`run` 依次选择或启动设备、构建、安装、启动。构建或安装失败后停止。

```sh
npm run ios -- --device <模拟器UUID或名称>
npm run android -- --device <adb序列号>
npm run android -- --avd <AVD名称>
npm run ios -- --no-build
npm run android -- --dry-run
```

- iOS：默认使用唯一已启动的模拟器。没有已启动设备时，选择第一个可用 iPhone 并启动。多个已启动模拟器或名称重复时，用 UUID 指定。可用 `xcrun simctl list devices available` 查询。
- Android：默认使用唯一在线设备。没有连接设备且只有一个 AVD 时自动启动。多个 AVD 用 `--avd`，多个连接设备用 `--device`。`adb devices` 查看序列号，`emulator -list-avds` 查看 AVD。离线或未授权设备需要先处理，命令不会绕过授权。
- macOS：构建 Apple Silicon arm64 `.app` 并在当前 Mac 启动。`npm run macos -- --no-build` 会校验已有产物和输入；输入变了就要重新构建。macOS 不接受 `--device` 或 `--avd`。
- HarmonyOS：`npm run harmony`。SDK 和验证范围见[HarmonyOS](../platforms/harmonyos.md)。
- Android 支持 `arm64-v8a` 和 `x86_64`。运行命令按设备 ABI 选择构建目标；`--no-build` 会检查已有 Core 的 ABI 与设备兼容。只构建时默认 ARM64，设置 `ANSERONUI_ANDROID_ABI=x86_64` 可构建模拟器 APK。x86_64 还需要 LLVM 22+，Linux 默认使用 `clang-22`，macOS 默认使用 `/opt/homebrew/opt/llvm/bin/clang`；可通过 `ANSERONUI_ANDROID_LLVM_CLANG` 指定路径。启动 AVD 最多等待 180 秒，日志在 `.verification/emulator.log`。
- `--device` 和 `--avd` 互斥。`--avd` 只用于 Android。
- iOS 和 Android 的 `--no-build` 安装并启动已有产物，不检查业务源码是否变化。
- `--dry-run` 只打印平台、应用标识和步骤，不访问设备，也不构建。

`run ios` 只面向模拟器。iOS 真机使用下面的 `build:ios-device`，再在 Xcode 里配置签名。Android 可以选择模拟器或已授权的 ARM64 真机。

## Web

```sh
npm run build:web
npm run dev:web
```

默认地址是 `http://localhost:5175`。修改 TSX 后重新 `build:web`，再刷新浏览器。Vite 刷新不会重新编译 Core。

## 只构建

```sh
npm run build:ios
npm run build:ios-device
npm run build:android
npm run build:macos
npm run build:web
npm run build:harmony
```

正式构建：

```sh
npm run build:web:release
npm run build:ios:release
npm run build:android:release
npm run build:macos:release
npm run build:harmony:release
```

签名分发：

```sh
npm run build:ios:signed
npm run build:android:signed
npm run build:macos:signed
npm run build:harmony:signed
```

iOS 默认按 App Store Connect 导出，可用 `ANSERONUI_IOS_EXPORT_METHOD` 改成 `ad-hoc`、`development` 或 `enterprise`。`:signed` 还要设置 `ANSERONUI_IOS_TEAM_ID`。未签名的 `:release` 只生成 `App.xcarchive`。

Android `:signed` 需要 `ANSERONUI_ANDROID_KEYSTORE`、`ANSERONUI_ANDROID_STORE_PASSWORD`、`ANSERONUI_ANDROID_KEY_ALIAS`、`ANSERONUI_ANDROID_KEY_PASSWORD`。缺少值或找不到 keystore 时，命令直接失败。

macOS `:signed` 需要 `ANSERONUI_MACOS_SIGN_IDENTITY`，值为 Developer ID Application 证书名称。配置 `ANSERONUI_NOTARY_PROFILE` 后，构建会公证并 staple，再生成 ZIP。

HarmonyOS 签名要求见[HarmonyOS](../platforms/harmonyos.md)。

产物路径：

| 目标 | 应用内路径 |
| --- | --- |
| iOS 模拟器 | `.verification/ios/Build/Products/Debug-iphonesimulator/App.app` |
| iOS 未签名真机 | `.verification/ios-device/Build/Products/Debug-iphoneos/App.app` |
| Android Debug | `platforms/android/app/build/outputs/apk/debug/app-debug.apk` |
| macOS | `.verification/macos/App.app` |
| Web | `dist/web` |

iOS 模拟器构建使用临时签名（`CODE_SIGN_IDENTITY=-`），不要求开发团队。真机构建输出未签名产物，供 Xcode 配置。

Android SDK 用 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT`，NDK 用 `ANDROID_NDK_ROOT`。构建脚本在兼容的 `JAVA_HOME`、macOS 上的 JDK 17 和 Android Studio JBR 中选择 Java，不修改系统 Java。

## 配置

```json
{
  "schemaVersion": 2,
  "buildId": "hello-app",
  "app": {
    "name": "hello-app",
    "applicationId": "com.example.hello",
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

`schemaVersion: 2` 的 `sourceDirs`、`page.source` 和 `web` 路径都相对于应用目录。`app.framework` 固定为 `.anseronui/sdk`。CLI 会生成 `.anseronui/build.config.json`，不要手改这个中间文件。移动整个工程后，重新运行 `setup` 和构建，刷新工具链接。

`npm run check` 检查 buildId、页面数组、重复 export 和源码是否存在。它不能代替 `typecheck`、AOT 构建和设备运行。

新增页面要导出 `definePage`，并写入 `pages`。应用标识已经写入宿主、Info.plist 和 Gradle。改 `name`、`applicationId` 或 `buildId` 时，要同步这些文件。

编译缓存位于 `.anseronui/sdk/.verification`。同一应用同时构建时，`app-build.lock` 会挡住第二次构建。进程被杀掉后如果锁还在，先确认锁里的 PID 已停止，再删除锁。

创建时可以追加参数：

- `--name` 保留显示名称的大小写。npm 包名和 buildId 使用小写。名称以英文字母开头，只含字母、数字、下划线和连字符。
- `--application-id` 同时作为 iOS Bundle ID 和 Android applicationId。未指定时默认为 `com.<去掉连字符和下划线的名称>.app`。
- 目标目录非空时，创建会拒绝执行。`--force` 覆盖模板管理的同名文件。先保存自己的改动。
- `--package <版本或tarball>` 指定 `anseronui` 依赖。省略时使用当前 CLI 的版本。

图标配置见[应用图标](../guides/project/app-icons.md)。把页面嵌进已有工程见[接入已有工程](../guides/project/existing-app.md)。
