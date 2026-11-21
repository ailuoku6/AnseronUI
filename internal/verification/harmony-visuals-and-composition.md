# 鸿蒙视频圆角、阴影与组件组合验证

日期：2026-11-14。设备：Mate70Pro aarch64 模拟器，HarmonyOS 6.0.1 / API 21，`127.0.0.1:5557`。

## 结论与修复

### 页面主题变化

页面可以通过 `useServices().appearance.subscribe(listener)` 感知 light/dark 切换，在回调中更新 state。已有外观示例同时读取初始值、订阅后续变化，在卸载时取消订阅。此次在新构建上通过系统控制中心完成 light→dark→light，确认页面标签、Image 实际加载源均更新，布局仍为 90×45。没有通过页面内部变量模拟主题。

### Video 圆角

问题是独立 XComponent SURFACE 平面不能正确参与父节点的圆角裁切。仅对外层设置 borderRadius，会出现背景已圆角、真实视频仍是方形的情况。

改用 `XComponentType.TEXTURE`，保留 AVPlayer 和 surface 回调，外层 Video 节点启用 clip，采用已有 borderRadius。播放、控制按钮和既有媒体事件保持工作。设备验收先真实点击播放，等待 playing 和首帧事件，再在截图中检查四角露出白色卡片、上边中点仍显示视频内容；避免只检查背景或属性声明。

### 阴影大小和偏移

鸿蒙 ArkUI 原生阴影路径将半径与偏移数值直接传入 Rosen 的物理像素空间。旧适配器把逻辑布局值直接传入，高密度屏上阴影半径和偏移明显过小。宿主现在向 renderer 传入 UIContext 的显示密度，阴影半径和 x/y 偏移统一转换到 px，零透明度重置原生阴影，并显式采用颜色外阴影。

本次模拟器密度为 3.5，`shadowRadius: 8` 应对应 28px，`shadowOffsetY: 5` 应对应 17.5px；旧实现分别只传 8 和 5。修复后蓝色/紫色卡片的阴影不再缩成细边。设备回归检查卡片下方 4vp 与 14vp 的像素差，能够检测缺失密度转换导致的阴影过窄；同时继续检查标签水平居中。

iOS CALayer、Android Skia 与 Harmony Rosen 的模糊核和栅格化不同，修正逻辑尺寸不代表边缘逐像素相同。跨端 API 保证颜色、透明度、半径、偏移的统一语义；没有声称实现统一软件栅格器。

### 自定义 Hook 与组件组合

新增组件实验室 `07 · Hooks / HOC / Slots`，同一份 TSX 覆盖：

- 自定义 useCounter 组合 useState、useCallback 和 useMemo。
- withCard 接收组件函数并返回具名 Card；返回的组件有自己的 useState。
- 通过 Content 属性传递组件，使用 `<props.Content />` 渲染。
- header 传 JSX 元素，renderFooter 传渲染函数，children 传子元素。
- 先更新内部 Hook 和 HOC 状态，再更新父组件，确认子状态及组件节点身份保留。

检查中发现 UI compiler 将 HOC 返回的具名组件误判为普通嵌套回调，导致合法的 Hook 被拒绝。现让具名组件和自定义 Hook 拥有独立检查作用域，普通事件/effect 回调与条件中的 Hook 仍会拒绝。补充了正反向 lowering 测试和共享运行时状态回归。

支持范围是本框架的函数组件模型，不等于 React 全部生态兼容。JSX props spread 仍不支持；HOC 应显式转发属性，并在模块顶层创建以保持函数身份。任意复杂泛型 HOC 仍需实际 AOT 验证。完整例子与限制见 `docs/guides/ui/component-composition.md`。

## 验证

| 检查 | 结果 |
| --- | --- |
| 共享框架 | 16 个文件、86 项测试通过，包含 HOC Hook 作用域、非法 Hook 拒绝及组合状态保留。 |
| TypeScript | `npm run typecheck:framework` 通过。 |
| 构建与工具脚本 | 构建 7 项通过；工具脚本 30 项通过、2 项按原有条件跳过，无失败。 |
| Harmony 单元测试 | 46 项通过，覆盖媒体生命周期、暂停/恢复/重置、首帧、异步换源与宿主能力。 |
| 原生 AOT | native Core 构建通过；components 协议探针通过，实际执行自定义 Hook、HOC、各种属性组合和父组件重渲染。 |
| Harmony AOT/HAP | API 21 目标构建、安装、启动通过；TEXTURE 和新阴影参数在实际宿主运行。 |
| Harmony 设备 | 8 组验收通过，包含播放首帧及四角像素、组件组合、阴影外沿像素/居中、主题图片/行高/onLayout、原生扩展、5000 行虚拟列表及深层 prepend（仅挂载 7 行）。 |
| 系统主题 | 新构建 light→dark→light 通过，页面订阅与图片源同步变化，最后恢复浅色。 |

native 和 Harmony 两个 Core 构建的源码指纹相同：

```text
970b0f50746f3bc29fcb3d125a97156c58d69095f12edc82b51f74a21218a240
```

此次针对鸿蒙 renderer 的修复运行了 Harmony 模拟器；没有重新运行 Android/iOS 的整套设备测试。测试不覆盖真机、HDR/DRM 视频或所有 GPU/字体缩放配置。

## 复现与证据

```sh
npm run test:framework
npm run typecheck:framework
npm run test:harmony
npm run test:build
npm run test:tooling
node scripts/build-core.mjs native
node scripts/test-native-core.mjs .verification/core-native/probe components
node scripts/anseronui.mjs build harmony
node scripts/anseronui.mjs run harmony --no-build --device 127.0.0.1:5557
node scripts/test-harmony-demo.mjs 127.0.0.1:5557
```

本地 `.verification/harmony/visual-alignment/` 保存机器结果、阴影前后对比、Video 真实播放截图及组件组合截图。`device-results.json` 为本次设备断言结果，`results.json` 汇总其余检查。最新设备验收也写入 `.verification/harmony/acceptance/main-results.json`。构建目录被 git 忽略，后续运行可能覆盖；日志为 `/private/tmp/composition-*.log` 和 `/private/tmp/harmony-visual-*.log`。
