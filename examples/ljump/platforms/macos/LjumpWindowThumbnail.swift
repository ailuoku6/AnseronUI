import AppKit
import ScreenCaptureKit

@MainActor private func captureWindow(_ id: CGWindowID) async -> NSImage? {
    guard !Task.isCancelled, CGPreflightScreenCaptureAccess() else { return nil }
    let content = try? await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
    guard !Task.isCancelled, let window = content?.windows.first(where: { $0.windowID == id }) else { return nil }
    let configuration = SCStreamConfiguration()
    let scale = min(1, 500 / max(1, window.frame.width, window.frame.height))
    configuration.width = max(2, Int(window.frame.width * scale))
    configuration.height = max(2, Int(window.frame.height * scale))
    configuration.showsCursor = false
    configuration.ignoreShadowsSingleWindow = true
    let filter = SCContentFilter(desktopIndependentWindow: window)
    guard let image = try? await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration),
          !Task.isCancelled else { return nil }
    return NSImage(cgImage: image, size: .zero)
}

@MainActor final class LjumpWindowThumbnail: MacOSNativeComponent {
    let view: NSView
    private let imageView = NSImageView()
    private var windowID: CGWindowID?
    private var captureRevision: Int?
    private var capture: Task<Void, Never>?

    init() {
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.imageAlignment = .alignCenter
        view = imageView
    }

    func setProps(_ props: [String: Any]) throws {
        guard let rawID = props["windowId"] as? NSNumber else { throw NativeExtensionError.invalidArguments }
        let id = rawID.uint32Value
        let revision = props["revision"] as? Int ?? 0
        guard id != windowID || revision != captureRevision else { return }
        capture?.cancel()
        if id != windowID { imageView.image = nil }
        windowID = id
        captureRevision = revision
        capture = Task { [weak self] in
            let image = await captureWindow(id)
            guard !Task.isCancelled, let self else { return }
            if let image { self.imageView.image = image }
            self.capture = nil
        }
    }

    func dispose() {
        capture?.cancel()
        capture = nil
        imageView.image = nil
        windowID = nil
        captureRevision = nil
    }
}

@MainActor final class LjumpDragPreview {
    private let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 150, height: 97),
                                styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    private let imageView = NSImageView()
    private var capture: Task<Void, Never>?

    init(windowID: CGWindowID, pid: pid_t, title: String) {
        panel.isReleasedWhenClosed = false
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.level = .popUpMenu
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        let content = NSView(frame: panel.contentView!.bounds)
        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor(calibratedRed: 0.13, green: 0.14, blue: 0.17, alpha: 0.96).cgColor
        content.layer?.cornerRadius = 12
        content.layer?.masksToBounds = true
        panel.contentView = content
        imageView.frame = NSRect(x: 5, y: 21, width: 140, height: 72)
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.image = NSRunningApplication(processIdentifier: pid)?.icon
        content.addSubview(imageView)
        let label = NSTextField(labelWithString: title)
        label.font = .systemFont(ofSize: 10, weight: .medium)
        label.textColor = .white
        label.lineBreakMode = .byTruncatingTail
        label.frame = NSRect(x: 8, y: 4, width: 134, height: 15)
        content.addSubview(label)
        capture = Task { [weak self] in
            let image = await captureWindow(windowID)
            guard !Task.isCancelled, let self else { return }
            if let image { self.imageView.image = image }
            self.capture = nil
        }
    }

    func move(to point: NSPoint, on screen: NSScreen) {
        let y = max(screen.visibleFrame.minY, min(point.y - 48, screen.visibleFrame.maxY - panel.frame.height))
        panel.setFrameOrigin(NSPoint(x: max(screen.visibleFrame.minX, point.x - panel.frame.width - 16), y: y))
        if !panel.isVisible { panel.orderFrontRegardless() }
    }

    func dispose() {
        capture?.cancel()
        capture = nil
        imageView.image = nil
        panel.orderOut(nil)
        panel.close()
    }
}
