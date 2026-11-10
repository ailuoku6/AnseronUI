import Foundation
import UserNotifications
#if os(iOS)
import UIKit
import BackgroundTasks
#else
import AppKit
#endif

private struct ApplicationServiceFailure: LocalizedError, CustomStringConvertible {
    var description: String { errorDescription ?? "IO_ERROR" }
    let errorDescription: String?
    init(_ message: String) { errorDescription = message }
}

/** Call from the application delegate (also when no page is mounted). Inbox survives process restarts. */
@MainActor public enum AnseronUINotifications {
    private static var registration: [UUID: NativeCompletion] = [:]
    private static let key = "anseronui.notificationInbox"
    public static func receive(_ payload: [String: Any], opened: Bool = false) {
        append(kind: opened ? "opened" : "received", payload: payload)
    }
    private static func append(kind: String, payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload) else { return }
        var items = events()
        items.append(["id": UUID().uuidString, "kind": kind, "payload": payload, "timestamp": Date().timeIntervalSince1970 * 1000])
        items = Array(items.suffix(100))
        while !items.isEmpty, let data = try? JSONSerialization.data(withJSONObject: items), data.count > 48000 { items.removeFirst() }
        if let data = try? JSONSerialization.data(withJSONObject: items) { UserDefaults.standard.set(data, forKey: key) }
    }
    static func events() -> [[String: Any]] { guard let data = UserDefaults.standard.data(forKey: key) else { return [] }; return (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? [] }
    static func acknowledge(_ ids: [String]) { let data = try? JSONSerialization.data(withJSONObject: events().filter { !ids.contains($0["id"] as? String ?? "") }); UserDefaults.standard.set(data, forKey: key) }
    public static func didRegister(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        append(kind: "token", payload: ["token": token, "provider": "apns"])
        let callbacks = registration; registration.removeAll(); callbacks.values.forEach { $0(.success(["token": token, "provider": "apns"])) }
    }
    public static func didFailToRegister(_ error: Error) { let callbacks = registration; registration.removeAll(); callbacks.values.forEach { $0(.failure(ApplicationServiceFailure("IO_ERROR: APNs " + error.localizedDescription))) } }
    static func register(_ completion: @escaping NativeCompletion) -> () -> Void {
        let id = UUID(); registration[id] = completion
        #if os(iOS)
        UIApplication.shared.registerForRemoteNotifications()
        #else
        NSApplication.shared.registerForRemoteNotifications()
        #endif
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { registration.removeValue(forKey: id)?(.failure(ApplicationServiceFailure("TIMEOUT: APNs registration"))) }
        return { registration.removeValue(forKey: id) }
    }
}

#if os(iOS)
/** Register identifiers at application launch, before BGTaskScheduler can deliver work. No page/JS context is required. */
@MainActor public enum AnseronUIBackground {
    public typealias Handler = (@escaping (Bool) -> Void) -> (() -> Void)?
    private static var handlers: [String: Handler] = [:]
    private static let key = "anseronui.backgroundInbox"
    @discardableResult public static func register(_ identifier: String, handler: @escaping Handler) -> Bool {
        guard handlers[identifier] == nil else { return false }
        let registered = BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: .main) { task in
            var finished = false
            var cancel: (() -> Void)?
            let finish: (Bool) -> Void = { success in
                let perform = {
                    guard !finished else { return }; finished = true
                    var items = events(); items.append(["id": UUID().uuidString, "identifier": identifier, "success": success, "timestamp": Date().timeIntervalSince1970 * 1000])
                    if let data = try? JSONSerialization.data(withJSONObject: Array(items.suffix(100))) { UserDefaults.standard.set(data, forKey: key) }
                    task.setTaskCompleted(success: success)
                }
                if Thread.isMainThread { perform() } else { DispatchQueue.main.async(execute: perform) }
            }
            task.expirationHandler = { DispatchQueue.main.async { finish(false); cancel?() } }
            cancel = handler(finish)
        }
        if registered { handlers[identifier] = handler }; return registered
    }
    static func contains(_ identifier: String) -> Bool { handlers[identifier] != nil }
    static func events() -> [[String: Any]] { guard let data = UserDefaults.standard.data(forKey: key) else { return [] }; return (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? [] }
    static func acknowledge(_ ids: [String]) { UserDefaults.standard.set(try? JSONSerialization.data(withJSONObject: events().filter { !ids.contains($0["id"] as? String ?? "") }), forKey: key) }
}
#endif

@MainActor final class ApplicationServices {
    func methods(_ module: String) -> [String] {
        if module == "notifications" { return ["register", "schedule", "cancel", "getEvents", "acknowledge"] }
        #if os(iOS)
        if module == "background" { return ["schedule", "pending", "cancel", "getEvents", "acknowledge"] }
        #endif
        return []
    }
    func invoke(_ module: String, _ method: String, _ args: [String: Any], _ complete: @escaping NativeCompletion) throws -> (() -> Void)? {
        func done(_ value: Any = NSNull()) { complete(.success(value)) }
        if module == "notifications" {
            let center = UNUserNotificationCenter.current()
            switch method {
            case "register": return AnseronUINotifications.register(complete)
            case "getEvents": done(AnseronUINotifications.events())
            case "acknowledge": guard let ids = args["ids"] as? [String] else { throw ApplicationServiceFailure("INVALID_ARGUMENT: ids") }; AnseronUINotifications.acknowledge(ids); done()
            case "cancel": guard let id = args["id"] as? String, !id.isEmpty else { throw ApplicationServiceFailure("INVALID_ARGUMENT: id") }; center.removePendingNotificationRequests(withIdentifiers: [id]); center.removeDeliveredNotifications(withIdentifiers: [id]); done()
            case "schedule":
                guard let id = args["id"] as? String, !id.isEmpty, let title = args["title"] as? String, let body = args["body"] as? String else { throw ApplicationServiceFailure("INVALID_ARGUMENT: notification") }
                let delay = (args["delaySeconds"] as? NSNumber)?.doubleValue ?? 1
                guard delay.isFinite, delay >= 1, delay <= 2592000 else { throw ApplicationServiceFailure("INVALID_ARGUMENT: delaySeconds (1..2592000)") }
                let content = UNMutableNotificationContent(); content.title = title; content.body = body; content.sound = .default; content.userInfo = ["id": id]
                center.getNotificationSettings { settings in
                    guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { complete(.failure(ApplicationServiceFailure("PERMISSION_DENIED: notifications"))); return }
                    center.add(UNNotificationRequest(identifier: id, content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false))) { error in complete(error.map { .failure(ApplicationServiceFailure("IO_ERROR: " + $0.localizedDescription)) } ?? .success(NSNull())) }
                }
            default: throw ApplicationServiceFailure("UNSUPPORTED")
            }
            return nil
        }
        #if os(iOS)
        if module == "background" {
            switch method {
            case "getEvents": done(AnseronUIBackground.events())
            case "acknowledge": guard let ids = args["ids"] as? [String] else { throw ApplicationServiceFailure("INVALID_ARGUMENT: ids") }; AnseronUIBackground.acknowledge(ids); done()
            case "pending": BGTaskScheduler.shared.getPendingTaskRequests { requests in complete(.success(requests.map { $0.identifier })) }
            case "cancel": guard let id = args["identifier"] as? String else { throw ApplicationServiceFailure("INVALID_ARGUMENT: identifier") }; BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: id); done()
            case "schedule":
                guard let id = args["identifier"] as? String, AnseronUIBackground.contains(id) else { throw ApplicationServiceFailure("INVALID_ARGUMENT: register background identifier at app launch") }
                let delay = (args["delaySeconds"] as? NSNumber)?.doubleValue ?? 900
                guard delay.isFinite, delay >= 0, delay <= 2592000 else { throw ApplicationServiceFailure("INVALID_ARGUMENT: delaySeconds") }
                let request = BGProcessingTaskRequest(identifier: id); request.earliestBeginDate = Date(timeIntervalSinceNow: delay); request.requiresNetworkConnectivity = args["requiresNetwork"] as? Bool ?? false
                do { try BGTaskScheduler.shared.submit(request); done() } catch { throw ApplicationServiceFailure("IO_ERROR: background " + error.localizedDescription) }
            default: throw ApplicationServiceFailure("UNSUPPORTED")
            }
            return nil
        }
        #endif
        throw ApplicationServiceFailure("UNSUPPORTED")
    }
}
