# Changes

## 2026-11-10

- 实现基础四端及 iOS、Android 高级图标配置，接入构建、校验及 SDK 分发；新增完整文档和 README 入口。
- 新增 pngjs 7.0.0 并记录许可，懒加载避免解包 SDK create 被依赖预加载阻塞。
- 工具验证：29 项通过，含 iOS Any/Dark/Tinted actool 编译、Android aapt2 编译链接；最终回归同样通过。
- 包验证：npm pack、独立应用 create、SDK copy/fingerprint 通过；文档分发加入后最终回归同样通过。
- 手工独立验证：Android Gradle `processDebugResources` 通过，合并 Manifest 包含主图标及插件 CAMERA 权限；Composer 最小 Xcode 生成工程 BUILD SUCCEEDED，Info.plist 含图标声明且包内有 Assets.car；真实 Vite HTTP 子路径返回 200 PNG favicon；macOS ICNS 被 sips 识别为 1024 图标。
- 限制：未运行完整业务应用四端重编与设备桌面视觉检查；原生资源验证使用隔离宿主，聚焦本功能。
- 环境记录：Composer 导出需要 Apple 编译服务访问临时资源，受限环境失败，获工具访问后同一文件编译通过；Vite HTTP、Gradle、Xcode 验证亦使用了所需的本机工具权限。

- 最终结果：`ANSERONUI_TEST_NATIVE_ICONS=1 npm run test:tooling` 29/29 通过；`npm run test:package` 1/1 通过；`git diff --check` 无问题。

## 2026-11-10 — 默认图标与演示接入

- 用户要求给 App 配置图标，新建 App 也需默认图标。新增可复现的蓝色 A 矢量/PNG 图稿，生成器 `scripts/generate-default-icons.mjs`，源资源在根 `assets/icons/` 和模板 `assets/icons/`。
- 新建配置自动带 default、iOS light/dark/tinted、Android adaptive/monochrome/night；复制模板时按二进制保留 PNG。已有工程不自动覆盖图稿。
- 仓库根 app.icon 已配置；iOS/Android build 脚本接入同一套生成器；iOS/Android 接入 helper 增加可选工程路径与 target 参数。Web Vite 接 favicon；macOS 使用既有 ICNS 流程。生成目录 `.anseronui/` 已忽略。
- `npm run test:tooling` 27 通过、2 原生用例默认跳过；开启原生图标测试 11/11 通过。`npm run test:package` 1/1 通过，验证 npm 工程拥有默认资源和原始 PNG 字节。
- `npm run build:ios`、`npm run build:android` 成功；iOS CFBundleIcons 和 Android 合并 Manifest 主图标引用已确认，Android APK 已更新模拟器。
- Web Vite 实际构建生成 favicon；macOS ICNS 生成通过。iOS 桌面已实际看到蓝色 A 图标，截图 `.verification/default-icon-ios-home.png`。
- Android 视觉检查发现 night legacy PNG 会优先于无 night qualifier 的 adaptive XML；现同时生成 `mipmap-night-anydpi-v26/v33`，保持夜间自适应与单色图层，原生资源测试再次 11/11 通过，APK 重建成功。
- Android 修复后应用信息页已确认显示系统圆形遮罩；默认矢量标志缩至中心安全区以兼容圆形/其他遮罩，重新构建与原生资源测试 11/11 通过，更新 APK 已安装。

## 2026-11-10 — v0.0.7 发布前验证

- 根 package.json 与 package-lock.json 版本同步为 0.0.7。
- typecheck:framework、typecheck:layout 通过；框架 60/60、构建 7/7、工具链 27 通过（原生用例在专门任务执行）、原生图标 11/11、最终版本 npm 包 1/1 全部通过。
- test:layout:wasm 通过，覆盖上游/Node/native executable/native library/Wasm 差分；git diff --check 通过。
- 用户授权提交至 main 并推送 v0.0.7 标签，触发既有 Publish 工作流。
