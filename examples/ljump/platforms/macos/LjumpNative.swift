import AppKit
import ApplicationServices
import QuartzCore

@MainActor final class LjumpNative {
    static let shared = LjumpNative()

    private struct WindowKey: Hashable {
        let id: CGWindowID
        let pid: pid_t

        init?(id: Any?, pid: Any?) {
            guard let id = id as? NSNumber, let pid = pid as? NSNumber else { return nil }
            self.id = id.uint32Value
            self.pid = pid.int32Value
        }
    }

    private struct WindowRecord {
        let key: WindowKey
        let bounds: CGRect
        let title: String

        init?(_ values: [String: Any]) {
            guard let key = WindowKey(id: values[kCGWindowNumber as String], pid: values[kCGWindowOwnerPID as String]),
                  let bounds = values[kCGWindowBounds as String] as? [String: Any],
                  let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary) else { return nil }
            self.key = key
            self.bounds = rect
            title = values[kCGWindowName as String] as? String ?? ""
        }
    }

    private struct CardDrag {
        let key: WindowKey
        let start: NSPoint
    }

    private enum ActivationError: LocalizedError {
        case windowClosed

        var errorDescription: String? { "窗口已关闭" }
    }

    private weak var panel: NSPanel?
    private var globalMonitor: Any?
    private var localMonitor: Any?
    private var eventEmit: NativeCompletion?
    private var monitoringSession: UUID?
    private var dragCandidate: WindowRecord?
    private var draggedWindow: [String: Any]?
    private var cardDrag: CardDrag?
    private var suppressedCardClick: WindowKey?
    private var dragPreview: LjumpDragPreview?
    private var isVisible = false
    private var overlayScreen: NSScreen?
    private var lastHoveredTarget = ""
    private var windowWatchTimer: Timer?
    private var hideTimer: Timer?
    private var editing = false
    private var watchedWindows = Set<WindowKey>()
    private var missingWindows = Set<WindowKey>()
    private var launchedAt = Date.distantPast
    private var inspectedWindows = Set<WindowKey>()
    private var detailsTask: Task<Void, Never>?
    private var lastDetails: [LjumpWindowDetail] = []
    private var lastDetailsRefresh = Date.distantPast

    private init() {}

    func attach(_ panel: NSPanel) {
        self.panel = panel
        LjumpReminders.shared.install()
        LjumpReminders.shared.onChange = { [weak self] in self?.emit(["kind": "remindersChanged"]) }
        LjumpReminders.shared.onOpen = { [weak self] id, pid in
            guard let self, let key = WindowKey(id: NSNumber(value: id), pid: NSNumber(value: pid)) else { return }
            Task { @MainActor [weak self] in
                do { try await self?.activate(key) }
                catch ActivationError.windowClosed { }
                catch { self?.reveal() }
            }
        }
    }

    func reveal() {
        guard let screen = screenAt(NSEvent.mouseLocation) ?? NSScreen.main else { return }
        launchedAt = Date()
        showOverlay(on: screen, takeKeyboard: true)
    }

    func shutdown() {
        stopMonitoring()
        panel?.orderOut(nil)
    }

    func extensions() -> MacOSPlatformExtensions {
        MacOSPlatformExtensions(modules: ["ljump": { [weak self] method, args, complete in
            guard let self else { throw NativeExtensionError.nodeUnmounted }
            let payload = args as? [String: Any] ?? [:]
            switch method {
            case "inspectWindows":
                guard let records = payload["windows"] as? [[String: Any]] else { throw NativeExtensionError.invalidArguments }
                self.stopInspectingWindows()
                self.inspectedWindows = Set(records.compactMap { WindowKey(id: $0["id"], pid: $0["pid"]) })
                self.refreshWindowDetails()
                complete(.success(NSNull()))
            case "watchWindows":
                guard let records = payload["windows"] as? [[String: Any]] else { throw NativeExtensionError.invalidArguments }
                self.watchWindows(records)
                complete(.success(NSNull()))
            case "reminders":
                complete(.success(LjumpReminders.shared.snapshot()))
            case "setEditing":
                self.editing = payload["editing"] as? Bool ?? false
                if self.editing { self.hideTimer?.invalidate(); self.hideTimer = nil }
                complete(.success(NSNull()))
            case "setReminder":
                guard let id = payload["id"] as? Int, let pid = payload["pid"] as? Int else { throw NativeExtensionError.invalidArguments }
                let date = try LjumpReminders.date(mode: payload["mode"] as? String ?? "",
                                                  minutes: payload["minutes"] as? String ?? "",
                                                  time: payload["time"] as? String ?? "")
                let task = Task { @MainActor in
                    do {
                        try await LjumpReminders.shared.set(windowID: id, pid: pid, date: date)
                        complete(.success(LjumpReminders.shared.snapshot()))
                    } catch {
                        complete(.failure(NSError(domain: "Ljump", code: 1, userInfo: [NSLocalizedDescriptionKey: error.localizedDescription])))
                    }
                }
                return { task.cancel() }
            case "cancelReminder":
                guard let id = payload["id"] as? Int, let pid = payload["pid"] as? Int else { throw NativeExtensionError.invalidArguments }
                LjumpReminders.shared.cancel("\(pid):\(id)")
                complete(.success(LjumpReminders.shared.snapshot()))
            case "status":
                let trusted = AXIsProcessTrusted()
                complete(.success(["trusted": trusted, "capture": CGPreflightScreenCaptureAccess()]))
            case "requestAccessibility":
                self.openAccessibilitySettings()
                complete(.success(NSNull()))
            case "requestCapture":
                complete(.success(["capture": self.requestCapture()]))
            case "hideOverlay":
                self.hideOverlay()
                complete(.success(NSNull()))
            case "activate":
                guard let key = WindowKey(id: payload["id"], pid: payload["pid"]) else { throw NativeExtensionError.invalidArguments }
                if payload["fromClick"] as? Bool == true, self.suppressedCardClick == key {
                    complete(.success(["status": "ignored", "message": ""]))
                    return nil
                }
                let task = Task { @MainActor [weak self] in
                    do {
                        guard let self else { throw NativeExtensionError.nodeUnmounted }
                        try await self.activate(key)
                        complete(.success(["status": "opened", "message": ""]))
                    } catch ActivationError.windowClosed {
                        complete(.success(["status": "closed", "message": ""]))
                    } catch {
                        complete(.success(["status": "failed", "message": error.localizedDescription]))
                    }
                }
                return { task.cancel() }
            default:
                throw NativeExtensionError.unsupportedMethod(method)
            }
            return nil
        }], components: [
            "LjumpWindowThumbnail": { _ in LjumpWindowThumbnail() },
            "LjumpAppIcon": { _ in LjumpAppIcon() },
        ], subscriptions: ["ljump.events": { [weak self] emit in
            self?.startMonitoring(emit)
        }])
    }

    func openAccessibilitySettings() {
        guard !AXIsProcessTrusted() else { return }
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
        openPrivacySettings("Accessibility")
    }

    func requestCapture() -> Bool {
        guard !CGPreflightScreenCaptureAccess() else { return true }
        let allowed = CGRequestScreenCaptureAccess()
        if !allowed { openPrivacySettings("ScreenCapture") }
        return allowed
    }

    private func openPrivacySettings(_ pane: String) {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_" + pane) {
            NSWorkspace.shared.open(url)
        }
    }

    private func activate(_ key: WindowKey) async throws {
        NSLog("Ljump activate: window=%u pid=%d trusted=%d bundle=%@", key.id, key.pid, AXIsProcessTrusted() ? 1 : 0, Bundle.main.bundlePath)
        guard let app = NSRunningApplication(processIdentifier: key.pid), !app.isTerminated else {
            throw closedWindow(key)
        }
        _ = try windowForActivation(key)
        guard AXIsProcessTrusted() else {
            openAccessibilitySettings()
            throw failure("需要辅助功能权限。请在系统设置中开启 Ljump；若已开启，请移除旧条目后重新添加当前 Ljump.app。")
        }
        // A nonactivating panel can keep keyboard focus. Relinquish it before asking
        // another application to activate, and allow hidden/minimized apps to publish AX windows.
        panel?.resignKey()
        app.unhide()
        NSApp.yieldActivation(to: app)
        _ = app.activate(options: [.activateIgnoringOtherApps])
        var matchedWindow: AXUIElement?
        for _ in 0..<3 {
            try await Task.sleep(nanoseconds: 140_000_000)
            let record = try windowForActivation(key)
            matchedWindow = accessibilityWindow(record)
            if matchedWindow != nil || isFrontWindow(key, of: app) { break }
        }
        guard let target = matchedWindow else {
            if isFrontWindow(key, of: app) {
                NSLog("Ljump activation result: selected window is already frontmost")
                hideOverlay()
                return
            }
            throw failure("应用已打开，但无法定位所选窗口。请重新将该窗口加入工作组。")
        }
        if read(target, kAXMinimizedAttribute) as? Bool == true {
            let restored = AXUIElementSetAttributeValue(target, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
            guard restored == .success else { throw failure("无法恢复最小化窗口（辅助功能错误 \(restored.rawValue)）") }
            // Restoring from the Dock is asynchronous. Do not report success while
            // the window is still minimized or raise it before restoration finishes.
            for _ in 0..<12 {
                try await Task.sleep(nanoseconds: 80_000_000)
                if read(target, kAXMinimizedAttribute) as? Bool == false { break }
            }
            guard read(target, kAXMinimizedAttribute) as? Bool != true else {
                throw failure("窗口仍在最小化，请重试。")
            }
        }
        try Task.checkCancellation()
        _ = app.activate(options: [.activateIgnoringOtherApps])
        _ = AXUIElementSetAttributeValue(target, kAXMainAttribute as CFString, kCFBooleanTrue)
        _ = AXUIElementSetAttributeValue(target, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        let raised = AXUIElementPerformAction(target, kAXRaiseAction as CFString)
        let application = AXUIElementCreateApplication(key.pid)
        _ = AXUIElementSetAttributeValue(application, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
        NSLog("Ljump activation result: raise=%d active=%d", raised.rawValue, app.isActive ? 1 : 0)
        guard raised == .success || isFrontWindow(key, of: app) else {
            _ = try windowForActivation(key)
            throw failure("应用已打开，但窗口未能置前（辅助功能错误 \(raised.rawValue)）")
        }
        hideOverlay()
    }

    private func windowForActivation(_ key: WindowKey) throws -> WindowRecord {
        guard let item = try Self.windowInfo(id: key.id, pid: key.pid) else { throw closedWindow(key) }
        guard let record = WindowRecord(item) else { throw failure("暂时无法读取窗口位置，请重试。") }
        return record
    }

    static func windowInfo(id: CGWindowID, pid: pid_t) throws -> [String: Any]? {
        // optionIncludingWindow can return a non-nil list that omits a minimized
        // window. Query all windows, just like the lifecycle watcher does.
        guard let items = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
            throw NSError(domain: "Ljump", code: 1, userInfo: [NSLocalizedDescriptionKey: "暂时无法读取系统窗口，请重试。"])
        }
        return items.first { ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value == id
            && ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid }
    }

    private func closedWindow(_ key: WindowKey) -> ActivationError {
        retireWindow(key)
        return .windowClosed
    }

    private func isFrontWindow(_ key: WindowKey, of app: NSRunningApplication) -> Bool {
        guard app.isActive,
              let items = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return false }
        return items.lazy.filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
            .compactMap(WindowRecord.init).first { $0.key.pid == key.pid }?.key == key
    }

    private func failure(_ message: String) -> NSError {
        NSError(domain: "Ljump", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private func screenAt(_ point: NSPoint) -> NSScreen? {
        NSScreen.screens.first { $0.frame.contains(point) }
    }

    private func showOverlay(on screen: NSScreen, takeKeyboard: Bool) {
        guard let panel else { return }
        if isVisible, overlayScreen == screen {
            if takeKeyboard, !panel.isKeyWindow { panel.makeKey() }
            return
        }
        overlayScreen = screen
        isVisible = true
        let area = screen.visibleFrame
        let height = min(670, area.height - 12)
        let width = min(580, area.width)
        let frame = NSRect(x: screen.frame.maxX - width, y: area.midY - height / 2, width: width, height: height)
        panel.setFrame(frame.offsetBy(dx: 56, dy: 0), display: false)
        panel.alphaValue = 0
        panel.orderFrontRegardless()
        if takeKeyboard { panel.makeKey() }
        animate(duration: 0.22, easing: .easeOut) {
            panel.animator().setFrame(frame, display: true)
            panel.animator().alphaValue = 1
        }
        emit(["kind": "show"])
    }

    private func hideOverlay() {
        hideTimer?.invalidate()
        hideTimer = nil
        guard isVisible, let panel else { return }
        isVisible = false
        stopInspectingWindows()
        editing = false
        overlayScreen = nil
        lastHoveredTarget = ""
        resetDrag()
        let frame = panel.frame.offsetBy(dx: 36, dy: 0)
        animate(duration: 0.16, easing: .easeIn, changes: {
            panel.animator().setFrame(frame, display: true)
            panel.animator().alphaValue = 0
        }, completion: { [weak self, weak panel] in
            if self?.isVisible == false { panel?.orderOut(nil) }
        })
        emit(["kind": "leave"])
    }

    private func animate(duration: TimeInterval, easing: CAMediaTimingFunctionName, changes: () -> Void, completion: (() -> Void)? = nil) {
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? 0 : duration
            context.timingFunction = CAMediaTimingFunction(name: easing)
            changes()
        }, completionHandler: completion)
    }

    private func startMonitoring(_ emit: @escaping NativeCompletion) -> () -> Void {
        stopMonitoring()
        eventEmit = emit
        let session = UUID()
        monitoringSession = session
        let pointerEvents: NSEvent.EventTypeMask = [.mouseMoved, .leftMouseDown, .leftMouseDragged, .leftMouseUp, .rightMouseDown]
        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: pointerEvents) { [weak self] event in
            MainActor.assumeIsolated { self?.handlePointer(event, local: false) }
        }
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: pointerEvents.union(.keyDown)) { [weak self] event in
            MainActor.assumeIsolated {
                guard let self else { return event }
                if event.type == .keyDown { return self.handleKey(event) ? nil : event }
                self.handlePointer(event, local: true)
                return event
            }
        }
        return { [weak self] in
            Task { @MainActor in
                if self?.monitoringSession == session { self?.stopMonitoring() }
            }
        }
    }

    private func stopMonitoring() {
        hideTimer?.invalidate()
        hideTimer = nil
        if let globalMonitor { NSEvent.removeMonitor(globalMonitor) }
        if let localMonitor { NSEvent.removeMonitor(localMonitor) }
        globalMonitor = nil
        localMonitor = nil
        resetDrag()
        suppressedCardClick = nil
        eventEmit = nil
        monitoringSession = nil
        stopWatchingWindows()
    }

    private func emit(_ event: [String: Any]) { eventEmit?(.success(event)) }

    private func watchWindows(_ records: [[String: Any]]) {
        watchedWindows = Set(records.compactMap { WindowKey(id: $0["id"], pid: $0["pid"]) })
        let reminderWindows = records.compactMap { record -> LjumpReminderWindow? in
            guard let id = record["id"] as? Int, let pid = record["pid"] as? Int,
                  let title = record["title"] as? String, let group = record["group"] as? String, !group.isEmpty,
                  let launch = NSRunningApplication(processIdentifier: pid_t(pid))?.launchDate else { return nil }
            return LjumpReminderWindow(id: id, pid: pid, launchedAt: launch.timeIntervalSince1970, title: title, group: group)
        }
        LjumpReminders.shared.sync(reminderWindows)
        missingWindows.formIntersection(watchedWindows)
        guard !watchedWindows.isEmpty else { stopWatchingWindows(); return }
        guard windowWatchTimer == nil else { return }
        let timer = Timer(timeInterval: 0.55, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.pruneClosedWindows() }
        }
        timer.tolerance = 0.10
        windowWatchTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func stopWatchingWindows() {
        stopInspectingWindows()
        windowWatchTimer?.invalidate()
        windowWatchTimer = nil
        watchedWindows.removeAll()
        missingWindows.removeAll()
    }

    private func pruneClosedWindows() {
        guard !watchedWindows.isEmpty,
              let items = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return }
        let live = Set(items.compactMap { WindowKey(id: $0[kCGWindowNumber as String], pid: $0[kCGWindowOwnerPID as String]) })
        let missing = watchedWindows.subtracting(live)
        let closed = missing.intersection(missingWindows)
        missingWindows = missing
        for key in closed { retireWindow(key) }
        refreshWindowDetails()
    }

    private func stopInspectingWindows() {
        detailsTask?.cancel()
        detailsTask = nil
        inspectedWindows.removeAll()
        lastDetails.removeAll()
        lastDetailsRefresh = .distantPast
    }

    private func refreshWindowDetails() {
        guard isVisible, !editing, !inspectedWindows.isEmpty, detailsTask == nil,
              Date().timeIntervalSince(lastDetailsRefresh) >= 2,
              let items = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return }
        lastDetailsRefresh = Date()
        let inputs = items.compactMap(WindowRecord.init).filter { inspectedWindows.contains($0.key) }.map { record in
            let app = NSRunningApplication(processIdentifier: record.key.pid)
            return LjumpDetailInput(id: record.key.id, pid: record.key.pid, bounds: record.bounds,
                                    title: record.title, app: app?.localizedName ?? "应用窗口", bundleID: app?.bundleIdentifier ?? "")
        }
        let trusted = AXIsProcessTrusted()
        detailsTask = Task { [weak self] in
            let worker = Task.detached(priority: .utility) { LjumpWindowDetails.read(inputs, accessibility: trusted) }
            let details = await withTaskCancellationHandler(operation: { await worker.value }, onCancel: { worker.cancel() })
            guard !Task.isCancelled, let self else { return }
            self.detailsTask = nil
            guard self.isVisible, details != self.lastDetails else { return }
            self.lastDetails = details
            self.emit(["kind": "windowDetails", "windows": details.map { $0.json }])
        }
    }

    private func retireWindow(_ key: WindowKey) {
        let wasWatched = watchedWindows.remove(key) != nil
        missingWindows.remove(key)
        inspectedWindows.remove(key)
        lastDetails.removeAll { $0.id == key.id && $0.pid == key.pid }
        LjumpReminders.shared.remove(windowID: Int(key.id), pid: Int(key.pid))
        if cardDrag?.key == key {
            let wasDragging = dragPreview != nil
            resetDrag()
            if wasDragging { emit(["kind": "dragEnd"]) }
        }
        if wasWatched { emit(["kind": "windowClosed", "id": Int(key.id), "pid": Int(key.pid)]) }
        if watchedWindows.isEmpty { stopWatchingWindows() }
    }

    private func handlePointer(_ event: NSEvent, local: Bool) {
        let point = event.window?.convertPoint(toScreen: event.locationInWindow) ?? event.locationInWindow
        let mouse = local ? point : (event.cgEvent.map { appKitPoint($0.location) } ?? NSEvent.mouseLocation)
        switch event.type {
        case .leftMouseDown:
            suppressedCardClick = nil
            let target = isVisible ? identifier(at: mouse) : ""
            if local, event.window == panel, !editing, let key = cardKey(target) {
                cardDrag = CardDrag(key: key, start: mouse)
            } else if !local && target.isEmpty {
                dragCandidate = windowAt(mouse)
            }
        case .mouseMoved, .leftMouseDragged:
            updatePointer(mouse, dragging: event.type == .leftMouseDragged)
        case .rightMouseDown:
            if isVisible {
                let target = identifier(at: mouse)
                if let group = groupID(target) { emit(["kind": "contextGroup", "groupId": group]) }
            }
        case .leftMouseUp:
            finishDrag(at: mouse)
        default: break
        }
    }

    private func updatePointer(_ point: NSPoint, dragging: Bool) {
        guard let screen = screenAt(point) else { return }
        let inHotZone = point.x >= screen.frame.maxX - 4 && point.y < screen.visibleFrame.maxY - 12
        if inHotZone && (!dragging || dragCandidate != nil) {
            showOverlay(on: screen, takeKeyboard: !dragging)
        }
        guard isVisible, let panel else { return }
        let target = identifier(at: point)
        let rightRail = point.x >= panel.frame.maxX - 221 && point.y >= panel.frame.minY - 8 && point.y <= panel.frame.maxY + 8
        let insidePanel = panel.frame.insetBy(dx: -8, dy: -8).contains(point)
        if !editing, cardDrag == nil, !inHotZone, target.isEmpty, !rightRail, !insidePanel, Date().timeIntervalSince(launchedAt) > 1.5 {
            // Allow the pointer to cross the transparent gap between the rail and window cards.
            if hideTimer == nil {
                let timer = Timer(timeInterval: 0.35, repeats: false) { [weak self] _ in
                    MainActor.assumeIsolated {
                        self?.hideTimer = nil
                        self?.hideOverlay()
                    }
                }
                hideTimer = timer
                RunLoop.main.add(timer, forMode: .common)
            }
            return
        }
        hideTimer?.invalidate()
        hideTimer = nil

        if dragging, dragPreview == nil {
            if let card = cardDrag, hypot(point.x - card.start.x, point.y - card.start.y) >= 6 {
                suppressedCardClick = card.key
                let appName = NSRunningApplication(processIdentifier: card.key.pid)?.localizedName ?? ""
                let title = currentWindow(card.key)?.title ?? ""
                dragPreview = LjumpDragPreview(windowID: card.key.id, pid: card.key.pid, title: title.isEmpty ? appName : title)
                emit(["kind": "dragStart", "id": Int(card.key.id), "pid": Int(card.key.pid)])
            } else if let candidate = dragCandidate, let record = currentWindow(candidate.key),
                      abs(record.bounds.minX - candidate.bounds.minX) + abs(record.bounds.minY - candidate.bounds.minY) > 3 {
                let info = windowInfo(record)
                draggedWindow = info
                dragPreview = LjumpDragPreview(windowID: record.key.id, pid: record.key.pid, title: info["title"] as? String ?? "")
                emit(["kind": "dragStart"])
            }
        }
        dragPreview?.move(to: point, on: screen)
        if target == lastHoveredTarget { return }
        lastHoveredTarget = target
        if let group = groupID(target) {
            emit(["kind": "hoverGroup", "groupId": group])
        } else if let key = cardKey(target) {
            emit(["kind": "hoverWindow", "id": Int(key.id), "pid": Int(key.pid)])
        } else if target == "ljump-add" {
            emit(["kind": "hoverAdd"])
        } else {
            emit(["kind": "clearTarget"])
        }
    }

    private func resetDrag() {
        dragCandidate = nil
        draggedWindow = nil
        cardDrag = nil
        dragPreview?.dispose()
        dragPreview = nil
    }

    private func finishDrag(at point: NSPoint) {
        let window = draggedWindow
        let card = cardDrag
        let wasDragging = dragPreview != nil
        resetDrag()
        guard wasDragging else { return }
        let target = isVisible ? identifier(at: point) : ""
        var drop: [String: Any] = ["kind": "drop"]
        if let group = groupID(target) { drop["groupId"] = group }
        else if target == "ljump-add" { drop["create"] = true }
        else {
            emit(["kind": "dragEnd"])
            return
        }
        if let card {
            drop["id"] = Int(card.key.id)
            drop["pid"] = Int(card.key.pid)
        } else if let window { drop["window"] = window }
        emit(drop)
        panel?.makeKey()
    }

    private func handleKey(_ event: NSEvent) -> Bool {
        guard isVisible, event.window == panel else { return false }
        if dragPreview != nil {
            if event.keyCode == 53 { resetDrag(); emit(["kind": "dragEnd"]) }
            return true
        }
        if event.keyCode != 53, editing { return false }
        if event.keyCode != 53, let editor = panel?.firstResponder as? NSTextView, editor.isFieldEditor {
            return false
        }
        let keys: [UInt16: String] = [123: "left", 124: "right", 125: "down", 126: "up", 36: "return", 76: "return", 53: "escape"]
        guard let key = keys[event.keyCode], event.modifierFlags.intersection([.command, .control, .option]).isEmpty else { return false }
        emit(["kind": "key", "key": key])
        return true
    }

    private func groupID(_ identifier: String) -> String? {
        guard identifier.hasPrefix("ljump-group:") else { return nil }
        return String(identifier.dropFirst("ljump-group:".count))
    }

    private func cardKey(_ identifier: String) -> WindowKey? {
        guard identifier.hasPrefix("ljump-window:") else { return nil }
        let parts = identifier.dropFirst("ljump-window:".count).split(separator: ":")
        guard parts.count == 2, let pid = Int(parts[0]), let id = Int(parts[1]) else { return nil }
        return WindowKey(id: id, pid: pid)
    }

    private func identifier(at screenPoint: NSPoint) -> String {
        guard let panel, panel.frame.contains(screenPoint), let content = panel.contentView else { return "" }
        let windowPoint = panel.convertPoint(fromScreen: screenPoint)
        var view = content.hitTest(content.superview?.convert(windowPoint, from: nil) ?? windowPoint)
        while let current = view {
            if let value = current.identifier?.rawValue, value.hasPrefix("ljump-") { return value }
            view = current.superview
        }
        return ""
    }

    private func appKitPoint(_ quartzPoint: CGPoint) -> NSPoint {
        NSPoint(x: quartzPoint.x, y: (NSScreen.screens.first?.frame.maxY ?? 0) - quartzPoint.y)
    }

    private func windowAt(_ point: NSPoint) -> WindowRecord? {
        guard let items = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }
        let quartzPoint = appKitPoint(point)
        return items.lazy.filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
            .compactMap(WindowRecord.init)
            .first { $0.key.pid != ProcessInfo.processInfo.processIdentifier && $0.bounds.contains(quartzPoint) }
    }

    private func currentWindow(_ key: WindowKey) -> WindowRecord? {
        let items = CGWindowListCopyWindowInfo(.optionIncludingWindow, key.id) as? [[String: Any]]
        return items?.compactMap(WindowRecord.init).first { $0.key == key }
    }

    private func windowInfo(_ record: WindowRecord) -> [String: Any] {
        let app = NSRunningApplication(processIdentifier: record.key.pid)
        let name = app?.localizedName ?? "应用窗口"
        let axTitle = AXIsProcessTrusted() ? accessibilityWindow(record).flatMap { read($0, kAXTitleAttribute) as? String } : nil
        let title = axTitle ?? record.title
        return ["id": Int(record.key.id), "windowId": Int(record.key.id), "pid": Int(record.key.pid),
                "title": title.isEmpty ? name : title, "app": name, "bundleId": app?.bundleIdentifier ?? ""]
    }

    private func read(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        return value
    }

    private func accessibilityWindow(_ record: WindowRecord) -> AXUIElement? {
        let app = AXUIElementCreateApplication(record.key.pid)
        AXUIElementSetMessagingTimeout(app, 1.0)
        var windows = read(app, kAXWindowsAttribute) as? [AXUIElement] ?? []
        for attribute in [kAXFocusedWindowAttribute, kAXMainWindowAttribute] {
            if let value = read(app, attribute), CFGetTypeID(value) == AXUIElementGetTypeID() {
                let window = value as! AXUIElement
                if !windows.contains(where: { CFEqual($0, window) }) { windows.append(window) }
            }
        }
        var titleMatches: [AXUIElement] = []
        var geometryMatches: [AXUIElement] = []
        for window in windows {
            if let p = read(window, kAXPositionAttribute), CFGetTypeID(p) == AXValueGetTypeID(),
               let s = read(window, kAXSizeAttribute), CFGetTypeID(s) == AXValueGetTypeID() {
                var position = CGPoint.zero
                var size = CGSize.zero
                if AXValueGetValue(p as! AXValue, .cgPoint, &position),
                   AXValueGetValue(s as! AXValue, .cgSize, &size),
                   abs(position.x - record.bounds.minX) + abs(position.y - record.bounds.minY) < 5,
                   abs(size.width - record.bounds.width) + abs(size.height - record.bounds.height) < 8 {
                    geometryMatches.append(window)
                }
            }
            if !record.title.isEmpty, read(window, kAXTitleAttribute) as? String == record.title { titleMatches.append(window) }
        }
        if geometryMatches.count == 1 { return geometryMatches.first }
        if titleMatches.count == 1 { return titleMatches.first }
        return nil
    }
}
