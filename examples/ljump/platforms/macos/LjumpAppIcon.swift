import AppKit

@MainActor final class LjumpAppIcon: MacOSNativeComponent {
    let view: NSView
    private let imageView: NSImageView
    private var bundleID: String?

    init() {
        imageView = NSImageView(frame: .zero)
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.imageAlignment = .alignCenter
        view = imageView
    }

    func setProps(_ props: [String: Any]) throws {
        guard let nextID = props["bundleId"] as? String else { throw NativeExtensionError.invalidArguments }
        guard nextID != bundleID else { return }
        bundleID = nextID
        if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: nextID) {
            imageView.image = NSWorkspace.shared.icon(forFile: url.path)
        } else {
            imageView.image = NSImage(named: NSImage.applicationIconName)
        }
    }

    func dispose() { imageView.image = nil; bundleID = nil }
}
