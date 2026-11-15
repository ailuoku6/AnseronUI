# 文件记录

本次新增 `internal/design/harmonyos-native-support.md`，在 `docs/README.md` 增加入口，在 `internal/design/macos-harmony-support.md` 增加后续设计指引，创建本 memo。

2026-11-14 验证追加：`scripts/verify-harmony-build.mjs` 为实验 archive 编译入口，`scripts/verify-harmony-runtime.mjs` 为一键构建/设备验证入口；`internal/experiments/harmony-runtime/` 保存 TS/C 探针和本机 oracle 记录器；`internal/toolchain/harmony-api21.patch` 保存 SDK Clang 15 适配；`internal/verification/harmony-api21-report.md` 保存结论。生成结果位于 `.verification/harmony-api21/`，不属于发布包。

重要未改入口：protocol/src/index.ts、core/native/transport.c 与 split_bridge.c；scripts/build-core.mjs、native-plugins.mjs、standalone-app.mjs、anseronui.mjs、sdk-files.mjs、pack-sdk.mjs；scriptc target/driver/runtime 与 vendor 清单。路径详见正文审计表。

工作区已有大量未提交变更，尤其 docs/README、protocol、路由/列表/性能内容，不属于本轮，不回滚。

2026-11-14 Harmony 实施补充：`packages/render-harmony/src/main/ets/HarmonyServices.ets` 封装 Asset、picker、share、location、vibrator、HTTP stream 和缓存文件；`HarmonyHost.ets` 将服务接到 protocol event/cancellation，`HarmonyEvents.ets` 管订阅并启停定位；`packages/render-harmony/src/main/cpp/bridge.cpp` 接 ArkUI 长按；`scripts/harmony-app.mjs` 负责 API 21 HAP、JSON5、权限资源和设备安装；`scripts/standalone-app.mjs` 暴露独立应用入口；`scripts/test-harmony.mjs`、`examples/harmony-smoke/page.tsx` 验收普通及安全存储。

七页测试 app 对齐：`packages/render-harmony/src/main/ets/AnseronView.ets` 增加顶层页签/页面替换，`scripts/harmony-app.mjs` 将 components media assets 纳入 rawfile，Native Image 与 `HarmonyMedia` 处理 asset URI，`anseronui.config.json` 只为 Harmony 指定 components 初始页。

## 2026-11-14 能力对齐文件

- packages/render-harmony/src/main/ets：新增/完善 Ability、Events、Linking、PageStack、ApplicationServices、RadioServices、Media/VideoSurface、Host、Animation、Services、AnseronView。
- packages/render-harmony/src/main/cpp/bridge.cpp / touch_policy.h / extensions.h：输入/滚动/焦点、prop重置、虚拟列表补偿、插件事件安全和原生计时。
- packages/render-harmony/test：直接执行真实ArkTS逻辑，模拟系统适配器；40项生命周期/服务/媒体/取消回归。
- examples/harmony-smoke：4页设备验收；scripts/test-harmony.mjs 保存14组实测和系统阻塞。
- examples/native/harmony/DemoExtensions.cpp：仓库专用DemoSwitch/device.info；Stage Entry/WorkAbility/ServiceSetup 与模板同步。
- scripts/harmony-app.mjs / harmony-app.test.mjs：生成配置、API21构建/运行、插件与权限；TypeScript JSON5解析按需加载。
- scripts/npm-package.test.mjs：新增Harmony产物/模板/独立创建验证；SDK包含Index.d.ts（注意大小写）。
- docs/harmonyos/native-services/native-extensions/capabilities/page-lifecycle/performance.md、render-harmony/README：更新状态与边界。
- packages/core/test/virtual-list.test.tsx：慢滚动回归使用确定性16ms时钟，消除机器速度导致的速度估计抖动。
- anseronui.config.json：Harmony主示例初始components及功能演示权限声明。

追加 scripts/test-harmony-demo.mjs / test:harmony:demo：主示例的原生扩展与虚拟列表设备回归。

README.md / package.json 平台说明新增 HarmonyOS；主示例可复跑回归通过3项，报告时间2026-11-14T07:18:49Z，挂载7行。

默认样式对齐追加：`packages/render-harmony/src/main/cpp/bridge.cpp` 统一 Native Node 外观基线；`packages/render-harmony/src/main/ets/HarmonyHost.ets` 统一默认字号和控件测量；`packages/render-harmony/test/host.test.mjs` 锁定 16vp/控件测量契约；`docs/harmonyos.md` 记录跨端默认样式边界。
