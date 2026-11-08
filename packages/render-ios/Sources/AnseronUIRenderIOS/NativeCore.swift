import Foundation
import AnseronUICoreC

/// AOT Core transport. Construct and call it only on the host's owner thread.
public final class NativeCore: IOSCoreTransport {
    public let bundleBuildId: String
    public let runtimeEpoch: UInt32 = 1
    private var context: OpaquePointer?

    public init(bundleBuildId: String = "anseronui-demo") throws {
        self.bundleBuildId = bundleBuildId
        context = anseronui_open()
        guard let context else { throw NativeCoreError.message("Unable to create native Core") }
        let message = String(cString: anseronui_error(context))
        if !message.isEmpty { throw NativeCoreError.message(message) }
    }
    private func check(_ success: Int32) throws {
        if success == 0 { throw NativeCoreError.message(String(cString: anseronui_error(context))) }
    }
    public func post(_ input: Data) throws {
        try input.withUnsafeBytes { bytes in
            try check(anseronui_post(context, bytes.bindMemory(to: UInt8.self).baseAddress, bytes.count))
        }
    }
    public func step(maxMessages: Int) throws -> [Data] {
        precondition(maxMessages > 0)
        var bytes: UnsafeMutablePointer<UInt8>?
        var count = 0
        try check(anseronui_step(context, &bytes, &count))
        defer { anseronui_free(bytes) }
        let data = Data(bytes: bytes!, count: count)
        guard let envelopes = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { throw HostError.invalidOutput }
        return try envelopes.map { try JSONSerialization.data(withJSONObject: $0) }
    }
    public func hasPendingWork() -> Bool { anseronui_pending(context) != 0 }
    public func dispose() {
        guard let context else { return }
        if anseronui_close(context) == 0 {
            NSLog("AnseronUI shutdown: %@", String(cString: anseronui_error(context)))
        }
        self.context = nil
    }
}
public enum NativeCoreError: Error { case message(String) }
