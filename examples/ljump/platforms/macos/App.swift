import AppKit

@MainActor final class LjumpPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

@main @MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    private var panel: LjumpPanel!
    private var pageView: AnseronUIRenderView!
    private var statusItem: NSStatusItem?

    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        withExtendedLifetime(delegate) { application.run() }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let data = try! Data(contentsOf: Bundle.main.url(forResource: "core.manifest", withExtension: "json")!)
        let manifest = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        let buildId = manifest["buildId"] as! String
        let pages = (manifest["pages"] as? [[String: Any]] ?? []).compactMap { $0["name"] as? String }
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        let width = min(620, screen.width)
        let height = min(690, screen.height - 32)
        panel = LjumpPanel(contentRect: NSRect(x: screen.maxX + 4, y: screen.midY - height / 2, width: width, height: height),
                           styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.title = "Ljump"
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.isMovableByWindowBackground = false
        panel.hidesOnDeactivate = false
        panel.acceptsMouseMovedEvents = true
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        LjumpNative.shared.attach(panel)

        pageView = AnseronUIRenderView(frame: panel.contentView!.bounds, extensions: LjumpNative.shared.extensions(), createCore: { try NativeCore(bundleBuildId: buildId) })
        pageView.autoresizingMask = [.width, .height]
        pageView.onPageBackgroundColor = { [weak self] _ in self?.panel.backgroundColor = .clear }
        pageView.onFailure = { error in NSLog("Ljump: %@", String(describing: error)) }
        pageView.onDiagnostic = { code, message in NSLog("Ljump: %@ %@", code, message) }
        panel.contentView!.addSubview(pageView)
        pageView.load(page: pages.first ?? "home")
        installMenu()
        installEditingMenu()
        LjumpNative.shared.reveal()
    }

    private func installMenu() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem = item
        if let url = Bundle.main.url(forResource: "menubar", withExtension: "png", subdirectory: "assets/icons"),
           let image = NSImage(contentsOf: url) {
            image.size = NSSize(width: 18, height: 18)
            image.isTemplate = true
            image.accessibilityDescription = "Ljump"
            item.button?.image = image
        }
        item.button?.toolTip = "Ljump"
        let menu = NSMenu()
        for (title, action) in [
            ("显示工作组", #selector(showWorkgroups)),
            ("辅助功能权限…", #selector(requestAccessibility)),
            ("屏幕录制权限…", #selector(requestCapture)),
        ] {
            menu.addItem(withTitle: title, action: action, keyEquivalent: "").target = self
        }
        menu.addItem(.separator())
        menu.addItem(withTitle: "退出 Ljump", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.menu = menu
    }

    private func installEditingMenu() {
        let main = NSMenu()
        let item = NSMenuItem(title: "编辑", action: nil, keyEquivalent: "")
        let menu = NSMenu(title: "编辑")
        for (title, action, key) in [
            ("剪切", #selector(NSText.cut(_:)), "x"),
            ("复制", #selector(NSText.copy(_:)), "c"),
            ("粘贴", #selector(NSText.paste(_:)), "v"),
            ("全选", #selector(NSText.selectAll(_:)), "a"),
        ] {
            menu.addItem(withTitle: title, action: action, keyEquivalent: key)
        }
        item.submenu = menu
        main.addItem(item)
        NSApp.mainMenu = main
    }

    @objc private func showWorkgroups() { LjumpNative.shared.reveal() }
    @objc private func requestAccessibility() { LjumpNative.shared.openAccessibilitySettings() }
    @objc private func requestCapture() { _ = LjumpNative.shared.requestCapture() }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        LjumpNative.shared.reveal()
        return false
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationWillTerminate(_ notification: Notification) {
        LjumpNative.shared.shutdown()
        pageView?.destroy()
    }
}
