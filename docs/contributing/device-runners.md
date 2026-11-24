# 设备测试 runner 接入

Android 与 HarmonyOS 设备任务使用 Apple Silicon Mac。测试入口与报告说明见[自动测试](testing.md)。两个任务可以使用两台 Mac；同一台 Mac 必须只启动一个 runner 进程，以免同时占用构建目录、HTTP fixture 端口或图形会话。

## 准备公共工具

1. 安装完整 Xcode。首次启动并接受许可。执行 `xcode-select -p`，确认路径指向 Xcode。
2. 安装 Node.js 24+、Python 3 和 Zig 0.15.2。HarmonyOS 还需要 Homebrew LLVM。
3. 在已登录的桌面用户下运行测试。启动设备模拟器。关闭主机自动睡眠。
4. 检查工具：

```sh
uname -m
node --version
python3 --version
zig version
xcrun clang --version
```

`uname -m` 必须输出 `arm64`。测试会安装编译器依赖，因此首次执行需要 npm/pnpm registry 网络访问。pnpm 已列为项目依赖，无需全局安装。

## Android

安装 JDK 17、Android Studio 和 SDK Command-line Tools。Android Studio 的 SDK Manager 中安装 Platform 35、Build Tools 35.0.0、NDK 27.2.12479018、Platform Tools 与 Emulator。默认 SDK 位置示例：

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_NDK_ROOT="$ANDROID_HOME/ndk/27.2.12479018"
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
java -version
sdkmanager 'platforms;android-35' 'build-tools;35.0.0' 'ndk;27.2.12479018' 'platform-tools' 'emulator' 'system-images;android-35;google_apis;arm64-v8a'
```

在 SDK Manager 接受所需许可。在 Device Manager 创建 API 35、`arm64-v8a` 模拟器并启动。也可以连接 API 26+ 的 arm64 设备并接受 USB 调试授权。检查目标：

```sh
adb devices
export ANDROID_SERIAL='替换为上一步的设备序列号'
adb -s "$ANDROID_SERIAL" shell getprop ro.product.cpu.abilist
adb -s "$ANDROID_SERIAL" shell getprop sys.boot_completed
```

ABI 必须包含 `arm64-v8a`；启动状态应为 `1`。测试不支持 x86 模拟器。测试脚本会设置和移除端口 5174 的 `adb reverse`。

## HarmonyOS

1. 安装 DevEco Studio 与 HarmonyOS 6.0.1（API 21）SDK。
2. 用 DevEco Device Manager 创建并启动 API 21 的 arm64 模拟器。
3. 安装 Homebrew LLVM，确认 `/opt/homebrew/opt/llvm/bin/clang` 可用。
4. 检查 SDK 与目标。默认安装位置示例：

```sh
export DEVECO_STUDIO_HOME='/Applications/DevEco-Studio.app/Contents'
export DEVECO_SDK_HOME="$DEVECO_STUDIO_HOME/sdk"
export HARMONY_NATIVE_SDK="$DEVECO_SDK_HOME/default/openharmony/native"
export HARMONY_LLVM_CLANG='/opt/homebrew/opt/llvm/bin/clang'
export HARMONY_HDC="$DEVECO_SDK_HOME/default/openharmony/toolchains/hdc"
"$HARMONY_LLVM_CLANG" --version
"$HARMONY_HDC" list targets
export HARMONY_DEVICE='替换为上一步的目标 ID'
"$HARMONY_HDC" -t "$HARMONY_DEVICE" shell param get const.ohos.apiversion
```

API 必须为 `21`。默认模拟器使用 SDK 的调试签名。真实设备需要匹配应用标识与设备的签名、描述文件和系统授权，按 [HarmonyOS 构建说明](../platforms/harmonyos.md) 配置。不要将真实设备签名材料提交到仓库。

HarmonyOS 构建使用 DevEco 自带 Java。若与 Android 共用一台主机，确认 runner 的 `JAVA_HOME` 不会为 DevEco 选中不兼容版本。

## 注册与启动 runner

1. 打开仓库 Settings → Actions → Runners → New self-hosted runner，选择 macOS / ARM64。
2. 在源码 checkout 以外的目录执行 GitHub 页面给出的下载、解压与 `config.sh` 命令。页面生成的注册 token 仅用于注册，不写入仓库。
3. 注册时添加所需标签：`anseronui-android` 或 `anseronui-harmony`。共用一台主机时，给同一个 runner 添加两个标签。保留默认的 `self-hosted`、`macOS`、`ARM64` 标签。
4. 在启动 runner 的终端中设置上述平台环境变量。运行 `./run.sh`。保持终端与桌面登录会话开启，确认页面显示 **Idle**。

需要后台常驻时，使用 runner 自带的 `svc.sh` 为当前登录用户安装服务。安装前在同一终端执行 `./env.sh`，保存 PATH。平台变量写入 runner 目录的 `.env`，使用真实绝对路径，不写 `$HOME` 等 shell 表达式。修改 `.env` 后重启服务。模拟器仍需已启动，图形会话仍需保持登录。

两个平台共用一个 runner 进程时，GitHub 会依次派发两个任务。若同一主机启动多个 runner 进程，平台各自的 concurrency group 无法避免跨平台资源争用。

## 验证并启用

在 runner 用户的仓库 checkout 中执行：

```sh
npm ci --ignore-scripts
npm run test:ci -- android
```

HarmonyOS runner 改为执行 `npm run test:ci -- harmony`。先确认 suite 成功，再在仓库 Settings → Secrets and variables → Actions → Variables 中添加：

| 变量 | 值 | 启用条件 |
| --- | --- | --- |
| `ANSERONUI_ANDROID_CI` | `true` | Android runner 在线且本地 suite 通过 |
| `ANSERONUI_HARMONY_CI` | `true` | HarmonyOS runner 在线且本地 suite 通过 |

在 Actions → Tests → Run workflow 手动运行一次。检查两个设备 job、上传的 artifacts 与 `Full test gate`。随后每次 push 自动执行同一工作流。将 `Full test gate` 加入分支保护的 required checks。

变量未启用时，设备 job 跳过，push 的 gate 失败并说明设备覆盖不完整。变量启用但 runner 离线时，GitHub 会等待匹配 runner；将其恢复在线或关闭对应变量。关闭变量不会把全端测试算作通过。

## 排查接入失败

| 现象 | 检查 |
| --- | --- |
| job 一直 queued | runner 在线状态、五个标签、仓库/runner group 的访问权限 |
| JDK 错误 | runner 进程内的 `JAVA_HOME` 与 `java -version`；Android 必须可找到 JDK 17 |
| 找不到设备 | `ANDROID_SERIAL` / `HARMONY_DEVICE`、USB 授权、模拟器是否启动 |
| 找不到工具 | runner 保存的 PATH 与 `.env`；修改后重启 runner |
| 端口 5174 被占用 | 结束上一轮测试或其他 fixture 服务，再执行套件 |
| Harmony 报告 blocked | 查看 acceptance 报告中的系统授权/配额项，处理后重跑；blocked 不能作为通过 |
| 媒体一直 waiting | 检查设备媒体解码、首帧与渲染日志；不得跳过首帧断言 |
