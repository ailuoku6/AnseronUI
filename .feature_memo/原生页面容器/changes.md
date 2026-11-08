# 变更

## 2026-11-07

- 新增两端 AnseronUIRenderView，组合原有 Host / Renderer；支持布局前 load、自动 resize、替换、回调隔离和幂等终止。
- 迁移原生 Demo；补充两端集成文档。
- 添加测试：延迟启动/resize/reparent/destroy、启动前销毁、替换和旧回调屏蔽、失败后布局及重新加载。
- 验证发现 Android 失败后 resize 会抛错，已加入容器失败状态和 Host 关闭保护。
- 工作期间 Renderer / Host / 编译器有并行外部修改；保留已有媒体实现，补齐少量 iOS 编译项。Android 新增媒体必选握手与既有 Core 不兼容，改为仅要求基础节点，允许可选扩展。

## 验证

- iOS 原生构建成功；`.verification/container-ios-final.log`：2 项 UI + 3 项容器测试通过。
- iOS 最终失败恢复版本：`.verification/container-ios-recovery-v3.log`：4 项容器测试全部通过。
- Android 最终构建：`.verification/container-android-compatible-build.log`：BUILD SUCCESSFUL。
- Android 最终运行：`.verification/container-android-compatible-tests.log`：OK (5 tests)，包含 4 项容器测试 + 1 项真实计数器/表单/异步/HTTP/切换测试。
- Gradle connected 测试缺少离线 UTP 缓存，使用构建好的测试 APK 通过 adb instrumentation 完成。
- 尝试重新编译 Android Core 因现有 compiler 对 TypeScript 7 的依赖与 node_modules 的 TypeScript 5 不符而失败（getExePath.js 缺失）；没有改动编译器或替换既有二进制。容器使用既有编译产物的真实页面流程已通过。
- 无容器需求的已知阻塞。未验证本次无关的媒体播放功能与 iOS 真机签名。
