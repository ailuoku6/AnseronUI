import Foundation
import UIKit
import AVFoundation

public struct RenderFrame: Codable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
}

public struct RenderProps: Codable {
    public let text: String?
    public var spans: String?
    public let inputRevision: UInt32?
    public let value: String?
    public let placeholder: String?
    public let disabled: Bool?
    public let dmBackgroundColor: String?
    public let dmColor: String?
    public let dmBorderColor: String?
    public let dmPlaceholderTextColor: String?
    public var shadowColor: String?
    public let dmShadowColor: String?
    public let shadowOpacity: Double?
    public let shadowRadius: Double?
    public let shadowOffsetX: Double?
    public let shadowOffsetY: Double?
    public let glassEffect: Bool?
    public let glassEffectStyle: String?
    public let glassEffectTintColor: String?
    public let glassEffectInteractive: Bool?
    public let glassEffectContainer: Bool?
    public let glassEffectSpacing: Double?
    public var backgroundColor: String?
    public var color: String?
    public let animation: String?
    public let translateX: Double?
    public let translateY: Double?
    public let scaleX: Double?
    public let scaleY: Double?
    public let rotate: Double?
    public var opacity: Double?
    public var backgroundBlurRadius: Double?
    public let lineHeight: Double?
    public let fontSize: Double?
    public let fontWeight: String?
    public let fontStyle: String?
    public let textAlign: String?
    public var borderColor: String?
    public let borderWidth: Double?
    public let borderRadius: Double?
    public let overflow: String?
    public let visibility: String?
    public let numberOfLines: Int?
    public let ellipsizeMode: String?
    public let editable: Bool?
    public let secureTextEntry: Bool?
    public let maxLength: Int?
    public let keyboardType: String?
    public let returnKeyType: String?
    public let autoCapitalize: String?
    public let autoCorrect: Bool?
    public var placeholderTextColor: String?
    public let accessibilityLabel: String?
    public let accessibilityRole: String?
    public let accessibilityHint: String?
    public let accessibilityValue: String?
    public let accessible: Bool?
    public let accessibilityHidden: Bool?
    public let accessibilityChecked: Bool?
    public let accessibilitySelected: Bool?
    public let accessibilityClickable: Bool?
    public let accessibilityLongClickable: Bool?
    public let textDecorationLine: String?
    public let scrollEnabled: Bool?
    public let scrollAnchorOffset: Double?
    public let showsVerticalScrollIndicator: Bool?
    public let testID: String?
    public var src: String?
    public let dmSrc: String?
    public let placeholderSrc: String?
    public let resizeMode: String?
    public let controls: Bool?
    public let autoplay: Bool?
    public let loop: Bool?
    public let muted: Bool?
    public let rate: Double?
    public let playControl: String?
    public let touchAction: String?
    public let nativeProps: String?

    func glassFallback(_ dark: Bool, nativeGlass: Bool) -> RenderProps {
        var p = self
        if !nativeGlass, glassEffect == true, glassEffectContainer != true {
            p.backgroundColor = backgroundColor ?? (dark ? "#20242bcc" : "#f2f5facc")
            p.opacity = opacity ?? 0.88
            p.backgroundBlurRadius = backgroundBlurRadius ?? (glassEffectStyle == "clear" ? 12 : 20)
        }
        return p
    }

    func themed(_ dark: Bool) -> RenderProps {
        guard dark else { return self }
        var p = self
        p.src = dmSrc ?? src
        p.backgroundColor = dmBackgroundColor ?? backgroundColor
        p.color = dmColor ?? color
        p.borderColor = dmBorderColor ?? borderColor
        p.placeholderTextColor = dmPlaceholderTextColor ?? placeholderTextColor
        p.shadowColor = dmShadowColor ?? shadowColor
        if let spans, let data = spans.data(using: .utf8), var items = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] {
            for index in items.indices { if let color = items[index]["dmColor"] as? String { items[index]["color"] = color } }
            if let data = try? JSONSerialization.data(withJSONObject: items) { p.spans = String(data: data, encoding: .utf8) }
        }
        return p
    }
}

extension RenderProps {
    func patched(_ set: RenderProps, _ unset: [String]) throws -> RenderProps {
        guard (set.value != nil) == (set.inputRevision != nil), unset.contains("value") == unset.contains("inputRevision"), Set(unset).count == unset.count else { throw RenderError.invalidCommand }
        let encoder = JSONEncoder()
        var values = try JSONSerialization.jsonObject(with: encoder.encode(self)) as! [String: Any]
        let additions = try JSONSerialization.jsonObject(with: encoder.encode(set)) as! [String: Any]
        for key in unset { guard additions[key] == nil else { throw RenderError.invalidCommand }; values.removeValue(forKey: key) }
        for (key, value) in additions { values[key] = value }
        return try JSONDecoder().decode(RenderProps.self, from: JSONSerialization.data(withJSONObject: values))
    }
    static func empty() throws -> RenderProps { try JSONDecoder().decode(RenderProps.self, from: Data("{}".utf8)) }
}

public struct RenderCommand: Codable {
    public let type: String
    public let nodeId: UInt32
    public let kind: String?
    public let nativeName: String?
    public let parentId: UInt32?
    public let index: Int?
    public let props: RenderProps?
    public let set: RenderProps?
    public let unset: [String]?
    var changedFields: Set<String> {
        let fields = set.flatMap { try? JSONSerialization.jsonObject(with: JSONEncoder().encode($0)) as? [String: Any] } ?? [:]
        return Set(fields.keys).union(unset ?? [])
    }
    public let frame: RenderFrame?
    public let event: String?
    public let enabled: Bool?
}

public struct RenderCommit: Decodable {
    public let type: String
    public let revision: UInt32
    public let commands: [RenderCommand]
}

public struct RendererEvent {
    public let type: String
    public let nodeId: UInt32
    public let revision: UInt32
    public let value: String?
    public let inputRevision: UInt32?
    public let event: String?
    public let x: Double?
    public let y: Double?
    public let contentWidth: Double?
    public let contentHeight: Double?
    public let source: String?
    public let state: String?
    public let duration: Double?
    public let errorCode: Double?
    public let pageX: Double?
    public let pageY: Double?
    public let pointerId: UInt32?
    public let touches: [[String: Double]]?
    public let targetId: UInt32?

    public init(type: String, nodeId: UInt32, revision: UInt32, value: String? = nil, inputRevision: UInt32? = nil,
                event: String? = nil, x: Double? = nil, y: Double? = nil, contentWidth: Double? = nil, contentHeight: Double? = nil,
                source: String? = nil, state: String? = nil, duration: Double? = nil, errorCode: Double? = nil,
                pageX: Double? = nil, pageY: Double? = nil, pointerId: UInt32? = nil, touches: [[String: Double]]? = nil, targetId: UInt32? = nil) {
        self.type = type; self.nodeId = nodeId; self.revision = revision
        self.value = value; self.inputRevision = inputRevision; self.event = event
        self.x = x; self.y = y; self.contentWidth = contentWidth; self.contentHeight = contentHeight
        self.source = source; self.state = state; self.duration = duration; self.errorCode = errorCode
        self.pageX = pageX; self.pageY = pageY; self.pointerId = pointerId; self.touches = touches
        self.targetId = targetId
    }
}

public enum RenderError: Error {
    case wrongThread, invalidRevision, invalidCommit, invalidCommand
}

final class TSPrimitiveView: UIVisualEffectView {
    let nodeContent = UIView()
    private var fallbackBlurRadius: Double = 0
    private var backgroundBlurView: UIVisualEffectView?
    var activate: (() -> Bool)?
    override func accessibilityActivate() -> Bool { activate?() ?? false }
    override init(effect:UIVisualEffect?) {
        super.init(effect:effect)
        contentView.addSubview(nodeContent)
    }
    required init?(coder:NSCoder) { fatalError("init(coder:) is unavailable") }

    func setBackgroundBlur(radius: Double) {
        guard radius > 0 else {
            backgroundBlurView?.effect = nil
            backgroundBlurView?.removeFromSuperview()
            backgroundBlurView = nil; fallbackBlurRadius = 0
            return
        }
        let blur: UIVisualEffectView
        if let existing = backgroundBlurView { blur = existing }
        else {
            blur = UIVisualEffectView(effect:nil)
            blur.isUserInteractionEnabled = false
            blur.clipsToBounds = true
            contentView.insertSubview(blur, belowSubview:nodeContent)
            backgroundBlurView = blur
        }
        if blur.effect == nil || fallbackBlurRadius != radius {
            blur.effect = UIBlurEffect(style:radius <= 12 ? .systemUltraThinMaterial : .systemMaterial)
        }
        fallbackBlurRadius = radius
        updateBackgroundBlurGeometry()
    }

    // Round only the background, preserving content overflow and outer shadows.
    // The animation driver calls this for each presented frame as well as layout.
    func updateBackgroundBlurGeometry() {
        nodeContent.frame = bounds
        backgroundBlurView?.frame = bounds
        backgroundBlurView?.layer.cornerRadius = layer.cornerRadius
        backgroundBlurView?.layer.cornerCurve = layer.cornerCurve
    }
    override func layoutSubviews() {
        super.layoutSubviews()
        updateBackgroundBlurGeometry()
    }
}

private final class TSAccessibleLabel: UILabel {
    var activate: (() -> Bool)?
    override func accessibilityActivate() -> Bool { activate?() ?? false }
}
private final class TSAccessibleImage: UIImageView {
    var activate: (() -> Bool)?
    override func accessibilityActivate() -> Bool { activate?() ?? false }
}
private final class NodeRecord {
    var anchorOffset: Double = 0
    var declaredProps: RenderProps?
    lazy var defaultAccessibilityTraits = view.accessibilityTraits
    lazy var defaultAccessibilityElement = view.isAccessibilityElement
    var pageBackgroundColor = UIColor.clear
    let view: UIView
    let content: UIView
    let kind: String
    lazy var animation = AnseronUINodeAnimation(view: view)
    var events = Set<String>()
    var inputRevision: UInt32 = 0
    var lastInputValue = ""
    var maxLength: Int?
    var applyingValue = false
    var imageGeneration = UUID()
    var imageTask: URLSessionDataTask?
    var mediaSource = ""
    var spanRanges: [NSRange] = []
    var videoLoop = false
    var videoRate: Float = 1
    var suspendedRate: Float = 0
    var player: AVPlayer?
    var timeObserver: Any?
    var endObserver: NSObjectProtocol?
    var statusObserver: NSKeyValueObservation?
    var firstFrameObserver: NSKeyValueObservation?
    var touchAction = "auto"
    var native: IOSNativeComponent?
    var extensionToken: UUID?

    init(view: UIView, content: UIView, kind: String) {
        self.view = view
        self.content = content
        self.kind = kind
    }
}

/// UIKit owns views; the scriptc Runtime owns only numeric IDs and never enters from a UIKit callback.
private final class TSVideoView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    let playButton = UIButton(type: .system)
    var onToggle: (() -> Void)?
    override init(frame: CGRect) {
        super.init(frame: frame)
        playButton.setTitle("Play", for: .normal)
        playButton.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        playButton.setTitleColor(.white, for: .normal)
        playButton.addTarget(self, action: #selector(toggle), for: .touchUpInside)
        addSubview(playButton)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override func layoutSubviews() { super.layoutSubviews(); playButton.frame = CGRect(x: 8, y: bounds.height - 40, width: 64, height: 32) }
    @objc private func toggle() { onToggle?() }
}

// One passive observer per render root. Native controls keep their own recognizers.
private final class TSTouchRecognizer: UIGestureRecognizer {
    var receive: ((String, Set<UITouch>) -> Void)?
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        receive?("touchDown", touches)
        state = state == .possible ? .began : .changed
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) { receive?("touchMove", touches); state = .changed }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        receive?("touchUp", touches)
        state = event.allTouches?.contains(where: { $0.phase != .ended && $0.phase != .cancelled }) == true ? .changed : .ended
    }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        receive?("touchCancel", touches)
        state = event.allTouches?.contains(where: { $0.phase != .ended && $0.phase != .cancelled }) == true ? .changed : .cancelled
    }
}

private final class TSTouchScrollView: UIScrollView {
    var allowsPan: ((CGPoint) -> Bool)?
    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        if gestureRecognizer === panGestureRecognizer, allowsPan?(panGestureRecognizer.velocity(in: self)) == false { return false }
        return super.gestureRecognizerShouldBegin(gestureRecognizer)
    }
}

private final class TouchSession {
    let touch: UITouch
    let target: UInt32
    let owner: UInt32?
    let allowX: Bool
    let allowY: Bool
    var cancelled = false
    init(touch: UITouch, target: UInt32, owner: UInt32?, allowX: Bool, allowY: Bool) {
        self.touch = touch; self.target = target; self.owner = owner; self.allowX = allowX; self.allowY = allowY
    }
}

@MainActor public final class IOSRenderer: NSObject, UIScrollViewDelegate, UITextFieldDelegate, UIGestureRecognizerDelegate {
    #if DEBUG
    private var devtoolsImage = ""
    private var devtoolsImageRect = CGRect.zero
    func devtoolsCapture(_ argument: Any) throws -> [String: Any] {
        guard let args = argument as? [String: Any] else { throw RenderError.invalidCommand }
        let offset = args["offset"] as? Int ?? 0
        if offset == 0 {
            let id = (args["id"] as? NSNumber)?.uint32Value ?? 0
            let sample = max(1, args["sample"] as? Int ?? 1)
            guard let view = id == 0 ? root : nodes[id]?.view, view.bounds.width > 0, view.bounds.height > 0 else { throw RenderError.invalidCommand }
            devtoolsImageRect = view.convert(view.bounds, to: root)
            let format = UIGraphicsImageRendererFormat()
            format.scale = min(UIScreen.main.scale / CGFloat(sample), min(2048 / view.bounds.width, 2048 / view.bounds.height))
            let image = UIGraphicsImageRenderer(bounds: view.bounds, format: format).image { _ in
                view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
            }
            let data = image.pngData()
            guard let data, data.count < 1_500_000 else { throw RenderError.invalidCommand }
            devtoolsImage = "data:image/png;base64," + data.base64EncodedString()
        }
        guard offset >= 0, offset < devtoolsImage.count else { throw RenderError.invalidCommand }
        let end = min(offset + 24000, devtoolsImage.count)
        return ["chunk": String(devtoolsImage.dropFirst(offset).prefix(end - offset)), "next": end < devtoolsImage.count ? end : 0,
                "ox": devtoolsImageRect.minX, "oy": devtoolsImageRect.minY, "ow": devtoolsImageRect.width, "oh": devtoolsImageRect.height]
    }
    #endif
    public let root: UIView
    public var onEvent: ((RendererEvent) -> Void)?
    /// The first surface child's target background, after a successful commit.
    public var onPageBackgroundColor: ((UIColor) -> Void)?
    private var nodes: [UInt32: NodeRecord] = [:]
    private var pageActive = true
    public func setPageActive(_ active: Bool) {
        guard pageActive != active else { return }
        pageActive = active
        for record in nodes.values {
            record.animation.setActive(active)
            if !active { record.suspendedRate = record.player?.rate ?? 0; record.player?.pause() }
            else if record.suspendedRate != 0 { record.player?.playImmediately(atRate: record.suspendedRate); record.suspendedRate = 0 }
        }
    }

    private var revision: UInt32 = 0
    private let extensions: IOSPlatformExtensions
    private var touchSessions: [ObjectIdentifier: TouchSession] = [:]

    public init(root: UIView, extensions: IOSPlatformExtensions? = nil) {
        self.root = root
        self.extensions = extensions ?? IOSPlatformExtensions()
        super.init()
        let observer = TSTouchRecognizer(target: nil, action: nil)
        observer.cancelsTouchesInView = false
        observer.delaysTouchesBegan = false; observer.delaysTouchesEnded = false
        observer.delegate = self
        observer.receive = { [weak self] name, touches in self?.receiveTouches(name, touches) }
        root.addGestureRecognizer(observer)
    }

    public func applyJSON(_ data: Data) throws {
        let commit = try JSONDecoder().decode(RenderCommit.self, from: data)
        try apply(commit)
    }

    private let topology = RenderTopology()
    private var lastCommands: Data?
    public func apply(_ commit: RenderCommit) throws {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        let signature = try encoder.encode(commit.commands)
        if commit.revision == revision { guard signature == lastCommands else { throw RenderError.invalidCommit }; return }
        guard commit.type == "Commit", commit.revision > revision, commit.commands.count <= 65536 else { throw RenderError.invalidCommit }
        let publishTopology = try topology.prepare(commit.commands)
        for c in commit.commands where c.type == "CreateNode" && c.kind == "Native" { guard let name = c.nativeName, extensions.components[name] != nil else { throw RenderError.invalidCommand } }
        do {
            let geometry = commit.commands.filter { ["CreateNode", "RemoveNode", "InsertChild", "MoveChild", "DetachChild", "SetFrame"].contains($0.type) || $0.changedFields.contains("scrollAnchorOffset") }
            var affectedScroll = Set<UInt32>()
            for c in geometry { affectedScroll.formUnion(topology.ancestors(c.nodeId)); if let parent = c.parentId { affectedScroll.formUnion(topology.ancestors(parent)) } }
            for command in commit.commands { try applyOne(command) }
            let touched = Set(commit.commands.map { $0.nodeId })
            for id in touched { if let record = nodes[id] { record.animation.setActive(pageActive); record.animation.commit() } }
            publishTopology(); lastCommands = signature; revision = commit.revision
            let geometryChanged = commit.commands.contains { ["CreateNode", "RemoveNode", "InsertChild", "MoveChild", "DetachChild", "SetFrame"].contains($0.type) || $0.changedFields.contains("scrollAnchorOffset") }
            if geometryChanged {
                for c in geometry { affectedScroll.formUnion(topology.ancestors(c.nodeId)); if let parent = c.parentId { affectedScroll.formUnion(topology.ancestors(parent)) } }
                updateScrollExtents(affectedScroll)
            }
            if geometryChanged || commit.commands.contains(where: { $0.type == "SetProps" || $0.changedFields.contains("backgroundColor") || $0.changedFields.contains("dmBackgroundColor") }) {
            let page = root.subviews.first
            let color = topology.rootIds.first.flatMap { nodes[$0] }?.pageBackgroundColor ?? .clear
            onPageBackgroundColor?(color)
            }
        } catch {
            clear()
            throw error
        }
    }

    public func clear() {
        topology.clear(); lastCommands = nil
        touchSessions.removeAll()
        let records = Array(nodes.values); nodes.removeAll()
        for record in records { releaseMedia(record) }
        for child in root.subviews { child.removeFromSuperview() }
        nodes.removeAll()
        revision = 0
    }

    @discardableResult public func invoke(nodeId: UInt32, method: String, args: Any, completion: @escaping NativeCompletion) throws -> (() -> Void)? {
        guard let record = nodes[nodeId] else { throw NativeExtensionError.nodeUnmounted }
        if method == "measure" {
            let frame = record.view.convert(record.view.bounds, to: root)
            completion(.success(["x": frame.minX, "y": frame.minY, "width": frame.width, "height": frame.height])); return nil
        }
        if method == "animate" {
            try record.animation.animate(args) { finished in completion(.success(["finished": finished])) }
            return { record.animation.cancel() }
        }
        if method == "cancelAnimation" { record.animation.cancel(); completion(.success(NSNull())); return nil }
        if method == "accessibilityAnnounce" {
            guard let message = (args as? [String: Any])?["message"] as? String, !message.isEmpty, message.utf16.count <= 16384 else { throw NativeExtensionError.invalidArguments }
            UIAccessibility.post(notification: .announcement, argument: message)
            completion(.success(NSNull())); return nil
        }
        if method == "accessibilityFocus" {
            guard record.view.isAccessibilityElement else { throw NativeExtensionError.unsupportedMethod("NOT_ACCESSIBLE") }
            var ancestor: UIView? = record.view
            while let view = ancestor {
                guard !view.accessibilityElementsHidden, !view.isHidden else { throw NativeExtensionError.unsupportedMethod("NOT_ACCESSIBLE") }
                ancestor = view.superview
            }
            UIAccessibility.post(notification: .layoutChanged, argument: record.view)
            completion(.success(NSNull())); return nil
        }
        if let native = record.native { return try native.invoke(method, args: args, completion: completion) }
        if method == "focus", let field = record.view as? UITextField { field.becomeFirstResponder() }
        else if method == "blur", let field = record.view as? UITextField { field.resignFirstResponder() }
        else if method == "scrollTo", let scroll = record.view as? UIScrollView,
                let args = args as? [String: Any], let x = args["x"] as? Double, let y = args["y"] as? Double, x.isFinite, y.isFinite {
            scroll.setContentOffset(CGPoint(x: x, y: y), animated: args["animated"] as? Bool ?? false)
        } else { throw NativeExtensionError.unsupportedMethod(method) }
        completion(.success(NSNull())); return nil
    }

    /// Repaint stored declarations without re-entering Core or changing layout.
    public func appearanceChanged() {
        if #available(iOS 18.0, *) { root.updateTraitsIfNeeded() }
        for record in nodes.values {
            guard let raw = record.declaredProps else { continue }
            let dark = root.traitCollection.userInterfaceStyle == .dark
            let nativeGlass: Bool
            if #available(iOS 26.0, *) { nativeGlass = true } else { nativeGlass = false }
            let p = raw.themed(dark).glassFallback(dark, nativeGlass: nativeGlass)
            let color = parseColor(p.backgroundColor) ?? .clear
            record.pageBackgroundColor = color
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            color.getRed(&r, green: &g, blue: &b, alpha: &a)
            record.animation.stage(["r":Double(r)*255,"g":Double(g)*255,"b":Double(b)*255,"a":Double(a)])
            record.animation.setActive(pageActive); record.animation.commit()
            record.view.layer.borderColor = parseColor(p.borderColor)?.cgColor
            record.view.layer.shadowColor = (parseColor(p.shadowColor) ?? .black).cgColor
            if let label = record.view as? UILabel { configureLabel(label, text:p.text ?? "", fontSize:CGFloat(p.fontSize ?? 14), props:p) }
            updateImage(record, props: p)
            if let field = record.view as? UITextField {
                field.textColor = parseColor(p.color) ?? .label
                field.attributedPlaceholder = p.placeholder.map { NSAttributedString(string:$0, attributes:[.foregroundColor:parseColor(p.placeholderTextColor) ?? .placeholderText]) }
            }
        }
        onPageBackgroundColor?(nodes.values.first { $0.view === root.subviews.first }?.pageBackgroundColor ?? .clear)
    }

    public func view(for nodeId: UInt32) -> UIView? { nodes[nodeId]?.view }

    public func measure(kind: String, text: String, fontSize: CGFloat, maxWidth: CGFloat, props: RenderProps? = nil) throws -> (width: CGFloat, height: CGFloat, baseline: CGFloat) {
        guard maxWidth.isFinite, maxWidth >= 0, fontSize.isFinite, fontSize >= 0 else { throw RenderError.invalidCommand }
        let font = UIFont.systemFont(ofSize: fontSize)
        let view: UIView
        switch kind {
        case "Text", "RichText":
            let label = UILabel()
            configureLabel(label, text: text.isEmpty ? " " : text, fontSize: fontSize, props: props)
            view = label
        case "TextInput":
            let field = UITextField()
            field.font = font
            field.text = text.isEmpty ? " " : text
            view = field
        default: throw RenderError.invalidCommand
        }
        let size = view.sizeThatFits(CGSize(width: maxWidth, height: CGFloat.greatestFiniteMagnitude))
        // Layout quantizes frames to whole points. Rounding a fractional text
        // extent down can make UILabel truncate an otherwise unconstrained line.
        return (min(maxWidth, ceil(size.width)), ceil(size.height), font.ascender)
    }

    private func applyOne(_ command: RenderCommand) throws {
        if command.type == "CreateNode" {
            let view: UIView
            let content: UIView
            var native: IOSNativeComponent?
            let extensionToken = UUID()
            switch command.kind {
            case "View":
                let effectView = TSPrimitiveView(effect: nil)
                view = effectView; content = effectView.nodeContent
            case "Text":
                let label = TSAccessibleLabel(); label.numberOfLines = 0
                view = label; content = label
            case "RichText":
                let label = TSAccessibleLabel(); label.numberOfLines = 0
                view = label; content = label
            case "TextInput":
                let field = UITextField()
                field.autocapitalizationType = .none
                field.autocorrectionType = .no
                field.spellCheckingType = .no
                field.smartQuotesType = .no
                field.smartDashesType = .no
                field.smartInsertDeleteType = .no
                field.addTarget(self, action: #selector(inputChanged(_:)), for: .editingChanged)
                field.addTarget(self, action: #selector(inputEnded(_:)), for: .editingDidEnd)
                field.addTarget(self, action: #selector(inputBegan(_:)), for: .editingDidBegin)
                field.addTarget(self, action: #selector(inputSubmitted(_:)), for: .editingDidEndOnExit)
                view = field; content = field
            case "ScrollView":
                let scroll = TSTouchScrollView()
                scroll.delegate = self
                scroll.allowsPan = { [weak self, weak scroll] velocity in
                    guard let self, let scroll else { return true }
                    return self.touchSessions.values.filter { self.nodes[$0.target]?.view.isDescendant(of: scroll) == true }
                        .allSatisfy { abs(velocity.x) > abs(velocity.y) ? $0.allowX : $0.allowY }
                }
                let inner = UIView()
                scroll.addSubview(inner)
                view = scroll; content = inner
            case "Image":
                let image = TSAccessibleImage(); image.contentMode = .scaleAspectFit; image.clipsToBounds = true
                view = image; content = image
            case "Native":
                guard let name = command.nativeName, let factory = extensions.components[name] else { throw RenderError.invalidCommand }
                let instance = try factory { [weak self] name, data in
                    DispatchQueue.main.async { [weak self] in
                        guard let self, let record = self.nodes[command.nodeId], record.extensionToken == extensionToken, record.native != nil, record.events.contains("nativeComponent"),
                              let value = try? encodeNativeJSON(["name": name, "data": data]) else { return }
                        self.onEvent?(RendererEvent(type: "NativeEvent", nodeId: command.nodeId, revision: self.revision, value: value, event: "nativeComponent"))
                    }
                }
                native = instance; view = instance.view; content = instance.contentView ?? instance.view
            case "Video":
                let video = TSVideoView(frame: .zero); video.playerLayer.videoGravity = .resizeAspect
                view = video; content = video
            default: throw RenderError.invalidCommand
            }
            let record = NodeRecord(view: view, content: content, kind: command.kind ?? "")
            record.native = native
            record.extensionToken = extensionToken
            _ = record.defaultAccessibilityTraits; _ = record.defaultAccessibilityElement
            nodes[command.nodeId] = record
            let activate: () -> Bool = { [weak self, weak record] in
                guard let self, let record, record.events.contains("tap"), record.declaredProps?.accessibilityClickable != false, record.declaredProps?.disabled != true else { return false }
                self.emitTap(command.nodeId, record: record); return true
            }
            (view as? TSPrimitiveView)?.activate = activate
            (view as? TSAccessibleLabel)?.activate = activate
            (view as? TSAccessibleImage)?.activate = activate
            view.isUserInteractionEnabled = true
            view.isMultipleTouchEnabled = true
            do {
                let tap = UITapGestureRecognizer(target: self, action: #selector(viewTapped(_:)))
                tap.name = "anseronui.tap"; tap.isEnabled = false
                view.addGestureRecognizer(tap)
            }
            let hold = UILongPressGestureRecognizer(target: self, action: #selector(longPressed(_:)))
            hold.minimumPressDuration = 0.5
            hold.name = "anseronui.longPress.\(command.nodeId)"
            hold.cancelsTouchesInView = false
            hold.isEnabled = false
            view.addGestureRecognizer(hold)
            return
        }
        guard let record = nodes[command.nodeId] else { throw RenderError.invalidCommand }
        switch command.type {
        case "RemoveNode":
            if let token = record.timeObserver, let player = record.player { player.removeTimeObserver(token) }
            if let token = record.endObserver { NotificationCenter.default.removeObserver(token) }
            record.statusObserver = nil; record.firstFrameObserver = nil
            let subtree = [record.view] + record.view.subviews.flatMap { [$0] + $0.allDescendants() }
            for (id, item) in nodes where subtree.contains(where: { $0 === item.view }) { releaseMedia(item); nodes.removeValue(forKey: id) }
            record.view.removeFromSuperview()
        case "InsertChild", "MoveChild":
            guard let parent = command.parentId, let index = command.index else { throw RenderError.invalidCommand }
            if let native = nodes[parent]?.native, native.contentView == nil { throw RenderError.invalidCommand }
            let target = parent == 0 ? root : nodes[parent]?.content
            guard let target else { throw RenderError.invalidCommand }
            let targetIndex = min(index, max(0, target.subviews.count - (record.view.superview === target ? 1 : 0)))
            if record.view.superview !== target || target.subviews.firstIndex(of: record.view) != targetIndex {
                record.view.removeFromSuperview()
                target.insertSubview(record.view, at: targetIndex)
            }
        case "DetachChild": record.view.removeFromSuperview()
        case "PatchProps":
            guard let set = command.set, let unset = command.unset else { throw RenderError.invalidCommand }
            let base = try record.declaredProps ?? RenderProps.empty()
            let props = try base.patched(set, unset)
            if let native = record.native, set.nativeProps != nil || unset.contains("nativeProps") {
                guard let values = try decodeNativeJSON(props.nativeProps ?? "{}") as? [String: Any] else { throw NativeExtensionError.invalidArguments }
                try native.setProps(values)
            }
            let changed = command.changedFields
            if changed.isSubset(of: Set(["opacity", "translateX", "translateY", "scaleX", "scaleY", "rotate", "borderRadius"])) {
                record.declaredProps = props
                var values: [String: Double] = [:]
                if changed.contains("opacity") { values["opacity"] = props.opacity ?? 1 }
                if changed.contains("translateX") { values["translateX"] = props.translateX ?? 0 }
                if changed.contains("translateY") { values["translateY"] = props.translateY ?? 0 }
                if changed.contains("scaleX") { values["scaleX"] = props.scaleX ?? 1 }
                if changed.contains("scaleY") { values["scaleY"] = props.scaleY ?? 1 }
                if changed.contains("rotate") { values["rotate"] = props.rotate ?? 0 }
                if changed.contains("borderRadius") { values["borderRadius"] = props.borderRadius ?? 0 }
                record.animation.stage(values)
            } else { try setProps(record, props, changed: changed) }
        case "SetProps":
            guard let props = command.props else { throw RenderError.invalidCommand }
            if let native = record.native {
                guard let values = try decodeNativeJSON(props.nativeProps ?? "{}") as? [String: Any] else { throw NativeExtensionError.invalidArguments }
                try native.setProps(values)
            }
            try setProps(record, props)
        case "SetFrame":
            guard let frame = command.frame else { throw RenderError.invalidCommand }
            record.animation.stage(["x": frame.x, "y": frame.y, "width": frame.width, "height": frame.height])
            // Core dispatches the committed layout after CommitAck.
        case "BindEvent":
            guard let event = command.event, let enabled = command.enabled else { throw RenderError.invalidCommand }
            if enabled { record.events.insert(event) } else { record.events.remove(event) }
            updateAccessibility(record)
            for recognizer in record.view.gestureRecognizers ?? [] {
                if recognizer.name == "anseronui.tap" { recognizer.isEnabled = record.events.contains("tap") || record.events.contains("spanClick") }
                else if recognizer is UILongPressGestureRecognizer { recognizer.isEnabled = record.events.contains("longPress") }
            }
        default: throw RenderError.invalidCommand
        }
    }

    private func setProps(_ record: NodeRecord, _ raw: RenderProps, changed: Set<String>? = nil) throws {
        func affects(_ keys: String...) -> Bool { changed == nil || keys.contains { changed!.contains($0) } }
        let previous = record.declaredProps
        record.declaredProps = raw
        let dark = root.traitCollection.userInterfaceStyle == .dark
        let nativeGlass: Bool
        if #available(iOS 26.0, *) { nativeGlass = true } else { nativeGlass = false }
        let props = raw.themed(dark).glassFallback(dark, nativeGlass: nativeGlass)
        let view = record.view
        // Missing backgrounds are transparent, including when a prior color is removed.
        // An opaque UILabel with a nil background can draw a black backing surface.
        let backgroundColor = parseColor(props.backgroundColor) ?? .clear
        // Replacing an unchanged effect on touch/drag commits restarts UIKit's
        // interactive highlight. Keep the native effect alive across those updates.
        let glassChanged = previous?.glassEffect != props.glassEffect
            || previous?.glassEffectContainer != props.glassEffectContainer
            || previous?.glassEffectStyle != props.glassEffectStyle
            || previous?.glassEffectTintColor != props.glassEffectTintColor
            || previous?.glassEffectInteractive != props.glassEffectInteractive
            || previous?.glassEffectSpacing != props.glassEffectSpacing
            || previous?.disabled != props.disabled
            || previous?.backgroundBlurRadius != raw.backgroundBlurRadius
        if affects("glassEffect", "glassEffectStyle", "glassEffectTintColor", "glassEffectInteractive", "glassEffectContainer", "glassEffectSpacing", "disabled", "backgroundBlurRadius"), glassChanged, let effectView = view as? UIVisualEffectView, #available(iOS 26.0, *) {
            if props.glassEffectContainer == true {
                let effect = UIGlassContainerEffect()
                effect.spacing = props.glassEffectSpacing ?? 0
                effectView.effect = effect
            } else if props.glassEffect == true {
                let style: UIGlassEffect.Style = props.glassEffectStyle == "clear" ? .clear : .regular
                let effect = UIGlassEffect(style: style)
                effect.tintColor = props.glassEffectTintColor.flatMap(parseColor)
                effect.isInteractive = props.glassEffectInteractive == true && props.disabled != true
                effectView.effect = effect
            } else {
                effectView.effect = nil
            }
        }
        if affects("glassEffect", "glassEffectStyle", "glassEffectTintColor", "glassEffectInteractive", "glassEffectContainer", "glassEffectSpacing", "disabled", "backgroundBlurRadius"), let effectView = view as? TSPrimitiveView {
            let usesFallback = !nativeGlass || (props.glassEffect != true && props.glassEffectContainer != true)
            if usesFallback { effectView.effect = nil }
            effectView.setBackgroundBlur(radius:usesFallback ? (props.backgroundBlurRadius ?? 0) : 0)
        }
        record.pageBackgroundColor = backgroundColor
        if affects("animation") {
        if let json = props.animation {
            guard let config = try decodeNativeJSON(json) as? [String: Any] else { throw NativeExtensionError.invalidArguments }
            record.animation.options = try TSAnimationOptions(config)
        } else { record.animation.options = nil }
        }
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        backgroundColor.getRed(&r, green:&g, blue:&b, alpha:&a)
        if affects("opacity", "translateX", "translateY", "scaleX", "scaleY", "rotate", "borderRadius", "backgroundColor", "dmBackgroundColor", "glassEffect", "glassEffectStyle", "glassEffectContainer") {
        record.animation.stage(["opacity":props.opacity ?? 1, "translateX":props.translateX ?? 0, "translateY":props.translateY ?? 0,
            "scaleX":props.scaleX ?? 1, "scaleY":props.scaleY ?? 1, "rotate":props.rotate ?? 0, "borderRadius":props.borderRadius ?? 0,
            "r":Double(r)*255,"g":Double(g)*255,"b":Double(b)*255,"a":Double(a)])
        }
        if affects("borderWidth") { view.layer.borderWidth = CGFloat(props.borderWidth ?? 0) }
        if affects("borderColor", "dmBorderColor") { view.layer.borderColor = parseColor(props.borderColor)?.cgColor }
        if affects("overflow") { view.clipsToBounds = view is UIScrollView || props.overflow == "hidden" }
        if affects("shadowColor", "dmShadowColor") { view.layer.shadowColor = (parseColor(props.shadowColor) ?? .black).cgColor }
        if affects("shadowOpacity") { view.layer.shadowOpacity = Float(props.shadowOpacity ?? 0) }
        if affects("shadowRadius") { view.layer.shadowRadius = CGFloat(props.shadowRadius ?? 0) }
        if affects("shadowOffsetX", "shadowOffsetY") { view.layer.shadowOffset = CGSize(width: props.shadowOffsetX ?? 0, height: props.shadowOffsetY ?? 0) }
        if affects("visibility") { view.isHidden = props.visibility == "hidden" }
        if affects("testID") { view.accessibilityIdentifier = props.testID }
        if affects("touchAction") { record.touchAction = props.touchAction ?? "auto" }
        if affects("accessible", "accessibilityHidden", "accessibilityRole", "accessibilityLabel", "accessibilityHint", "accessibilityValue", "accessibilityChecked", "accessibilitySelected", "accessibilityClickable", "accessibilityLongClickable", "disabled") { updateAccessibility(record) }
        if record.kind == "View" { view.isUserInteractionEnabled = props.disabled != true }
        if affects("scrollEnabled", "showsVerticalScrollIndicator"), let scroll = view as? UIScrollView {
            scroll.isScrollEnabled = props.scrollEnabled ?? true
            scroll.showsVerticalScrollIndicator = props.showsVerticalScrollIndicator ?? true
        }
        if affects("src", "dmSrc", "placeholderSrc", "resizeMode", "controls", "autoplay", "loop", "muted", "rate", "playControl") { updateImage(record, props: props) }
        if affects("src", "dmSrc", "placeholderSrc", "resizeMode", "controls", "autoplay", "loop", "muted", "rate", "playControl"), let video = view as? TSVideoView {
            record.videoLoop = props.loop ?? false
            record.videoRate = Float(props.rate ?? 1)
            video.playerLayer.videoGravity = resizeGravity(props.resizeMode)
            video.playButton.isHidden = props.controls == false
            video.onToggle = { [weak self, weak record] in
                guard let self, self.pageActive, let record, let player = record.player else { return }
                let playing = player.rate == 0
                if playing { player.playImmediately(atRate: record.videoRate) } else { player.pause() }
                self.emitMedia("playStateDidChanged", id: self.nodeId(for: record), source: record.mediaSource, state: playing ? "playing" : "paused")
            }
            let source = props.src ?? ""
            if source != record.mediaSource {
                record.suspendedRate = 0
                if let old = record.timeObserver, let player = record.player { player.removeTimeObserver(old); record.timeObserver = nil }
                if let old = record.endObserver { NotificationCenter.default.removeObserver(old); record.endObserver = nil }
                record.player?.pause()
                record.statusObserver = nil; record.firstFrameObserver = nil
                record.mediaSource = source
                if let url = mediaURL(source) {
                    let item = AVPlayerItem(url: url)
                    let player = AVPlayer(playerItem: item)
                    record.player = player; video.playerLayer.player = player
                    player.isMuted = props.muted ?? false
                    record.statusObserver = item.observe(\.status, options: [.new]) { [weak self, weak record] item, _ in
                        DispatchQueue.main.async {
                            guard let self, let record, record.mediaSource == source else { return }
                            if item.status == .readyToPlay { self.emitMedia("loadSuccess", id: self.nodeId(for: record), source: source) }
                            else if item.status == .failed { self.emitMedia("loadFailure", id: self.nodeId(for: record), source: source, errorCode: 1) }
                        }
                    }
                    record.firstFrameObserver = video.playerLayer.observe(\.isReadyForDisplay, options: [.new]) { [weak self, weak record] layer, _ in
                        guard layer.isReadyForDisplay else { return }
                        DispatchQueue.main.async {
                            guard let self, let record, record.mediaSource == source else { return }
                            self.emitMedia("firstFrameDidDisplay", id: self.nodeId(for: record), source: source)
                        }
                    }
                    record.endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self, weak record, weak player] _ in
                            guard let self, let record, record.mediaSource == source else { return }
                            if record.videoLoop { player?.seek(to: .zero); if self.pageActive { player?.playImmediately(atRate: record.videoRate) } else { record.suspendedRate = record.videoRate }; return }
                            self.emitMedia("playStateDidChanged", id: self.nodeId(for: record), source: source, state: "ended")
                    }
                    record.timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self, weak record] time in
                        guard let self, let record else { return }
                        let duration = item.duration.seconds.isFinite ? item.duration.seconds : 0
                        self.emitMedia("playTimeDidChanged", id: self.nodeId(for: record), source: source, time: time.seconds, duration: duration)
                        if player.rate > 0 { self.emitMedia("playStateDidChanged", id: self.nodeId(for: record), source: source, state: "playing") }
                    }
                    if props.autoplay == true { if self.pageActive { player.playImmediately(atRate: record.videoRate) } else { record.suspendedRate = record.videoRate } }
                } else {
                    DispatchQueue.main.async { [weak self, weak record] in
                        guard let self, let record, record.mediaSource == source else { return }
                        self.emitMedia("loadFailure", id: self.nodeId(for: record), source: source, errorCode: 1)
                    }
                }
            }
            record.player?.isMuted = props.muted ?? false
            if props.playControl == "play" { if pageActive { record.player?.playImmediately(atRate: record.videoRate) } else { record.suspendedRate = record.videoRate }; emitMedia("playStateDidChanged", id: nodeId(for: record), source: source, state: "playing") }
            else if props.playControl == "pause" { record.suspendedRate = 0; record.player?.pause(); emitMedia("playStateDidChanged", id: nodeId(for: record), source: source, state: "paused") }
            else if props.playControl == "stop" { record.suspendedRate = 0; record.player?.pause(); record.player?.seek(to: .zero); emitMedia("playStateDidChanged", id: nodeId(for: record), source: source, state: "paused") }
        }
        let fontSize = CGFloat(props.fontSize ?? 16)
        if affects("text", "spans", "fontSize", "fontWeight", "fontStyle", "color", "dmColor", "lineHeight", "textAlign", "textDecorationLine", "numberOfLines", "ellipsizeMode"), let label = view as? UILabel {
            configureLabel(label, text: props.text ?? "", fontSize: fontSize, props: props)
            record.spanRanges = []
            if record.kind == "RichText", let data = props.spans?.data(using: .utf8), let spans = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                var offset = 0
                for span in spans {
                    let length = ((span["text"] as? String ?? "") as NSString).length
                    record.spanRanges.append(NSRange(location: offset, length: length))
                    offset += length
                }
            }
        } else if affects("value", "inputRevision", "placeholder", "placeholderTextColor", "dmPlaceholderTextColor", "fontSize", "fontWeight", "fontStyle", "color", "dmColor", "editable", "disabled", "secureTextEntry", "keyboardType", "returnKeyType", "autoCapitalize", "autoCorrect", "maxLength"), let field = view as? UITextField {
            record.applyingValue = true
            if affects("value", "inputRevision"), (props.inputRevision ?? 0) >= record.inputRevision && field.markedTextRange == nil {
                let value = props.value ?? ""
                if field.text != value { field.text = value }
                record.lastInputValue = value
            }
            if affects("placeholder") { field.placeholder = props.placeholder ?? "" }
            if affects("fontSize", "fontWeight", "fontStyle") { field.font = .systemFont(ofSize: fontSize) }
            if affects("color", "dmColor") { field.textColor = parseColor(props.color) ?? .label }
            if affects("editable") { field.isEnabled = props.editable ?? true }
            if affects("secureTextEntry") { field.isSecureTextEntry = props.secureTextEntry ?? false }
            if affects("placeholder", "placeholderTextColor", "dmPlaceholderTextColor") { field.attributedPlaceholder = props.placeholder.map { NSAttributedString(string: $0, attributes: [.foregroundColor: parseColor(props.placeholderTextColor) ?? .placeholderText]) } }
            if affects("keyboardType") { field.keyboardType = props.keyboardType == "numeric" ? .numberPad : (props.keyboardType == "email-address" ? .emailAddress : (props.keyboardType == "phone-pad" ? .phonePad : (props.keyboardType == "url" ? .URL : .default))) }
            if affects("returnKeyType") { field.returnKeyType = props.returnKeyType == "done" ? .done : (props.returnKeyType == "go" ? .go : (props.returnKeyType == "search" ? .search : (props.returnKeyType == "send" ? .send : .default))) }
            if affects("autoCapitalize") { field.autocapitalizationType = props.autoCapitalize == "characters" ? .allCharacters : (props.autoCapitalize == "words" ? .words : (props.autoCapitalize == "sentences" ? .sentences : .none)) }
            if affects("autoCorrect") { field.autocorrectionType = props.autoCorrect == false ? .no : .default }
            if affects("maxLength") { record.maxLength = props.maxLength }
            if affects("maxLength") { field.delegate = props.maxLength == nil ? nil : self }
            record.applyingValue = false
        }
    }
    private func updateAccessibility(_ record: NodeRecord) {
        guard let p = record.declaredProps else { return }
        let view = record.view
        let excluded = p.accessible == false || p.accessibilityRole == "none"
        let clickable = p.accessibilityClickable ?? record.events.contains("tap")
        let longClickable = p.accessibilityLongClickable ?? record.events.contains("longPress")
        let explicit = p.accessible == true || p.accessibilityRole != nil || p.accessibilityLabel != nil || clickable || longClickable
        view.isAccessibilityElement = !excluded && (explicit || record.defaultAccessibilityElement)
        view.accessibilityElementsHidden = p.accessibilityHidden == true
        view.accessibilityLabel = excluded ? nil : p.accessibilityLabel
        view.accessibilityHint = excluded ? nil : p.accessibilityHint
        view.accessibilityValue = excluded ? nil : p.accessibilityValue
        var traits: UIAccessibilityTraits = p.accessibilityRole == nil ? record.defaultAccessibilityTraits : []
        switch p.accessibilityRole {
        case "button", "checkbox": traits.insert(.button)
        case "text": traits.insert(.staticText)
        case "image": traits.insert(.image)
        case "search": traits.insert(.searchField)
        default: break
        }
        if clickable { traits.insert(.button) }
        if p.accessibilitySelected == true || p.accessibilityChecked == true { traits.insert(.selected) }
        if p.disabled == true { traits.insert(.notEnabled) }
        view.accessibilityTraits = excluded ? [] : traits
        view.accessibilityCustomActions = nil
        if !excluded && longClickable && record.events.contains("longPress") {
            view.accessibilityCustomActions = [UIAccessibilityCustomAction(name: NSLocalizedString("Long press", comment: "Accessibility action"), actionHandler: { [weak self, weak record] _ in
                guard let self, let record, record.declaredProps?.disabled != true,
                      record.events.contains("longPress"), let id = self.nodes.first(where: { $0.value === record })?.key else { return false }
                self.onEvent?(RendererEvent(type: "NativeEvent", nodeId: id, revision: self.revision, event: "longPress")); return true
            })]
        }
    }

    private func releaseMedia(_ record: NodeRecord) {
        record.animation.cancel()
        record.imageGeneration = UUID()
        record.imageTask?.cancel(); record.imageTask = nil
        let native = record.native; record.native = nil; native?.dispose()
        record.player?.pause()
        if let token = record.timeObserver { record.player?.removeTimeObserver(token) }
        if let token = record.endObserver { NotificationCenter.default.removeObserver(token) }
        record.timeObserver = nil; record.endObserver = nil
        record.statusObserver = nil; record.firstFrameObserver = nil
        record.player = nil
    }

    private func mediaURL(_ source: String) -> URL? {
        if source.hasPrefix("asset://") {
            let name = String(source.dropFirst(8))
            guard name.range(of: "^[A-Za-z0-9_-][A-Za-z0-9_.-]*$", options: .regularExpression) != nil else { return nil }
            return Bundle.main.resourceURL?.appendingPathComponent("assets").appendingPathComponent(name)
        }
        guard let url = URL(string: source), ["http", "https", "file"].contains(url.scheme?.lowercased() ?? "") else { return nil }
        return url
    }

    private func textFont(size: CGFloat, weight: String?, style: String?) -> UIFont {
        let base = UIFont.systemFont(ofSize: size, weight: weight == "bold" ? .bold : .regular)
        guard style == "italic", let descriptor = base.fontDescriptor.withSymbolicTraits(base.fontDescriptor.symbolicTraits.union(.traitItalic)) else { return base }
        return UIFont(descriptor: descriptor, size: size)
    }

    private func updateImage(_ record: NodeRecord, props: RenderProps) {
        if let image = record.view as? UIImageView {
            image.contentMode = resizeMode(props.resizeMode)
            let source = props.src ?? ""
            if source != record.mediaSource {
                record.mediaSource = source
                let generation = UUID(); record.imageGeneration = generation
                record.imageTask?.cancel(); record.imageTask = nil
                image.image = nil
                if let placeholder = props.placeholderSrc, let url = mediaURL(placeholder) { image.image = UIImage(contentsOfFile: url.path) }
                guard let url = mediaURL(source) else {
                    DispatchQueue.main.async { [weak self, weak record] in
                        guard let self, let record, record.imageGeneration == generation else { return }
                        self.emitMedia("loadFailure", id: self.nodeId(for: record), source: source, errorCode: 1)
                    }
                    return
                }
                if url.isFileURL {
                    image.image = UIImage(contentsOfFile: url.path)
                    DispatchQueue.main.async { [weak self, weak record] in
                        guard let self, let record, record.imageGeneration == generation else { return }
                        if image.image != nil { self.emitMedia("loadSuccess", id: self.nodeId(for: record), source: source) }
                        else { self.emitMedia("loadFailure", id: self.nodeId(for: record), source: source, errorCode: 1) }
                    }
                } else {
                    record.imageTask = URLSession.shared.dataTask(with: url) { [weak image, weak record, weak self] data, _, error in
                        DispatchQueue.main.async {
                            guard let image, let record, let self, record.imageGeneration == generation else { return }
                            if let data, let loaded = UIImage(data: data) { image.image = loaded; self.emitMedia("loadSuccess", id: self.nodeId(for: record), source: source) }
                            else { self.emitMedia("loadFailure", id: self.nodeId(for: record), source: source, errorCode: 1) }
                        }
                    }
                    record.imageTask?.resume()
                }
            }
        }
    }

    private func configureLabel(_ label: UILabel, text: String, fontSize: CGFloat, props: RenderProps?) {
        label.attributedText = nil
        label.font = textFont(size: fontSize, weight: props?.fontWeight, style: props?.fontStyle)
        label.textColor = parseColor(props?.color) ?? .label
        label.numberOfLines = props?.numberOfLines ?? 0
        label.textAlignment = props?.textAlign == "center" ? .center : (props?.textAlign == "right" ? .right : .left)
        label.lineBreakMode = props?.ellipsizeMode == "clip" ? .byClipping : (label.numberOfLines == 0 ? .byWordWrapping : .byTruncatingTail)
        if let data = props?.spans?.data(using: .utf8), let spans = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            let result = NSMutableAttributedString(string: "")
            for span in spans {
                let font = textFont(size: CGFloat(span["fontSize"] as? Double ?? Double(fontSize)), weight: span["fontWeight"] as? String ?? props?.fontWeight, style: span["fontStyle"] as? String ?? props?.fontStyle)
                var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: parseColor(span["color"] as? String) ?? label.textColor!]
                if span["textDecorationLine"] as? String == "underline" { attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue }
                if span["textDecorationLine"] as? String == "line-through" { attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
                result.append(NSAttributedString(string: span["text"] as? String ?? "", attributes: attributes))
            }
            let paragraph = NSMutableParagraphStyle(); paragraph.alignment = label.textAlignment; paragraph.lineBreakMode = label.lineBreakMode
            result.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: result.length))
            label.attributedText = result
        } else if props?.textDecorationLine == "underline" || props?.textDecorationLine == "line-through" {
            let key: NSAttributedString.Key = props?.textDecorationLine == "underline" ? .underlineStyle : .strikethroughStyle
            label.attributedText = NSAttributedString(string: text, attributes: [.font: label.font!, .foregroundColor: label.textColor!, key: NSUnderlineStyle.single.rawValue])
        } else { label.text = text }
        if let lineHeight = props?.lineHeight {
            let value = NSMutableAttributedString(attributedString: label.attributedText ?? NSAttributedString(string: text, attributes: [.font: label.font!, .foregroundColor: label.textColor!]))
            let paragraph = NSMutableParagraphStyle(); paragraph.alignment = label.textAlignment; paragraph.lineBreakMode = label.lineBreakMode
            paragraph.minimumLineHeight = lineHeight; paragraph.maximumLineHeight = lineHeight
            value.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: value.length))
            label.attributedText = value
        }
    }

    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        gestureRecognizer is TSTouchRecognizer || otherGestureRecognizer is TSTouchRecognizer
    }

    @objc private func viewTapped(_ recognizer: UITapGestureRecognizer) {
        guard let view = recognizer.view, let (id, record) = nodes.first(where: { $0.value.view === view }) else { return }
        if record.events.contains("spanClick"), let label = view as? UILabel, let attributed = label.attributedText, attributed.length > 0 {
            let storage = NSTextStorage(attributedString: attributed)
            let manager = NSLayoutManager(); let container = NSTextContainer(size: label.bounds.size)
            container.lineFragmentPadding = 0; container.maximumNumberOfLines = label.numberOfLines; container.lineBreakMode = label.lineBreakMode
            manager.addTextContainer(container); storage.addLayoutManager(manager)
            manager.ensureLayout(for: container)
            let used = manager.usedRect(for: container)
            let location = recognizer.location(in: label)
            let point = CGPoint(x: location.x, y: location.y - (label.bounds.height - used.height) / 2)
            let glyph = manager.glyphIndex(for: point, in: container)
            if glyph < manager.numberOfGlyphs && manager.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: container).contains(point) {
                let character = manager.characterIndexForGlyph(at: glyph)
                if let index = record.spanRanges.firstIndex(where: { NSLocationInRange(character, $0) }) {
                    onEvent?(RendererEvent(type: "NativeEvent", nodeId: id, revision: revision, value: String(index), event: "spanClick"))
                    return
                }
            }
        }
        emitTap(id, record: record)
    }

    private func emitTap(_ id: UInt32, record: NodeRecord) {
        guard record.events.contains("tap") else { return }
        if record.declaredProps?.accessibilityRole == "button" {
            root.endEditing(true)
            for input in nodes.values where input.kind == "TextInput" {
                if let field = input.view as? UITextField { publishInput(field, record: input, force: true) }
            }
        }
        onEvent?(RendererEvent(type: "Tap", nodeId: id, revision: revision))
    }

    private func publishInput(_ field: UITextField, record: NodeRecord, force: Bool = false) {
        guard (force || field.markedTextRange == nil), !record.applyingValue,
              record.events.contains("changeText"), let found = nodes.first(where: { $0.value === record }) else { return }
        let value = field.text ?? ""
        guard value != record.lastInputValue else { return }
        record.lastInputValue = value
        if record.inputRevision == 0 { record.inputRevision = 1 }
        onEvent?(RendererEvent(type: "InputChange", nodeId: found.key, revision: revision, value: value, inputRevision: record.inputRevision))
    }



    @objc private func inputChanged(_ sender: UITextField) {
        guard let record = nodes.values.first(where: { $0.view === sender }), !record.applyingValue else { return }
        record.inputRevision += 1
        publishInput(sender, record: record)
    }

    @objc private func inputEnded(_ sender: UITextField) {
        guard let record = nodes.values.first(where: { $0.view === sender }) else { return }
        publishInput(sender, record: record, force: true)
        emit("blur", for: sender)
    }

    @objc private func inputBegan(_ sender: UITextField) { emit("focus", for: sender) }

    @objc private func inputSubmitted(_ sender: UITextField) {
        sender.resignFirstResponder()
        guard let (id, record) = nodes.first(where: { $0.value.view === sender }), record.events.contains("submit") else { return }
        onEvent?(RendererEvent(type: "NativeEvent", nodeId: id, revision: revision, value: sender.text ?? "", inputRevision: nil, event: "submit"))
    }

    @objc private func longPressed(_ recognizer: UILongPressGestureRecognizer) {
        guard recognizer.state == .began, let name = recognizer.name,
              let id = UInt32(name.split(separator: ".").last ?? ""),
              nodes[id]?.events.contains("longPress") == true else { return }
        emit("longPress", nodeId: id)
    }

    private func receiveTouches(_ name: String, _ touches: Set<UITouch>) {
        for touch in touches {
            let key = ObjectIdentifier(touch)
            if name == "touchDown" {
                // UITouch.view is fixed at the initial hit, even after leaving its bounds.
                var candidate = touch.view
                var target: UInt32?
                var owner: UInt32?
                var allowX = true, allowY = true
                var policyComplete = false
                while let view = candidate, view !== root {
                    if let (id, record) = nodes.first(where: { $0.value.view === view }) {
                        if target == nil { target = id }
                        if owner == nil && !record.events.isDisjoint(with: ["touchDown", "touchMove", "touchUp", "touchCancel"]) { owner = id }
                        if !policyComplete {
                            allowX = allowX && record.touchAction != "none" && record.touchAction != "pan-y"
                            allowY = allowY && record.touchAction != "none" && record.touchAction != "pan-x"
                            if view is UIScrollView { policyComplete = true }
                        }
                    }
                    candidate = view.superview
                }
                guard let target else { continue }
                touchSessions[key] = TouchSession(touch: touch, target: target, owner: owner, allowX: allowX, allowY: allowY)
            }
            guard let session = touchSessions[key] else { continue }
            if name == "touchUp" || name == "touchCancel" { touchSessions.removeValue(forKey: key) }
            if !session.cancelled { emitTouch(name, session) }
        }
    }

    private func emitTouch(_ name: String, _ session: TouchSession) {
        guard let owner = session.owner, let targetView = nodes[session.target]?.view, targetView.isDescendant(of: root) else { return }
        let local = session.touch.location(in: targetView), page = session.touch.location(in: root)
        let points = touchSessions.values.filter { !$0.cancelled }.map { item -> [String: Double] in
            let point = item.touch.location(in: targetView), pagePoint = item.touch.location(in: root)
            return ["x": point.x, "y": point.y, "pageX": pagePoint.x, "pageY": pagePoint.y, "pointerId": Double(UInt32(truncatingIfNeeded: item.touch.hashValue))]
        }
        onEvent?(RendererEvent(type: "NativeEvent", nodeId: owner, revision: revision, event: name, x: local.x, y: local.y,
            pageX: page.x, pageY: page.y, pointerId: UInt32(truncatingIfNeeded: session.touch.hashValue), touches: points, targetId: session.target))
    }

    public func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
        // Scrolling owns the remainder of this gesture. Never emit an up after cancel.
        for session in Array(touchSessions.values) where !session.cancelled && nodes[session.target]?.view.isDescendant(of: scrollView) == true {
            session.cancelled = true
            emitTouch("touchCancel", session)
        }
    }

    private func emit(_ event: String, for view: UIView) {
        guard let (id, _) = nodes.first(where: { $0.value.view === view }) else { return }
        emit(event, nodeId: id)
    }
    private func emit(_ event: String, nodeId: UInt32) {
        guard nodes[nodeId]?.events.contains(event) == true else { return }
        onEvent?(RendererEvent(type: "NativeEvent", nodeId: nodeId, revision: revision, event: event))
    }

    public func scrollViewDidScroll(_ scrollView: UIScrollView) { emitScroll("scroll", scrollView) }
    public func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
        if !decelerate { emitScroll("scrollEnd", scrollView) }
    }
    public func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) { emitScroll("scrollEnd", scrollView) }
    private func emitScroll(_ event: String, _ scroll: UIScrollView) {
        guard let (id, record) = nodes.first(where: { $0.value.view === scroll }), record.events.contains(event) else { return }
        onEvent?(RendererEvent(type: "NativeEvent", nodeId: id, revision: revision, event: event,
            x: scroll.contentOffset.x, y: scroll.contentOffset.y, contentWidth: scroll.contentSize.width, contentHeight: scroll.contentSize.height))
    }

    private func nodeId(for record: NodeRecord) -> UInt32 { nodes.first(where: { $0.value === record })?.key ?? 0 }
    private func emitMedia(_ event: String, id: UInt32, source: String, errorCode: UInt32? = nil, state: String? = nil, time: Double? = nil, duration: Double? = nil) {
        guard id != 0, nodes[id]?.events.contains(event) == true else { return }
        onEvent?(RendererEvent(type: "NativeEvent", nodeId: id, revision: revision, event: event,
            x: time.map { $0 * 1000 }, source: source, state: state, duration: duration.map { $0 * 1000 }, errorCode: errorCode.map(Double.init)))
    }

    public func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
        guard let maximum = nodes.values.first(where: { $0.view === textField })?.maxLength else { return true }
        let current = textField.text ?? ""
        guard let range = Range(range, in: current) else { return false }
        return current.replacingCharacters(in: range, with: string).count <= maximum
    }

    private func updateScrollExtents(_ ids: Set<UInt32>) {
        for id in ids {
            guard let record = nodes[id], record.kind == "ScrollView" else { continue }
            guard let scroll = record.view as? UIScrollView else { continue }
            let anchor = record.declaredProps?.scrollAnchorOffset ?? 0
            let delta = anchor - record.anchorOffset
            record.anchorOffset = anchor
            let offset = scroll.contentOffset
            let children = topology.children(id).compactMap { nodes[$0] }
            let width = children.map { ($0.animation.declared["x"] ?? 0) + ($0.animation.declared["width"] ?? 0) }.max() ?? 0
            let height = children.map { ($0.animation.declared["y"] ?? 0) + ($0.animation.declared["height"] ?? 0) }.max() ?? 0
            record.content.frame = CGRect(x: 0, y: 0, width: max(scroll.bounds.width, width), height: max(scroll.bounds.height, height))
            scroll.contentSize = record.content.bounds.size
            if delta != 0 { scroll.contentOffset = CGPoint(x: offset.x, y: max(0, min(offset.y + delta, scroll.contentSize.height - scroll.bounds.height))) }
        }
    }
}

private extension UIView {
    func allDescendants() -> [UIView] { subviews.flatMap { [$0] + $0.allDescendants() } }
}

private func resizeMode(_ value: String?) -> UIView.ContentMode {
    switch value {
    case "contain": return .scaleAspectFit
    case "stretch": return .scaleToFill
    case "center": return .center
    default: return .scaleAspectFill
    }
}

private func resizeGravity(_ value: String?) -> AVLayerVideoGravity {
    switch value {
    case "contain": return .resizeAspect
    case "stretch": return .resize
    default: return .resizeAspectFill
    }
}

private func parseColor(_ value: String?) -> UIColor? {
    guard let value else { return nil }
    if value == "transparent" { return .clear }
    guard value.hasPrefix("#") else { return nil }
    let hex = String(value.dropFirst())
    guard hex.count == 6 || hex.count == 8, let packed = UInt64(hex, radix: 16) else { return nil }
    let rgb = hex.count == 8 ? packed >> 8 : packed
    let alpha = hex.count == 8 ? CGFloat(packed & 255) / 255 : 1
    return UIColor(red: CGFloat((rgb >> 16) & 255) / 255, green: CGFloat((rgb >> 8) & 255) / 255, blue: CGFloat(rgb & 255) / 255, alpha: alpha)
}

/// Owns at most one complete, bounded transaction. Chunk JSON is kept verbatim
/// until End so UTF-8 accounting is independent of Foundation number formatting.
final class RenderCommitBuffer {
    private var header: [String: Any]?
    private var chunks: [Int: String] = [:]
    private var bytes = 0
    private var count = 0
    private var through: UInt32 = 0
    private var last: [String: Any]?
    func reset(_ rejected: UInt32) { header = nil; chunks.removeAll(); bytes = 0; count = 0; through = max(through, rejected); last = nil }
    func accept(_ payload: [String: Any]) throws -> [String: Any]? {
        switch payload["type"] as? String {
        case "CommitBegin":
            guard let id = payload["transactionId"] as? UInt32, id > through,
                  let n = payload["chunkCount"] as? Int, n > 0, n <= 65536,
                  let size = payload["totalBytes"] as? Int, size > 0, size <= 16777216,
                  let commands = payload["commandCount"] as? Int, commands >= 0, commands <= 65536 else { throw RenderError.invalidCommit }
            if let header { guard NSDictionary(dictionary: header).isEqual(to: payload) else { throw RenderError.invalidCommit }; return nil }
            header = payload; chunks.removeAll(); bytes = 0; count = 0; return nil
        case "CommitChunk":
            guard let header, let id = payload["transactionId"] as? UInt32, id == header["transactionId"] as? UInt32,
                  let index = payload["index"] as? Int, index >= 0, index < (header["chunkCount"] as! Int),
                  let text = payload["data"] as? String, text.utf8.count <= 1048576,
                  let commands = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [[String: Any]], commands.count <= 4096 else { throw RenderError.invalidCommit }
            if let old = chunks[index] { guard old == text else { throw RenderError.invalidCommit }; return nil }
            bytes += text.utf8.count - 2 + (commands.isEmpty ? 0 : 1); count += commands.count
            guard bytes <= (header["totalBytes"] as! Int), count <= (header["commandCount"] as! Int) else { throw RenderError.invalidCommit }
            chunks[index] = text; return nil
        case "CommitEnd":
            if header == nil, payload["transactionId"] as? UInt32 == last?["revision"] as? UInt32 { return last }
            guard let header, payload["transactionId"] as? UInt32 == header["transactionId"] as? UInt32,
                  chunks.count == header["chunkCount"] as? Int, count == header["commandCount"] as? Int,
                  bytes + 1 == header["totalBytes"] as? Int else { throw RenderError.invalidCommit }
            let text = "[" + (0..<chunks.count).map { String(chunks[$0]!.dropFirst().dropLast()) }.joined(separator: ",") + "]"
            let commands = try JSONSerialization.jsonObject(with: Data(text.utf8))
            let result: [String: Any] = ["type": "Commit", "revision": header["revision"]!, "commands": commands]
            self.header = nil; chunks.removeAll(); last = result; return result
        default: return payload
        }
    }
}

/// Incremental preflight: retain committed topology and stage only this batch's
/// records/lists. No platform objects are touched until the whole batch passes.
final class RenderTopology {
    struct Entry { var kind: String; var parent: UInt32?; var children: [UInt32]; var props: RenderProps? }
    private var records: [UInt32: Entry] = [:]
    private var roots: [UInt32] = []
    func clear() { records.removeAll(); roots.removeAll() }
    var rootIds: [UInt32] { roots }
    func children(_ id: UInt32) -> [UInt32] { records[id]?.children ?? [] }
    func ancestors(_ id: UInt32) -> [UInt32] {
        var result: [UInt32] = [], next = id
        while next > 0, let record = records[next] { result.append(next); next = record.parent ?? 0 }
        return result
    }
    func descendants(_ id: UInt32) -> [UInt32] { [id] + children(id).flatMap { descendants($0) } }

    func prepare(_ commands: [RenderCommand]) throws -> () -> Void {
        var edits: [UInt32: Entry] = [:], removed = Set<UInt32>(), nextRoots = roots
        func get(_ id: UInt32) throws -> Entry {
            guard !removed.contains(id), let entry = edits[id] ?? records[id] else { throw RenderError.invalidCommand }; return entry
        }
        func list(_ id: UInt32) throws -> [UInt32] { id == 0 ? nextRoots : try get(id).children }
        func setList(_ id: UInt32, _ children: [UInt32]) throws {
            if id == 0 { nextRoots = children } else { var entry = try get(id); entry.children = children; edits[id] = entry }
        }
        func detach(_ id: UInt32) throws {
            var entry = try get(id)
            if let parent = entry.parent { try setList(parent, list(parent).filter { $0 != id }) }
            entry.parent = nil; edits[id] = entry
        }
        func remove(_ id: UInt32) throws { for child in try get(id).children { try remove(child) }; removed.insert(id); edits.removeValue(forKey:id) }
        let kinds = Set(["View","Text","RichText","TextInput","ScrollView","Image","Video","Native"])
        let events = Set(["tap","changeText","longPress","backPress","focus","blur","submit","scroll","scrollEnd","layout","touchDown","touchMove","touchUp","touchCancel","spanClick","loadSuccess","loadFailure","playStateDidChanged","playTimeDidChanged","firstFrameDidDisplay","nativeComponent"])
        for c in commands {
            guard c.nodeId > 0 else { throw RenderError.invalidCommand }
            if c.type == "CreateNode" {
                guard records[c.nodeId] == nil, edits[c.nodeId] == nil, !removed.contains(c.nodeId), let kind = c.kind, kinds.contains(kind) else { throw RenderError.invalidCommand }
                edits[c.nodeId] = Entry(kind:kind, parent:nil, children:[], props:nil); continue
            }
            var entry = try get(c.nodeId)
            switch c.type {
            case "InsertChild", "MoveChild":
                guard let parent = c.parentId, let index = c.index, index >= 0 else { throw RenderError.invalidCommand }
                if parent > 0 { guard ["View","ScrollView","Native"].contains(try get(parent).kind) else { throw RenderError.invalidCommand } }
                var ancestor = parent
                while ancestor > 0 { guard ancestor != c.nodeId else { throw RenderError.invalidCommand }; ancestor = try get(ancestor).parent ?? 0 }
                try detach(c.nodeId); var children = try list(parent)
                guard index <= children.count else { throw RenderError.invalidCommand }
                children.insert(c.nodeId,at:index); try setList(parent,children)
                entry = try get(c.nodeId); entry.parent = parent; edits[c.nodeId] = entry
            case "DetachChild": try detach(c.nodeId)
            case "RemoveNode": try detach(c.nodeId); try remove(c.nodeId)
            case "PatchProps":
                guard let set = c.set, let unset = c.unset else { throw RenderError.invalidCommand }
                let base = try entry.props ?? RenderProps.empty(); entry.props = try base.patched(set,unset); edits[c.nodeId] = entry
            case "SetProps": guard let props = c.props else { throw RenderError.invalidCommand }; entry.props = props; edits[c.nodeId] = entry
            case "SetFrame": guard let f = c.frame, [f.x,f.y,f.width,f.height].allSatisfy({$0.isFinite}), f.width >= 0, f.height >= 0 else { throw RenderError.invalidCommand }
            case "BindEvent": guard let event = c.event, events.contains(event), c.enabled != nil else { throw RenderError.invalidCommand }
            default: throw RenderError.invalidCommand
            }
        }
        return { [self] in for id in removed { records.removeValue(forKey:id) }; for (id,entry) in edits { records[id] = entry }; roots = nextRoots }
    }
}
