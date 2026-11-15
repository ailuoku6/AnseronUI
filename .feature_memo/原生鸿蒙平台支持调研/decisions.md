# 决策

## 2026-11-14 — AOT + Native Node

保持业务/布局/协议，使用官方挂载路径；局部 ArkTS 适配为备选。全量转换、自绘/WebView 不作为首选。先 P0 验证 runtime。

## 2026-11-14 — 固定 worker 与主线程 UI

首期不依赖 API 22 多线程节点。返回键异步单事务，避免等待环。

## 2026-11-14 — 分开事实和承诺

更新旧鸿蒙设计，保留 macOS 历史。最低兼容基线改为 API 21；schema 3、harmony CLI 仍是后续建议，平台产品集成状态仍为未实现。

## 2026-11-14：API 21 实验验证

用户要求最低 HarmonyOS 6.0.1/API 21，已使用现有 SDK 和模拟器实际验证。先独立构建 OHOS ELF 证明 runtime/Core，不在本轮把实验流程登记为正式平台支持。保留 SDK Clang 15 SHA-512 标量补丁；本机 LLVM23 编译发射器输出，避免冒用 Android/Linux target。正式工具链需补充 OHOS helper/driver 和可分发 runtime。

## 2026-11-14 — 主要能力对齐与真实验证

- 已进入正式平台实现，早期“只做调研/探针”的阶段决策不再代表当前状态。
- 继续使用系统原生服务；通知无资格时保留失败，不用前台timer冒充后台调度；不制造推送token。
- AVPlayer替代高层Video，以获得真实首帧和ms进度，控制按钮/进度条由局部ArkUI提供。
- 保活/回收与其他宿主共用语义，默认Infinity；回收只保留路由参数，不尝试序列化Hook闭包。
- 设备报告把blocked独立于passed；40项OS mock单元通过不等于BLE/NFC等真机通过。
- 保留其他平台和共享协议的已有工作区改动，未做Git提交。
