# 变更与验证

## 2026-11-10

- 完成持久化内核、增量节点与样式同步、测量失效、ABI 2 与生命周期接线。
- 修复 Wasm components 页面大量卸载时所有权登记失败，LayoutEngine 使用 Set；增加跨 runtime 批量释放探针。
- 已通过：typecheck:framework、typecheck:layout；test:framework 58 tests；test:build 7 tests。
- 已通过：300 组固定种子增量布局 vs git HEAD 修改前内核，包含文本测量、样式移除和结构移动。
- 已通过：test:layout:wasm，锁定上游/Node/native executable/native library/Wasm 差分与 engine 探针。
- 最终 Native/Wasm AOT 产物重建成功；test:core:native / test:core:wasm 各 5 个示例全部通过。
- 最终 native lifecycle 探针：4 条并发 owner threads，200 次持久化布局创建/释放/未完成测量关闭实例全部通过。
- git diff --check 通过；当前需求完成。
- 尚未执行 iOS/Android/macOS 真正 UI 宿主构建或设备测试；未做耗时性能基准。

## 2026-11-10 iOS 模拟器安装

- 用户要求安装试用。`npm run build:ios` 成功，最新 ABI 2 iOS Core 与业务包编译成功。
- 已安装并启动 `org.anseronui.demo`，设备 iPhone 17 Pro / iOS 26.4 / `53172492-D6E5-42C4-8530-1C5BE594193D`。
- 启动截图 `.verification/persistent-layout-ios.png` 显示 Counter 内容挤成竖排，布局存在可见异常；本轮保留现场供用户试用，尚未定位或修复。
- 构建日志 `.verification/persistent-layout-ios-build.log`。

## 2026-11-10 iOS 侧滑返回跟手修复

- 用户反馈最新版侧滑返回又不跟手。现存 iOS 容器代码在拖动 transform 存在时由 layoutSubviews 重写 frame，并在手势 ended 同步等待 Core BackPress 最多 750ms。
- 改用 bounds/center 同步尺寸，保留拖动 transform；收尾动画立即开始，异步确认 Core 拦截，等待动画与结果后 pop；被拦截平滑回退，取消不发 BackPress。
- 新增手势结束非阻塞与超时返回回归；现有 transform/尺寸回归、异步拦截回归，共 3 个 iOS 模拟器测试通过。
- 已重新安装并启动修复版到原 iPhone 17 Pro / iOS 26.4。
- 真实触摸 UI 测试 testEdgeSwipeBackCancelsAndRestoresRetainedPage 通过（短拖取消、replace、长拖返回、状态保留、根页面不返回）。
- Counter 字体挤成竖排仍存在，另需定位；本修复针对侧滑返回。
