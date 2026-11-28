import AppKit
import UserNotifications

struct LjumpReminderWindow {
    let id: Int
    let pid: Int
    let launchedAt: TimeInterval
    let title: String
    let group: String
    var key: String { "\(pid):\(id)" }
}

struct LjumpReminder: Codable {
    let requestID: String
    let windowID: Int
    let pid: Int
    let launchedAt: TimeInterval
    let date: Date
    let title: String
    let group: String
    var key: String { "\(pid):\(windowID)" }
}

enum LjumpReminderError: LocalizedError {
    case invalidDate, invalidMinutes, pastDate, permissionDenied, windowClosed, cancelled
    var errorDescription: String? {
        switch self {
        case .invalidDate: return "请输入有效日期时间，例如 2026-12-01 14:30"
        case .invalidMinutes: return "请输入大于 0 的分钟数（最多 525600 分钟）"
        case .pastDate: return "提醒时间必须晚于现在"
        case .permissionDenied: return "请在系统设置 → 通知 → Ljump 中允许通知"
        case .windowClosed: return "窗口已关闭或已移出工作组"
        case .cancelled: return "此次提醒设置已取消"
        }
    }
}

@MainActor protocol LjumpReminderDelivery {
    func authorize() async throws -> Bool
    func schedule(_ reminder: LjumpReminder) async throws
    func cancel(_ identifiers: [String])
}

@MainActor final class LjumpSystemReminderDelivery: LjumpReminderDelivery {
    private var center: UNUserNotificationCenter { .current() }

    func authorize() async throws -> Bool {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return true
        case .notDetermined: return try await center.requestAuthorization(options: [.alert, .sound])
        default: return false
        }
    }

    func schedule(_ reminder: LjumpReminder) async throws {
        let content = UNMutableNotificationContent()
        content.title = "窗口提醒 · " + reminder.group
        content.body = reminder.title
        content.sound = .default
        content.userInfo = ["windowID": reminder.windowID, "pid": reminder.pid]
        let delay = reminder.date.timeIntervalSinceNow
        guard delay > 0 else { throw LjumpReminderError.pastDate }
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, delay), repeats: false)
        try await center.add(UNNotificationRequest(identifier: reminder.requestID, content: content, trigger: trigger))
    }

    func cancel(_ identifiers: [String]) {
        guard !identifiers.isEmpty else { return }
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
        center.removeDeliveredNotifications(withIdentifiers: identifiers)
    }
}

/// Owns only window identities and notification metadata, never AX elements or NSWindows.
@MainActor final class LjumpReminders: NSObject, UNUserNotificationCenterDelegate {
    static let shared = LjumpReminders(delivery: LjumpSystemReminderDelivery())
    private let delivery: LjumpReminderDelivery
    private let defaults: UserDefaults
    private let storageKey = "ljump.windowReminders.v1"
    private var windows: [String: LjumpReminderWindow] = [:]
    private var reminders: [String: LjumpReminder] = [:]
    private var operations: [String: UUID] = [:]
    var onChange: (() -> Void)?
    var onOpen: ((Int, Int) -> Void)?

    init(delivery: LjumpReminderDelivery, defaults: UserDefaults = .standard) {
        self.delivery = delivery
        self.defaults = defaults
        super.init()
        if let data = defaults.data(forKey: storageKey),
           let saved = try? JSONDecoder().decode([LjumpReminder].self, from: data) {
            for item in saved { reminders[item.key] = item }
        }
    }

    func install() { UNUserNotificationCenter.current().delegate = self }

    func reminder(windowID: Int, pid: Int) -> LjumpReminder? {
        reminders["\(pid):\(windowID)"]
    }

    static func date(mode: String, minutes: String, time: String, now: Date = Date()) throws -> Date {
        if mode == "countdown" {
            guard let value = Double(minutes), value.isFinite, value > 0, value <= 525_600 else {
                throw LjumpReminderError.invalidMinutes
            }
            return now.addingTimeInterval(value * 60)
        }
        guard mode == "at" else { throw LjumpReminderError.invalidDate }
        let formatter = dateFormatter()
        guard let date = formatter.date(from: time), formatter.string(from: date) == time else {
            throw LjumpReminderError.invalidDate
        }
        guard date > now else { throw LjumpReminderError.pastDate }
        return date
    }

    private static func dateFormatter() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        formatter.isLenient = false
        return formatter
    }

    func snapshot() -> [String: Any] {
        let formatter = Self.dateFormatter()
        return [
            "suggestedTime": formatter.string(from: Date().addingTimeInterval(3600)),
            "items": reminders.values.sorted { $0.date < $1.date }.map {
                ["id": $0.windowID, "pid": $0.pid, "time": formatter.string(from: $0.date),
                 "label": $0.date <= Date() ? "已提醒" : formatter.string(from: $0.date)] as [String: Any]
            }
        ]
    }

    func sync(_ tracked: [LjumpReminderWindow]) {
        windows = Dictionary(tracked.map { ($0.key, $0) }, uniquingKeysWith: { _, last in last })
        let stale = reminders.values.filter { windows[$0.key]?.launchedAt != $0.launchedAt }.map { $0.key }
        for key in stale { cancel(key) }
        for key in Array(operations.keys) where windows[key] == nil { operations.removeValue(forKey: key) }
    }

    func remove(windowID: Int, pid: Int) {
        let key = "\(pid):\(windowID)"
        windows.removeValue(forKey: key)
        cancel(key)
    }

    func cancel(_ key: String) {
        operations.removeValue(forKey: key)
        guard let existing = reminders.removeValue(forKey: key) else { return }
        delivery.cancel([existing.requestID])
        persist()
        onChange?()
    }

    func set(windowID: Int, pid: Int, date: Date) async throws {
        let key = "\(pid):\(windowID)"
        guard let window = windows[key] else { throw LjumpReminderError.windowClosed }
        guard date > Date() else { throw LjumpReminderError.pastDate }
        let token = UUID()
        operations[key] = token
        let reminder = LjumpReminder(requestID: "ljump.reminder." + token.uuidString,
                                     windowID: windowID, pid: pid, launchedAt: window.launchedAt,
                                     date: date, title: window.title, group: window.group)
        do {
            guard try await delivery.authorize() else { throw LjumpReminderError.permissionDenied }
            try validate(key: key, token: token, launchedAt: window.launchedAt)
            try await delivery.schedule(reminder)
            do { try validate(key: key, token: token, launchedAt: window.launchedAt) }
            catch { delivery.cancel([reminder.requestID]); throw error }
            if let old = reminders[key] { delivery.cancel([old.requestID]) }
            reminders[key] = reminder
            operations.removeValue(forKey: key)
            persist()
            onChange?()
        } catch {
            if operations[key] == token { operations.removeValue(forKey: key) }
            throw error
        }
    }

    private func validate(key: String, token: UUID, launchedAt: TimeInterval) throws {
        guard !Task.isCancelled, operations[key] == token else { throw LjumpReminderError.cancelled }
        guard windows[key]?.launchedAt == launchedAt else { throw LjumpReminderError.windowClosed }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(Array(reminders.values)) { defaults.set(data, forKey: storageKey) }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler complete: @escaping (UNNotificationPresentationOptions) -> Void) {
        complete([.banner, .list, .sound])
        Task { @MainActor [weak self] in self?.onChange?() }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler complete: @escaping () -> Void) {
        let values = response.notification.request.content.userInfo
        let id = values["windowID"] as? Int
        let pid = values["pid"] as? Int
        if response.actionIdentifier == UNNotificationDefaultActionIdentifier, let id, let pid {
            Task { @MainActor [weak self] in self?.onOpen?(id, pid) }
        }
        complete()
    }
}
