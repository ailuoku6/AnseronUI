import AppKit

@MainActor final class DesktopImageView: NSImageView {
    var resizeMode = "contain" { didSet { needsDisplay = true } }
    override var isFlipped: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        guard let image, image.size.width > 0, image.size.height > 0 else { return }
        var destination = bounds
        if resizeMode != "stretch" {
            let x = bounds.width / image.size.width, y = bounds.height / image.size.height
            let scale = resizeMode == "cover" ? max(x, y) : min(x, y)
            let size = NSSize(width: image.size.width * scale, height: image.size.height * scale)
            destination = NSRect(x: bounds.midX - size.width / 2, y: bounds.midY - size.height / 2, width: size.width, height: size.height)
        }
        NSGraphicsContext.saveGraphicsState()
        bounds.clip()
        image.draw(in: destination, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
        NSGraphicsContext.restoreGraphicsState()
    }
}
