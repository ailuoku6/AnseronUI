import AppKit
import AVKit

@main @MainActor struct Integration {
    static func check(_ value: @autoclosure () -> Bool, _ message:String) {
        if !value() { fputs("FAIL: \(message)\n",stderr); exit(1) }
    }
    static func wait(_ message:String, timeout:Double = 10, _ condition: () -> Bool) {
        let end = Date(timeIntervalSinceNow:timeout)
        while !condition() && Date() < end { RunLoop.main.run(until:Date(timeIntervalSinceNow:0.01)) }
        check(condition(),message)
    }
    static func descendants(_ view:NSView) -> [NSView] { view.subviews.flatMap { [$0] + descendants($0) } }
    static func main() throws {
        _ = NSApplication.shared
        if CommandLine.arguments.contains("--drag-regression") {
            try RendererRegression.dragWorker()
            try RendererRegression.dragAOT()
            return
        }
        if CommandLine.arguments.contains("--liquid-glass-regression") {
            try RendererRegression.liquidGlass()
            return
        }
        if CommandLine.arguments.contains("--renderer-regressions") {
            try RendererRegression.run()
            return
        }
        #if DEBUG
        if CommandLine.arguments.contains("--devtools-regression") { try RendererRegression.devtoolsCapture(); return }
        #endif
        let window = NSWindow(contentRect:NSRect(x:0,y:0,width:640,height:600),styleMask:[.titled,.resizable],backing:.buffered,defer:false)
        let view = AnseronUIRenderView(frame:window.contentView!.bounds,baseURL:URL(string:"http://127.0.0.1:5174"),extensions:demoExtensions())
        view.autoresizingMask = [.width,.height]; window.contentView!.addSubview(view)
        var errors:[String] = []
        view.onFailure = { errors.append(String(describing:$0)) }
        view.onDiagnostic = { errors.append("\($0): \($1)") }
        func label(_ text:String) -> Bool { descendants(view).contains { ($0 as? NSTextField)?.stringValue == text } }
        func button(_ title:String) -> NSView { descendants(view).first { $0.accessibilityRole() == .button && $0.accessibilityLabel() == title }! }
        view.load(page:"counter", params:["origin":"root"])
        wait("counter first frame") { label("Count: 0") || !errors.isEmpty }
        wait("root route parameters") { label("路由参数: {\"origin\":\"root\"}") }
        check(errors.isEmpty,"counter: \(errors)")
        button("+1").accessibilityPerformPress()
        wait("button enters AOT Core") { label("Count: 1") }
        button("打开 Async Form").accessibilityPerformPress()
        wait("router push") { label("Async form") }
        check(view.routeStack == ["counter","async-form"],"route stack")
        wait("pushed parameters enter AOT page") { descendants(view).compactMap { $0 as? NSTextField }.contains { $0.stringValue.contains("来自 Counter 的参数") && $0.stringValue.contains("\"count\":1") } }
        let input = descendants(view).compactMap { $0 as? NSTextField }.first { $0.isEditable }!
        input.stringValue = "原生 macOS"
        NotificationCenter.default.post(name:NSControl.textDidChangeNotification,object:input)
        button("Add task").accessibilityPerformPress()
        wait("controlled input creates item") { label("原生 macOS") && input.stringValue.isEmpty }
        button("Wait").accessibilityPerformPress()
        wait("async timer resolves") { label("Status: done") }
        window.setContentSize(NSSize(width:820,height:500)); view.frame = window.contentView!.bounds; view.layoutSubtreeIfNeeded()
        check(view.bounds.width == 820 && view.subviews.first?.frame.width == 820,"resize container and render root")
        button("替换当前页并传参").accessibilityPerformPress()
        wait("replace parameters") { descendants(view).compactMap { $0 as? NSTextField }.contains { $0.stringValue.contains("replace 的新参数") } }
        check(view.routeStack == ["counter","async-form"],"replace preserves stack depth")
        button("返回 Counter").accessibilityPerformPress()
        wait("router back preserves Counter state") { label("Count: 1") }
        wait("back restores previous entry params") { label("路由参数: {\"origin\":\"root\"}") }
        // Memory pressure releases covered instances but leaves the route snapshot.
        view.push(page:"timers")
        wait("retention timer page") { label("计时次数: 0") }
        var evicted: [String] = []
        view.onPageEvicted = { evicted.append($0) }
        view.trimMemory()
        check(evicted == ["counter"], "hidden counter evicted")
        check(view.pop(), "pop after eviction")
        wait("evicted entry remounts with fresh state and original params") { label("Count: 0") && label("路由参数: {\"origin\":\"root\"}") }
        view.maxRetainedPages = 1
        button("+1").accessibilityPerformPress()
        wait("counter changes before capacity eviction") { label("Count: 1") }
        view.push(page:"timers")
        wait("capacity push") { label("计时次数: 0") }
        check(view.pop(), "capacity pop")
        wait("capacity remount") { label("Count: 0") }
        view.maxRetainedPages = Int.max
        view.load(page:"timers")
        wait("timer page") { label("计时次数: 0") }
        button("await 后计时").accessibilityPerformPress()
        wait("Promise and timer") { label("计时次数: 1") }
        button("1 秒后计数").accessibilityPerformPress()
        button("取消计时").accessibilityPerformPress()
        RunLoop.main.run(until:Date(timeIntervalSinceNow:1.2))
        check(label("计时次数: 1"),"cancelled timer must not run")
        button("1 秒后计数").accessibilityPerformPress()
        view.load(page:"counter")
        wait("replace cancels old page") { label("Count: 0") }
        RunLoop.main.run(until:Date(timeIntervalSinceNow:1.2))
        check(label("Count: 0"),"old page cannot update new page")
        view.load(page:"extensions")
        wait("native component page") { label("平台: unknown") || !errors.isEmpty }
        check(errors.isEmpty,"extensions: \(errors)")
        button("读取平台信息").accessibilityPerformPress()
        wait("native module") { label("平台: macOS") }
        button("调用原生方法").accessibilityPerformPress()
        wait("native component ref") { label("状态: ref toggle") }
        button("卸载原生组件").accessibilityPerformPress()
        wait("native component removed") { !descendants(view).contains { $0.identifier?.rawValue == "extension-switch" } }
        button("检查卸载 ref").accessibilityPerformPress()
        wait("unmounted ref invalidated") { label("状态: ref cleared / stale rejected") }
        button("读取应用 / 设备 / 语言").accessibilityPerformPress()
        wait("standard application/device/locale modules") { descendants(view).compactMap { $0 as? NSTextField }.contains { $0.identifier?.rawValue == "native-status" && $0.stringValue.contains("macOS") } }
        button("普通存储：写入并读回").accessibilityPerformPress()
        wait("standard storage module") { descendants(view).compactMap { $0 as? NSTextField }.contains { $0.identifier?.rawValue == "native-status" && $0.stringValue.contains("AnseronUI 原生能力示例") } }
        button("普通存储：列出 / 删除 / 清空示例空间").accessibilityPerformPress()
        button("监听网络 / 窗口 / 主题 / 键盘 / 前后台 / 链接 / 传输").accessibilityPerformPress()
        wait("compiled subscription setup") { descendants(view).contains { $0.accessibilityRole() == .button && $0.accessibilityLabel() == "停止环境监听" } }
        RunLoop.main.run(until:Date(timeIntervalSinceNow:0.5))
        window.setContentSize(NSSize(width:760,height:620)); view.frame = window.contentView!.bounds; view.layoutSubtreeIfNeeded()
        wait("compiled window subscription") { descendants(view).compactMap { $0 as? NSTextField }.contains { $0.identifier?.rawValue == "native-events" && $0.stringValue.contains("window") } }
        button("停止环境监听").accessibilityPerformPress()
        wait("compiled unsubscribe") { label("已停止监听") }

        view.load(page:"components")
        wait("component showcase") { descendants(view).contains { $0.identifier?.rawValue == "component-increment" } || !errors.isEmpty }
        check(errors.isEmpty,"components: \(errors)")
        let increment = descendants(view).first { $0.identifier?.rawValue == "component-increment" }!
        increment.accessibilityPerformPress()
        wait("component state") { label("点击: 1") }
        let scroll = descendants(view).compactMap { $0 as? NSScrollView }.first!
        check(scroll.documentView!.frame.height > scroll.bounds.height,"scroll content extends viewport")
        check(scroll.documentView!.isFlipped,"top-left document coordinates")
        let video = descendants(view).compactMap { $0 as? AVPlayerView }.first!
        wait("showcase video ready",timeout:15) { video.player?.currentItem?.status != .unknown }
        check(video.player?.currentItem?.status == .readyToPlay,"showcase asset loads from test resources: \(String(describing:video.player?.currentItem?.error))")
        button("播放").accessibilityPerformPress()
        wait("TSX play button starts player") { video.player?.rate != 0 }
        wait("TSX video progress displays seconds") { descendants(view).compactMap { $0 as? NSTextField }.contains { $0.stringValue.hasPrefix("进度: 1s") } }
        button("暂停").accessibilityPerformPress()
        wait("TSX pause button pauses player") { video.player?.rate == 0 && label("Video: paused") }
        let pausedTime = video.player!.currentTime().seconds
        RunLoop.main.run(until:Date(timeIntervalSinceNow:0.6))
        check(abs(video.player!.currentTime().seconds-pausedTime) < 0.05,"paused time remains stable through state rerenders")
        button("播放").accessibilityPerformPress()
        wait("TSX resume advances playback") { video.player!.currentTime().seconds > pausedTime+0.3 }
        view.setVisibility(false)
        wait("hidden page pauses native video") { video.player?.rate == 0 }
        let hiddenTime = video.player!.currentTime().seconds
        RunLoop.main.run(until:Date(timeIntervalSinceNow:0.4))
        check(abs(video.player!.currentTime().seconds - hiddenTime) < 0.05, "hidden video stays paused")
        view.setVisibility(true)
        wait("visible page resumes native video") { video.player?.rate != 0 }
        button("重置").accessibilityPerformPress()
        wait("TSX stop resets player") { video.player?.rate == 0 && video.player!.currentTime().seconds < 0.05 }
        let readerCheckbox = descendants(view).first { $0.identifier?.rawValue == "accessibility-checkbox" }!
        check(readerCheckbox.accessibilityRole() == .checkBox, "AOT reader role")
        check(readerCheckbox.accessibilityPerformPress(), "AOT reader checkbox activates")
        wait("AOT reader checkbox state") { (readerCheckbox.accessibilityValue() as? NSNumber)?.boolValue == true }
        check(readerCheckbox.accessibilityCustomActions()?.first?.handler?() == true, "AOT reader long press")
        wait("AOT reader long press callback") { label("已触发长按") }
        button("播报当前结果").accessibilityPerformPress()
        button("读屏聚焦到结果").accessibilityPerformPress()
        RunLoop.main.run(until:Date(timeIntervalSinceNow:0.2))
        check(!label("播报请求失败") && !label("聚焦请求失败"), "AOT reader ref methods accepted")
        let listStart = ProcessInfo.processInfo.systemUptime
        view.load(page:"virtual-list")
        func row(_ id: Int) -> NSView? { descendants(view).first { $0.identifier?.rawValue == "list-row-\(id)" } }
        wait("variable list mounts") { row(0) != nil || !errors.isEmpty }
        check(errors.isEmpty, "list mount: \(errors)")
        let firstFrameMs = (ProcessInfo.processInfo.systemUptime - listStart) * 1000
        let firstHeight = row(0)!.frame.height
        let expand = descendants(row(0)!).first { $0.accessibilityRole() == .button }!
        expand.accessibilityPerformPress()
        wait("native variable row remeasures") { (row(0)?.frame.height ?? 0) > firstHeight + 20 }
        let listScroll = descendants(view).compactMap { $0 as? NSScrollView }.first!
        var stats: [String: Double]?
        view.onRuntimeStats = { stats = $0 }
        view.inspectRuntime(reset: true)
        wait("native performance inspection") { stats != nil }
        let jumpStart = ProcessInfo.processInfo.systemUptime
        button("跳到第 4000 项").accessibilityPerformPress()
        wait("native list distant window") { row(4000) != nil && row(0) == nil }
        wait("native list anchor alignment") {
            guard let item = row(4000) else { return false }
            return abs(item.convert(.zero, to: listScroll.documentView).y - listScroll.contentView.bounds.minY) < 3
        }
        let jumpMs = (ProcessInfo.processInfo.systemUptime - jumpStart) * 1000
        let anchor = row(4000)!.convert(.zero, to: listScroll.documentView).y - listScroll.contentView.bounds.minY
        button("头部插入").accessibilityPerformPress()
        wait("native prepend keeps anchor") { row(4000) != nil && abs(row(4000)!.convert(.zero, to:listScroll.documentView).y - listScroll.contentView.bounds.minY - anchor) < 3 }
        view.setVisibility(false)
        let tick = descendants(view).compactMap { $0 as? NSTextField }.first { $0.identifier?.rawValue == "list-active-ticks" }!
        let beforeTick = tick.stringValue
        RunLoop.main.run(until:Date(timeIntervalSinceNow:1.1))
        check(tick.stringValue == beforeTick, "hidden page stops visible work")
        view.setVisibility(true)
        wait("visible page restarts visible work") { tick.stringValue != beforeTick }
        window.setContentSize(NSSize(width:240,height:620)); view.frame = window.contentView!.bounds; view.layoutSubtreeIfNeeded()
        wait("native list resizes without mounting all rows") { row(4000) != nil && row(4000)!.frame.width <= 241 }
        let rowCount = descendants(view).filter { $0.identifier?.rawValue.hasPrefix("list-row-") == true }.count
        check(rowCount < 60, "bounded native list window")
        stats = nil; view.inspectRuntime(); wait("native render phase metrics") { stats != nil }
        check((stats?["hostCommits"] ?? 0) > 0 && (stats?["measureRequests"] ?? 0) > 0, "native render phases collected")
        try FileManager.default.createDirectory(atPath:".verification/performance",withIntermediateDirectories:true)
        let report: [String: Any] = ["schemaVersion":1, "mode":"appkit-native", "fixture":"5000 variable text rows; expand, jump, prepend, hide/resume and resize", "firstFrameMs":firstFrameMs, "jumpMs":jumpMs, "mountedRows":rowCount, "metrics":stats!]
        try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:".verification/performance/appkit-native.json"))
        view.destroy(); view.destroy()
        check(view.isDestroyed && view.subviews.isEmpty,"idempotent destruction")
        RunLoop.main.run(until:Date(timeIntervalSinceNow:0.2))
        check(errors.isEmpty,"diagnostics: \(errors)")
        try RendererRegression.run()
        print("PASS: AOT Core, AppKit controls, routing, resize, async/timers, native modules/components/refs, scrolling, variable-height lists, retention, visibility/media suspension, profiling and destruction")
    }
}
