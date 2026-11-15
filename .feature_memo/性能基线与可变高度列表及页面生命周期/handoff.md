# Handoff

状态：用户要求进一步优化Android猛烈快滑空白与回滑跳动，已完成本轮实现、测试和安装，未提交。原范围整条渲染性能、可变高度列表、保活生命周期也已实现。

入口：docs/virtual-list.md、docs/performance-baseline.md。当前VirtualList双向预热约两屏、速度预测（扣除累计布局补偿）、32行窗口目标、guard内跨父更新保持稳定；四端scrollAnchorOffset同批补偿。Android用提交时真实可见行校正锚点、保持惯性坐标，编码前合并scroll并保留离散屏障、批量测量、128KiB测量LRU、直接提交已解析JSON、不变节点不paint、Text/Button离屏池64/32。惯性余量不足两屏平滑缩减位移，未消耗距离不积累后跳；负载大时甩动距离变短，这是明确取舍。

最终共享80项、Android RenderViewTest16项、TS类型通过；WebKit Reference列表通过（后台绘制等待超时22次，不能当计算耗时）。Swift双端源码typecheck此前通过，iOS/macOS/Wasm应用产物未重编、未验证其真实猛烈甩动。Android最终连续六次±20000px/s、895帧无空白或首行反向跳动，每次36–42行；前轮889帧也为0。报告 .verification/performance/android-fling.json、fling-reference.json。Reference峰值168节点、582缓存、291463字节，资源预算通过；扩大预热增加CPU耗时，未宣称通过旧版相对时延门槛。

APK已重新安装emulator-5554并打开virtual-list，实际三轮快速往返后截图 /tmp/anseron-fling-final.png 正常。日志 /tmp/anseron-fling-final-android7.log、shared-final.log、types-final.log、final-web2.log（均带anseron-fling前缀）。无待实现项；等用户体验，远端CI未跑。

约束：Core测量缓存在ACK后淘汰；onLayout由Core统一回传；VirtualList默认height:0；隐藏事务正常排空；回收保留路由参数但重建Hook/输入/滚动。勿把仅节点存在或停止滚动当无空白证明。

2026-11-14：按用户要求重新构建最新 iOS Simulator Core 和 Debug 应用（npm run build:ios 成功），安装到已启动的 iPhone 17 Pro / iOS 26.4（53172492-D6E5-42C4-8530-1C5BE594193D）。simctl launch org.anseronui.demo --page virtual-list 成功，截图 /tmp/anseron-ios-installed.png 确认可变高度列表已显示，供用户体验。本轮仅构建/安装与启动确认，未新增 iOS 猛烈甩动性能结论；Android 专属惯性保护/复用池不属于 iOS 实现。

2026-11-14：按用户要求 npm run build:macos 成功，最新 framework/business AOT 与AppKit宿主已重建；安装到 /Users/ailuoku6/Applications/AnseronUI.app，codesign --verify --deep --strict通过。已启动应用，通过Navigate菜单打开virtual-list，实际向下滚动3屏，AX与截图确认列表内容正常，窗口保留供用户体验。本次为安装和基本交互检查，不新增macOS猛烈甩动性能承诺。
