# HarmonyOS 虚拟列表反向滚动

验证环境：DevEco API 21、arm64 鸿蒙模拟器 `127.0.0.1:5555`、主示例的真实 AOT Core 和 ArkUI C renderer。

## 根因

`bridge.cpp` 在行高变化后使用 `NODE_SCROLL_OFFSET` 设置 `y + delta`。该路径会停止原生惯性。只传 x/y 的补偿还会执行带动画的滚动；复现中一次 426 vp 补偿产生了后续逐帧位移。回滚时测量新出现的前方行，一次补偿达到 309 vp。

Core 的滚动事件异步到达。提交时原生可见行与 Core 记录的首行可以不同，直接使用 Core 的累计差值不能保证保留当前屏幕中的行。

## 实现

- 提交前记录原生视口中的可见行。提交后以仍保留的首个可见行为锚点。
- 拖动和惯性期间，在内容容器上暂存补偿平移，通过 `onWillScroll` 把补偿合入下一帧原生滚动量。该路径不调用滚动控制器。
- 停止滚动后的残余补偿显式设置 `duration=0`。
- 上报逻辑偏移及累计实际补偿，Core 速度计算剔除行高变化。触摸坐标和 ref 测量包含暂存补偿。
- 静止时的零补偿保留 Core 的显式定位目标，避免干扰 `scrollToIndex`。

## 验证结果

最终设备专项：600 个绘制帧，599 个保留行样本；最大额外锚点位移 0.125 vp，最大视口空白 0 vp。向前 2 次、向后 6 次滑动；4 次滚动中行高补偿均在原生帧消费，惯性继续。第 4000 项定位、节点数量有界、头插、展开和收起均通过。

另一次完整设备专项：611 帧，最大额外锚点位移 0.281 vp，视口空白 0 vp，3 次补偿后惯性继续。

关闭 `ANSERONUI_SCROLL_TRACE` 后重新构建并安装普通 Debug 版本。第 4000 项定位、连续 8 次回滚、可见行及节点数量检查通过。最终截图：`.verification/harmony/acceptance/list-normal-final.jpeg`。模拟器保留此普通版本的列表界面。

- `npm run test:harmony`：58 项通过，含编译执行生产 `scroll_anchor.h` 的 C++ 回归。
- Core `virtual-list.test.tsx`：11 项通过。
- `npm run test:build`：20 项通过，含滚动报告分析器的正常与失败样本。
- `git diff --check`：通过。

逐帧测量使用同一绘制帧的原生内容/行位置。直接在布局回调中混用控制器偏移与已布局坐标，会把下一帧状态误算为成对跳动。

报告：`.verification/harmony/virtual-list/results.json`；原生日志：同目录 `native-scroll.log`；布局快照：同目录 JSON。测试入口为 `scripts/test-harmony-virtual-list.mjs`，鸿蒙 CI 自动开启 Debug 诊断、运行专项并上传报告。常规和 Release 构建不启用此诊断。

范围：本报告验证鸿蒙模拟器上的可变高度列表回归。未运行其他平台的全量设备套件；未推送或运行远端 Actions。鸿蒙自托管 runner 仍需按 `docs/contributing/device-runners.md` 配置。
