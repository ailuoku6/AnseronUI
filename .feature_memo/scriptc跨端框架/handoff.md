# 交接（2026-11-08）

项目已正式命名为 **AnseronUI**：私有包使用 `@anseronui/*`，配置为 `anseronui.config.json`，原生容器为 `AnseronUIRenderView`，Demo 标识为 `org.anseronui.demo`，iOS 工程为 `AnseronUIDemo.xcodeproj`。改名后 Web、iOS Simulator、Android APK 构建及框架、布局、Native/Wasm Core 验证通过。Android 构建验证使用 `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`（JDK 21）；本机默认 JDK 25 与当前 Gradle 不兼容。

工作区 `/Users/ailuoku6/web_project/TSNative` 根目录没有 Git 仓库。`packages/flexily/` 是独立的 dirty clone，保留用户已有适配修改。

用户要求参照 Kuikly 完成跨端框架。现在同一 TSX 页面/Core 经 `internal/toolchain/scriptc` v0.4.8 async-embedding patch AOT 编译到 iOS、Android、Web Wasm，并由 UIKit、Android Views、DOM 渲染。`anseronui.config.json` 配置 buildId 和 page source/export。构建命令见根 `README.md` 和 `package.json` 的 `prepare:compiler`、`build:*`、`test:core:*` scripts。

验证：框架 typecheck/tests 13 项通过；布局差分通过；native/Wasm counter、异步表单、timer、HTTP、dispose probe 通过；native transport 4 线程、200 次生命周期通过；iOS Simulator XCTest 通过；Android instrumentation runner 通过；iOS Simulator/device archive、Android APK、Web Wasm production 均成功生成。Wasm 浏览器通过页面切换、输入/列表、timer、HTTP 全流程。sandbox 凭据不可用；Android Gradle 连接测试平台的 TLS 资源下载失败，构建好 APK 后用 adb 直跑 InstrumentationRunner 成功。

生产门槛仍有：async-embedding patch 紧绑定 scriptc v0.4.8；任意悬挂 async frame 无法强制取消，Core close 会拒绝并报告；真机签名与分发、更多 OS/设备、IME/accessibility、资源和内存上限未全面验收。热更新不属于范围。
