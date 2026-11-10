import AppKit

@MainActor func demoExtensions() -> MacOSPlatformExtensions {
    MacOSPlatformExtensions(modules:["device": { method,_,complete in
        guard method == "info" else { throw NativeExtensionError.unsupportedMethod(method) }
        complete(.success(["platform":"macOS","version":ProcessInfo.processInfo.operatingSystemVersionString])); return nil
    }],components:["DemoSwitch": { emit in DemoSwitch(emit:emit) }])
}
@MainActor private final class DemoSwitch: NSObject, MacOSNativeComponent {
    let control = NSSwitch()
    let emit:(String,Any)->Void
    var view:NSView { control }
    init(emit:@escaping (String,Any)->Void) {
        self.emit = emit; super.init(); control.target = self; control.action = #selector(changed)
        control.setAccessibilityIdentifier("demo-switch-control")
    }
    func setProps(_ props:[String:Any]) throws { control.state = props["value"] as? Bool == true ? .on : .off }
    @objc private func changed() { emit("change",["value":control.state == .on]) }
    func invoke(_ method:String,args:Any,completion:@escaping NativeCompletion) throws -> (() -> Void)? {
        guard method == "toggle" else { throw NativeExtensionError.unsupportedMethod(method) }
        control.state = control.state == .on ? .off : .on; completion(.success(["value":control.state == .on])); return nil
    }
    func dispose() { control.target = nil }
}
