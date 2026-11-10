import AppKit
import UserNotifications

@main @MainActor final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, UNUserNotificationCenterDelegate {
    private var window: NSWindow!
    private var pageView: AnseronUIRenderView!
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { application.run() }
    }
    func application(_ application: NSApplication, open urls: [URL]) { urls.forEach { AnseronUILinks.receive($0) } }
    func application(_ application: NSApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) { AnseronUINotifications.didRegister(deviceToken: token) }
    func application(_ application: NSApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) { AnseronUINotifications.didFailToRegister(error) }
    func application(_ application: NSApplication, didReceiveRemoteNotification userInfo: [String: Any]) { AnseronUINotifications.receive(userInfo) }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler complete: @escaping (UNNotificationPresentationOptions) -> Void) {
        DispatchQueue.main.async {
            AnseronUINotifications.receive(Dictionary(uniqueKeysWithValues: notification.request.content.userInfo.map { (String(describing: $0.key), $0.value) })); complete([.banner, .sound])
        }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler complete: @escaping () -> Void) {
        DispatchQueue.main.async {
            AnseronUINotifications.receive(Dictionary(uniqueKeysWithValues: response.notification.request.content.userInfo.map { (String(describing: $0.key), $0.value) }), opened: true); complete()
        }
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        UNUserNotificationCenter.current().delegate = self
        let data = try! Data(contentsOf:Bundle.main.url(forResource:"core.manifest",withExtension:"json")!)
        let manifest = try! JSONSerialization.jsonObject(with:data) as! [String:Any]
        let buildId = manifest["buildId"] as! String
        let pages = (manifest["pages"] as? [[String:Any]] ?? []).compactMap { $0["name"] as? String }
        window = NSWindow(contentRect:NSRect(x:0,y:0,width:720,height:640),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title = "__APP_NAME__"; window.minSize = NSSize(width:320,height:240); window.delegate = self
        pageView = AnseronUIRenderView(frame:window.contentView!.bounds,extensions:AnseronUIPlugins.makeExtensions(),createCore:{ try NativeCore(bundleBuildId:buildId) })
        pageView.autoresizingMask = [.width,.height]
        pageView.onPageBackgroundColor = { [weak self] color in self?.window.backgroundColor = color }
        pageView.onFailure = { error in NSLog("AnseronUI: %@",String(describing:error)) }
        pageView.onDiagnostic = { code,message in NSLog("AnseronUI: %@ %@",code,message) }
        window.contentView!.addSubview(pageView)
        makeMenu(pages)
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
        pageView.load(page:pages.first ?? "home")
    }
    private func makeMenu(_ pages:[String]) {
        let menu = NSMenu()
        let app = NSMenuItem(); app.submenu = NSMenu()
        app.submenu!.addItem(withTitle:"Quit __APP_NAME__",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        menu.addItem(app)
        let edit = NSMenuItem(title:"Edit",action:nil,keyEquivalent:""); edit.submenu = NSMenu(title:"Edit")
        for (name,selector,key) in [("Undo","undo:","z"),("Cut","cut:","x"),("Copy","copy:","c"),("Paste","paste:","v"),("Select All","selectAll:","a")] { edit.submenu!.addItem(withTitle:name,action:Selector(selector),keyEquivalent:key) }
        menu.addItem(edit)
        let navigation = NSMenuItem(title:"Navigate",action:nil,keyEquivalent:""); navigation.submenu = NSMenu(title:"Navigate")
        let back = navigation.submenu!.addItem(withTitle:"Back",action:#selector(goBack),keyEquivalent:"["); back.target = self
        for page in pages { let item = navigation.submenu!.addItem(withTitle:page,action:#selector(selectPage(_:)),keyEquivalent:""); item.target = self; item.representedObject = page }
        menu.addItem(navigation); NSApp.mainMenu = menu
    }
    @objc private func selectPage(_ item:NSMenuItem) { if let page = item.representedObject as? String { pageView.load(page:page) } }
    @objc private func goBack() { if !pageView.handleBackPress() { _ = pageView.pop() } }
    func windowWillClose(_ notification:Notification) { pageView.destroy() }
    func applicationWillTerminate(_ notification:Notification) { pageView?.destroy() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication) -> Bool { true }
}
