import Foundation

@MainActor private final class TestReminderDelivery: LjumpReminderDelivery {
    var allowed = true
    var scheduled: [String: LjumpReminder] = [:]
    var cancelled: [String] = []
    var afterSchedule: (() -> Void)?
    var authorizationCount = 0
    func authorize() async throws -> Bool { authorizationCount += 1; return allowed }
    func schedule(_ reminder: LjumpReminder) async throws {
        scheduled[reminder.requestID] = reminder
        afterSchedule?()
    }
    func cancel(_ identifiers: [String]) {
        cancelled.append(contentsOf: identifiers)
        identifiers.forEach { scheduled.removeValue(forKey: $0) }
    }
}

@MainActor func testReminders() async throws {
    let suite = "ljump.reminders.test." + UUID().uuidString
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let delivery = TestReminderDelivery()
    let store = LjumpReminders(delivery: delivery, defaults: defaults)
    let window = LjumpReminderWindow(id: 42, pid: 100, launchedAt: 123, title: "测试窗口", group: "测试工作组")
    store.sync([window])
    precondition(delivery.scheduled.isEmpty && delivery.authorizationCount == 0, "Unset reminders must never notify or ask permission")

    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let countdown = try LjumpReminders.date(mode: "countdown", minutes: "2.5", time: "", now: now)
    precondition(countdown.timeIntervalSince(now) == 150)
    for input in ["0", "-5", "NaN", "hello", "525601"] {
        do {
            _ = try LjumpReminders.date(mode: "countdown", minutes: input, time: "", now: now)
            preconditionFailure("Accepted invalid minutes: \(input)")
        } catch LjumpReminderError.invalidMinutes {}
    }
    for input in ["2026-02-30 12:00", "2026-13-01 12:00", "garbage"] {
        do {
            _ = try LjumpReminders.date(mode: "at", minutes: "", time: input, now: .distantPast)
            preconditionFailure("Accepted invalid date: \(input)")
        } catch LjumpReminderError.invalidDate {}
    }
    let exact = try LjumpReminders.date(mode: "at", minutes: "", time: "2029-12-01 14:30", now: now)
    precondition(exact > now)
    do {
        _ = try LjumpReminders.date(mode: "at", minutes: "", time: "2000-01-01 00:00", now: now)
        preconditionFailure("Accepted past date")
    } catch LjumpReminderError.pastDate {}

    let deadline = Date().addingTimeInterval(600)
    try await store.set(windowID: window.id, pid: window.pid, date: deadline)
    let first = delivery.scheduled.values.first!
    precondition(delivery.scheduled.count == 1 && first.date == deadline)
    store.sync([LjumpReminderWindow(id: window.id, pid: window.pid, launchedAt: window.launchedAt, title: window.title, group: "移动后的工作组")])
    precondition(store.reminder(windowID: window.id, pid: window.pid)?.date == deadline, "Moving between groups must preserve reminder deadline")
    precondition(delivery.scheduled[first.requestID] != nil, "Moving between groups must not cancel notification")
    try await store.set(windowID: window.id, pid: window.pid, date: deadline.addingTimeInterval(60))
    let second = delivery.scheduled.values.first!
    precondition(delivery.scheduled.count == 1 && first.requestID != second.requestID)
    precondition(delivery.cancelled.contains(first.requestID), "Editing must replace old notification")

    delivery.allowed = false
    do {
        try await store.set(windowID: window.id, pid: window.pid, date: deadline)
        preconditionFailure("Saved without notification permission")
    } catch LjumpReminderError.permissionDenied {}
    precondition(delivery.scheduled[second.requestID] != nil, "Failed edit must preserve existing reminder")
    delivery.allowed = true

    let restored = LjumpReminders(delivery: delivery, defaults: defaults)
    restored.sync([window])
    precondition((restored.snapshot()["items"] as? [[String: Any]])?.count == 1, "Reminder must persist")
    restored.sync([])
    precondition(delivery.scheduled.isEmpty, "Deleting group/window must cancel notification")

    try await store.set(windowID: window.id, pid: window.pid, date: deadline)
    store.remove(windowID: window.id, pid: window.pid)
    precondition(delivery.scheduled.isEmpty, "Closing window must cancel")

    store.sync([window])
    delivery.afterSchedule = { store.remove(windowID: window.id, pid: window.pid) }
    do {
        try await store.set(windowID: window.id, pid: window.pid, date: deadline)
        preconditionFailure("Saved reminder for window closed during scheduling")
    } catch LjumpReminderError.cancelled {}
    precondition(delivery.scheduled.isEmpty, "Racing close must remove in-flight notification")
    delivery.afterSchedule = nil

    store.sync([window])
    try await store.set(windowID: window.id, pid: window.pid, date: deadline)
    store.sync([LjumpReminderWindow(id: window.id, pid: window.pid, launchedAt: 999, title: "新进程", group: window.group)])
    precondition(delivery.scheduled.isEmpty, "Reused process/window IDs must not inherit old reminders")
    print("PASS: countdown, exact date, default-off, validation, permission denial, replacement, persistence, cancellation and close/schedule race")
}
