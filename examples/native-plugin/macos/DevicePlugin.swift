import Foundation

@MainActor enum AnseronMacDevicePlugin {
    static func createExtensions() -> MacOSPlatformExtensions {
        MacOSPlatformExtensions(modules:["example.device": { method, _, complete in
            guard method == "info" else { throw NativeExtensionError.unsupportedMethod(method) }
            complete(.success(["platform":"macOS", "version":ProcessInfo.processInfo.operatingSystemVersionString])); return nil
        }])
    }
}
