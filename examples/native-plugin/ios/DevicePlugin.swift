import UIKit

// Compiled into the host target alongside the renderer; no renderer module import is needed.
@MainActor enum AnseronDevicePlugin {
    static func createExtensions() -> IOSPlatformExtensions {
        IOSPlatformExtensions(modules: [
            "example.device": { method, _, complete in
                guard method == "info" else { throw NativeExtensionError.unsupportedMethod(method) }
                complete(.success(["platform": "iOS", "version": UIDevice.current.systemVersion]))
                return nil
            }
        ])
    }
}
