import AppKit

/// The AppKit counterpart of iOS's UIVisualEffectView backdrop. AppKit owns live
/// compositing; business content stays outside the effect's vibrant subtree.
@MainActor final class DesktopBackgroundBlurView: FlippedView {
    let effectView = NSVisualEffectView()
    let contentView = FlippedView()
    private(set) var blurRadius: Double = 0

    override init(frame: NSRect) {
        super.init(frame: frame)
        autoresizesSubviews = true
        clipsToBounds = false; contentView.clipsToBounds = false
        effectView.blendingMode = .withinWindow
        effectView.state = .active
        effectView.isEmphasized = false
        effectView.wantsLayer = true
        effectView.clipsToBounds = true; effectView.layer?.masksToBounds = true
        for child in [effectView, contentView] {
            child.frame = bounds; child.autoresizingMask = [.width, .height]
            addSubview(child)
        }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        // A transparent overlay has no background content of its own to sample.
        // Let AppKit sample the desktop behind it while ordinary windows blur their own content.
        effectView.blendingMode = window?.isOpaque == false ? .behindWindow : .withinWindow
    }
    func updateBlurRadius(_ radius: Double) {
        blurRadius = max(0, radius)
        // Like iOS's ultra-thin/regular material mapping, this is a semantic
        // strength selection. AppKit exposes no public numerical blur radius.
        // contentBackground/windowBackground are opaque and must not be used.
        effectView.material = radius <= 12 ? .menu : .popover
    }
    func updateCornerRadius(_ radius: CGFloat) {
        effectView.layer?.cornerRadius = radius
        effectView.clipsToBounds = true; effectView.layer?.masksToBounds = true
    }
}
