import AppKit

@MainActor enum DateTimePickerRegression {
    static func run() throws {
        var events: [String] = []
        var picker: MacOSDateTimePicker? = MacOSDateTimePicker { name, value in
            Integration.check(name == "change", "picker event name")
            events.append(value as! String)
        }
        weak var weakPicker = picker
        let control = picker!.timePicker
        let host = NSView(frame: NSRect(x: 0, y: 0, width: 310, height: 184))
        picker!.view.frame = host.bounds
        host.addSubview(picker!.view)
        for appearance in [NSAppearance.Name.aqua, .darkAqua] {
            host.appearance = NSAppearance(named: appearance)
            host.layoutSubtreeIfNeeded()
            Integration.check(picker!.calendarPicker.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == appearance,
                              "calendar inherits light and dark appearance")
            Integration.check(control.frame.maxY <= picker!.view.bounds.height && control.frame.minY >= 0,
                              "time row fits compact picker height")
            Integration.check(!picker!.calendarPicker.drawsBackground && !picker!.calendarPicker.isBordered,
                              "calendar does not impose a light surface or extra border")
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        try picker!.setProps(["value": "2026-12-15 14:35"])
        Integration.check(events.isEmpty, "controlled updates do not emit")
        Integration.check(formatter.string(from: control.dateValue) == "2026-12-15 14:35", "restores saved date and time")
        picker!.calendarPicker.dateValue = formatter.date(from: "2026-12-22 00:00")!
        picker!.calendarPicker.sendAction(picker!.calendarPicker.action, to: picker!.calendarPicker.target)
        Integration.check(events.last == "2026-12-22 14:35", "date selection preserves time")
        control.dateValue = formatter.date(from: "2001-01-01 09:20")!
        control.sendAction(control.action, to: control.target)
        Integration.check(events.last == "2026-12-22 09:20", "time selection preserves date")
        try picker!.setProps(["value": "2027-01-05 16:45", "disabled": true])
        let count = events.count
        control.sendAction(control.action, to: control.target)
        Integration.check(events.count == count && !picker!.calendarPicker.isEnabled, "disabled controls do not emit")
        do {
            try picker!.setProps(["value": "2026-02-30 12:00"])
            Integration.check(false, "invalid civil date rejected")
        } catch NativeExtensionError.invalidArguments { }
        picker!.dispose()
        picker!.view.removeFromSuperview()
        Integration.check(control.target == nil && control.action == nil, "dispose detaches targets and callbacks")
        picker = nil
        Integration.check(weakPicker == nil, "picker deallocates while control remains referenced")
        let extensions = MacOSPlatformExtensions()
        Integration.check(extensions.components["AnseronUI.DateTimePicker"] != nil, "built-in picker registered")
        print("PASS: macOS date/time picker restoration, date/time merging, controlled updates, disabled, validation and disposal")
    }
}
