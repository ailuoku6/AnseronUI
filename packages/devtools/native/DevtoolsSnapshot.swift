import Foundation

#if ANSERONUI_DEVTOOLS

/// Platform-neutral native snapshot encoder. The caller owns transport and lifecycle.
public final class AnseronUIDevtoolsReporter {
    public typealias Sink = (Data) -> Void
    public let pagerId: String
    public let platform: String
    private let sink: Sink
    private var sequence: UInt64 = 0

    public init(pagerId: String, platform: String, sink: @escaping Sink) {
        precondition(!pagerId.isEmpty && !platform.isEmpty)
        self.pagerId = pagerId; self.platform = platform; self.sink = sink
    }

    public func snapshot(page: String, stats: [String: Double] = [:], diagnostics: [[String: String]] = [], nodes: [[String: Any]] = [], native: [[String: Any]] = [], destroyed: Bool = false) {
        sequence += 1
        var value: [String: Any] = [
            "protocol": 1, "type": "snapshot", "pagerId": pagerId, "page": page,
            "platform": platform, "ts": Int(Date().timeIntervalSince1970 * 1000),
            "seq": sequence, "stats": stats, "diagnostics": diagnostics,
        ]
        if !nodes.isEmpty { value["nodes"] = nodes }
        if !native.isEmpty { value["native"] = native }
        if destroyed { value["destroyed"] = true }
        guard JSONSerialization.isValidJSONObject(value), let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        sink(data)
    }

    public func heartbeat(page: String) {
        sequence += 1
        let value: [String: Any] = [
            "protocol": 1, "type": "heartbeat", "pagerId": pagerId,
            "page": page, "platform": platform,
            "ts": Int(Date().timeIntervalSince1970 * 1000), "seq": sequence,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        sink(data)
    }
}
#endif
