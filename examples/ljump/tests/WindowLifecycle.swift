import AppKit

@main @MainActor enum WindowLifecycleTests {
    static func main() async throws {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        let native = LjumpNative.shared
        let extensions = native.extensions()
        var closed: [Int] = []
        let stop = try extensions.subscriptions["ljump.events"]! { result in
            if let event = try? result.get() as? [String: Any], event["kind"] as? String == "windowClosed",
               let id = event["id"] as? Int { closed.append(id) }
        }
        func watch(_ id: Int) throws {
            _ = try extensions.modules["ljump"]!("watchWindows", [
                "windows": [["id": id, "pid": Int(ProcessInfo.processInfo.processIdentifier)]]
            ]) { result in if case .failure(let error) = result { fatalError("\(error)") } }
        }
        func wait() async throws { try await Task.sleep(nanoseconds: 1_500_000_000) }
        var window: NSWindow? = NSWindow(contentRect: NSRect(x: 20, y: 20, width: 240, height: 160),
                                        styleMask: [.titled, .miniaturizable], backing: .buffered, defer: false)
        window!.isReleasedWhenClosed = false
        window!.title = "Ljump lifecycle fixture"
        window!.orderFrontRegardless()
        let id = window!.windowNumber
        try watch(id)
        try await wait()
        precondition(closed.isEmpty, "Live window was removed")
        window!.miniaturize(nil)
        try await wait()
        precondition(window!.isMiniaturized, "Fixture was not minimized")
        let minimized = try LjumpNative.windowInfo(id: CGWindowID(id), pid: ProcessInfo.processInfo.processIdentifier)
        precondition(minimized != nil, "Activation lookup lost a minimized window")
        precondition(closed.isEmpty, "Minimized window was removed")
        window!.deminiaturize(nil)
        window!.orderOut(nil)
        try await wait()
        precondition(closed.isEmpty, "Hidden window was removed")
        window!.close()
        window = nil
        try await wait()
        precondition(closed == [id], "Closed window not removed exactly once: \(closed)")
        try await wait()
        precondition(closed == [id], "Close event duplicated")
        // Simulate clicking a saved window ID before the watcher can check it.
        let clickedID = 2_000_000_001
        try watch(clickedID)
        let status: String = try await withCheckedThrowingContinuation { continuation in
            do {
                _ = try extensions.modules["ljump"]!("activate", [
                    "id": clickedID, "pid": Int(ProcessInfo.processInfo.processIdentifier), "fromClick": true
                ]) { result in
                    continuation.resume(with: result.map { ($0 as? [String: String])?["status"] ?? "" })
                }
            } catch { continuation.resume(throwing: error) }
        }
        precondition(status == "closed", "Click did not return a structured close result: \(status)")
        precondition(closed == [id, clickedID], "Click did not immediately retire the closed window")
        try await wait()
        precondition(closed == [id, clickedID], "Click and poll duplicated the close event")
        try watch(2_000_000_002)
        stop?()
        try await wait()
        precondition(closed == [id, clickedID], "Callback delivered after unsubscribe")
        let thumbnail = LjumpWindowThumbnail()
        try thumbnail.setProps(["windowId": 0, "revision": 1])
        thumbnail.dispose()
        let icon = LjumpAppIcon()
        try icon.setProps(["bundleId": "com.apple.finder"])
        precondition((icon.view as? NSImageView)?.image != nil, "Icon was not resolved from native props")
        icon.dispose()
        precondition((icon.view as? NSImageView)?.image == nil, "Icon retained after disposal")
        try await testReminders()
        testWindowDetails()
        native.shutdown()
        print("PASS: live, minimized and hidden windows retained; activation lookup includes minimized windows; polling and activation retire a destroyed window exactly once; unsubscribe releases polling")
    }
}
