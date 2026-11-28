import AppKit

/// Controlled local date/time picker. No timers, observers or retained event targets.
@MainActor final class MacOSDateTimePicker: NSObject, MacOSNativeComponent {
    let calendarPicker = NSDatePicker()
    let timePicker = NSDatePicker()
    private let container = NSView()
    private var emit: ((String, Any) -> Void)?
    private let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        formatter.isLenient = false
        return formatter
    }()
    private var selected = Date()
    var view: NSView { container }

    init(emit: @escaping (String, Any) -> Void) {
        self.emit = emit
        super.init()
        calendarPicker.datePickerStyle = .clockAndCalendar
        calendarPicker.datePickerElements = .yearMonthDay
        calendarPicker.isBordered = false
        calendarPicker.isBezeled = false
        calendarPicker.drawsBackground = false
        calendarPicker.setAccessibilityLabel("提醒日期")
        timePicker.datePickerStyle = .textFieldAndStepper
        timePicker.datePickerElements = .hourMinute
        timePicker.controlSize = .regular
        timePicker.setAccessibilityLabel("提醒时间")
        let timeLabel = NSTextField(labelWithString: "时间")
        timeLabel.font = .systemFont(ofSize: 13)
        timeLabel.textColor = .secondaryLabelColor
        for picker in [calendarPicker, timePicker] {
            picker.locale = .current
            picker.timeZone = .current
            picker.calendar = Calendar(identifier: .gregorian)
            picker.target = self
            picker.action = #selector(changed(_:))
        }
        for child in [calendarPicker, timePicker, timeLabel] {
            child.translatesAutoresizingMaskIntoConstraints = false
            container.addSubview(child)
        }
        NSLayoutConstraint.activate([
            calendarPicker.topAnchor.constraint(equalTo: container.topAnchor),
            calendarPicker.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            timeLabel.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 12),
            timeLabel.centerYAnchor.constraint(equalTo: timePicker.centerYAnchor),
            timePicker.topAnchor.constraint(equalTo: calendarPicker.bottomAnchor, constant: 12),
            timePicker.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -12),
        ])
        updateControls()
    }

    func setProps(_ props: [String: Any]) throws {
        if let value = props["value"] as? String {
            guard let date = formatter.date(from: value), formatter.string(from: date) == value else {
                throw NativeExtensionError.invalidArguments
            }
            if date != selected { selected = date; updateControls() }
        }
        let enabled = !(props["disabled"] as? Bool ?? false)
        calendarPicker.isEnabled = enabled
        timePicker.isEnabled = enabled
    }

    private func updateControls() {
        calendarPicker.dateValue = selected
        timePicker.dateValue = selected
    }

    @objc private func changed(_ sender: NSDatePicker) {
        guard sender.isEnabled, emit != nil else { return }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let day = calendar.dateComponents([.year, .month, .day], from: sender === calendarPicker ? sender.dateValue : selected)
        let clock = calendar.dateComponents([.hour, .minute], from: sender === timePicker ? sender.dateValue : selected)
        var parts = day
        parts.hour = clock.hour; parts.minute = clock.minute; parts.second = 0
        guard let date = calendar.date(from: parts) else { return }
        selected = date
        updateControls()
        emit?("change", formatter.string(from: date))
    }

    func dispose() {
        emit = nil
        for picker in [calendarPicker, timePicker] {
            picker.target = nil; picker.action = nil
        }
    }
}
