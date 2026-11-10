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
        let window = NSWindow(contentRect:NSRect(x:0,y:0,width:640,height:600),styleMask:[.titled,.resizable],backing:.buffered,defer:false)
        let view = AnseronUIRenderView(frame:window.contentView!.bounds,baseURL:URL(string:"http://127.0.0.1:5174"),extensions:demoExtensions())
        view.autoresizingMask = [.width,.height]; window.contentView!.addSubview(view)
        var errors:[String] = []
        view.onFailure = { errors.append(String(describing:$0)) }
        view.onDiagnostic = { errors.append("\($0): \($1)") }
        func label(_ text:String) -> Bool { descendants(view).contains { ($0 as? NSTextField)?.stringValue == text } }
        func button(_ title:String) -> NSButton { descendants(view).compactMap { $0 as? NSButton }.first { $0.title == title }! }
        view.load(page:"counter", params:["origin":"root"])
        wait("counter first frame") { label("Count: 0") || !errors.isEmpty }
        wait("root route parameters") { label("路由参数: {\"origin\":\"root\"}") }
        check(errors.isEmpty,"counter: \(errors)")
        button("+1").performClick(nil)
        wait("button enters AOT Core") { label("Count: 1") }
        button("打开 Async Form").performClick(nil)
        wait("router push") { label("Async form") }
        check(view.routeStack == ["counter","async-form"],"route stack")
        wait("pushed parameters enter AOT page") { descendants(view).compactMap { $0 as? NSTextField }.contains { $0.stringValue.contains("来自 Counter 的参数") && $0.stringValue.contains("\"count\":1") } }
        let input = descendants(view).compactMap { $0 as? NSTextField }.first { $0.isEditable }!
        input.stringValue = "原生 macOS"
        NotificationCenter.default.post(name:NSControl.textDidChangeNotification,object:input)
        button("Add task").performClick(nil)
        wait("controlled input creates item") { label("原生 macOS") && input.stringValue.isEmpty }
        button("Wait").performClick(nil)
        wait("async timer resolves") { label("Status: done") }
        window.setContentSize(NSSize(width:820,height:500)); view.frame = window.contentView!.bounds; view.layoutSubtreeIfNeeded()
        check(view.bounds.width == 820 && view.subviews.first?.frame.width == 820,"resize container and render root")
        button("替换当前页并传参").performClick(nil)
        wait("replace parameters") { descendants(view).compactMap { $0 as? NSTextField }.contains { $0.stringValue.contains("replace 的新参数") } }
        check(view.routeStack == ["counter","async-form"],"replace preserves stack depth")
        button("返回 Counter").performClick(nil)
        wait("router back preserves Counter state") { label("Count: 1") }
        wait("back restores previous entry params") { label("路由参数: {\"origin\":\"root\"}") }
        view.load(page:"timers")
        wait("timer page") { label("计时次数: 0") }
        button("await 后计时").performClick(nil)
        wait("Promise and timer") { label("计时次数: 1") }
        button("1 秒后计数").performClick(nil)
        button("取消计时").performClick(nil)
        RunLoop.main.run(until:Date(timeIntervalSinceNow:1.2))
        check(label("计时次数: 1"),"cancelled timer must not run")
        button("1 秒后计数").performClick(nil)
        view.load(page:"counter")
        wait("replace cancels old page") { label("Count: 0") }
        RunLoop.main.run(until:Date(timeIntervalSinceNow:1.2))
        check(label("Count: 0"),"old page cannot update new page")
        view.load(page:"extensions")
        wait("native component page") { label("平台: unknown") || !errors.isEmpty }
        check(errors.isEmpty,"extensions: \(errors)")
        button("读取平台信息").performClick(nil)
        wait("native module") { label("平台: macOS") }
        button("调用原生方法").performClick(nil)
        wait("native component ref") { label("状态: ref toggle") }
        button("卸载原生组件").performClick(nil)
        wait("native component removed") { !descendants(view).contains { $0.identifier?.rawValue == "extension-switch" } }
        button("检查卸载 ref").performClick(nil)
        wait("unmounted ref invalidated") { label("状态: ref cleared / stale rejected") }
        button("读取应用 / 设备 / 语言").performClick(nil)
        wait("standard application/device/locale modules") { descendants(view).compactMap { $0 as? NSTextField }.contains { $0.identifier?.rawValue == "native-status" && $0.stringValue.contains("macOS") } }
        button("普通存储：写入并读回").performClick(nil)
        wait("standard storage module") { descendants(view).compactMap { $0 as? NSTextField }.contains { $0.identifier?.rawValue == "native-status" && $0.stringValue.contains("AnseronUI 原生能力示例") } }
        button("普通存储：列出 / 删除 / 清空示例空间").performClick(nil)
        button("监听网络 / 窗口 / 主题 / 键盘 / 前后台 / 链接 / 传输").performClick(nil)
        wait("compiled subscription setup") { descendants(view).compactMap { $0 as? NSButton }.contains { $0.title == "停止环境监听" } }
        RunLoop.main.run(until:Date(timeIntervalSinceNow:0.5))
        window.setContentSize(NSSize(width:760,height:620)); view.frame = window.contentView!.bounds; view.layoutSubtreeIfNeeded()
        wait("compiled window subscription") { descendants(view).compactMap { $0 as? NSTextField }.contains { $0.identifier?.rawValue == "native-events" && $0.stringValue.contains("window") } }
        button("停止环境监听").performClick(nil)
        wait("compiled unsubscribe") { label("已停止监听") }

        view.load(page:"components")
        wait("component showcase") { descendants(view).contains { $0.identifier?.rawValue == "component-increment" } || !errors.isEmpty }
        check(errors.isEmpty,"components: \(errors)")
        let increment = descendants(view).first { $0.identifier?.rawValue == "component-increment" } as! NSButton
        increment.performClick(nil)
        wait("component state") { label("点击: 1") }
        let scroll = descendants(view).compactMap { $0 as? NSScrollView }.first!
        check(scroll.documentView!.frame.height > scroll.bounds.height,"scroll content extends viewport")
        check(scroll.documentView!.isFlipped,"top-left document coordinates")
        let video = descendants(view).compactMap { $0 as? AVPlayerView }.first!
        wait("showcase video ready",timeout:15) { video.player?.currentItem?.status != .unknown }
        check(video.player?.currentItem?.status == .readyToPlay,"showcase asset loads from test resources: \(String(describing:video.player?.currentItem?.error))")
        button("播放").performClick(nil)
        wait("TSX play button starts player") { video.player?.rate != 0 }
        wait("TSX video progress displays seconds") { descendants(view).compactMap { $0 as? NSTextField }.contains { $0.stringValue.hasPrefix("进度: 1s") } }
        button("暂停").performClick(nil)
        wait("TSX pause button pauses player") { video.player?.rate == 0 && label("Video: paused") }
        let pausedTime = video.player!.currentTime().seconds
        RunLoop.main.run(until:Date(timeIntervalSinceNow:0.6))
        check(abs(video.player!.currentTime().seconds-pausedTime) < 0.05,"paused time remains stable through state rerenders")
        button("播放").performClick(nil)
        wait("TSX resume advances playback") { video.player!.currentTime().seconds > pausedTime+0.3 }
        button("重置").performClick(nil)
        wait("TSX stop resets player") { video.player?.rate == 0 && video.player!.currentTime().seconds < 0.05 }
        view.destroy(); view.destroy()
        check(view.isDestroyed && view.subviews.isEmpty,"idempotent destruction")
        RunLoop.main.run(until:Date(timeIntervalSinceNow:0.2))
        check(errors.isEmpty,"diagnostics: \(errors)")
        try RendererRegression.run()
        print("PASS: AOT Core, AppKit controls, routing, resize, async/timers, native modules/components/refs, scrolling and destruction")
    }
}
