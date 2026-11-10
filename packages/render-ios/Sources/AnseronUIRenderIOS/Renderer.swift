import Foundation
import UIKit
import AVFoundation

public struct RenderFrame: Decodable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
}

public struct RenderProps: Decodable {
    public let text: String?
    public let spans: String?
    public let title: String?
    public let inputRevision: UInt32?
    public let value: String?
    public let placeholder: String?
    public let disabled: Bool?
    public let backgroundColor: String?
    public let color: String?
    public let animation: String?
    public let translateX: Double?
    public let translateY: Double?
    public let scaleX: Double?
    public let scaleY: Double?
    public let rotate: Double?
    public let opacity: Double?
    public let fontSize: Double?
    public let fontWeight: String?
    public let fontStyle: String?
    public let textAlign: String?
    public let borderColor: String?
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
    public let placeholderTextColor: String?
    public let accessibilityLabel: String?
    public let textDecorationLine: String?
    public let scrollEnabled: Bool?
    public let showsVerticalScrollIndicator: Bool?
    public let testID: String?
    public let src: String?
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
}

public struct RenderCommand: Decodable {
    public let type: String
    public let nodeId: UInt32
    public let kind: String?
    public let nativeName: String?
    public let parentId: UInt32?
    public let index: Int?
    public let props: RenderProps?
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

private final class NodeRecord {
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
    var mediaSource = ""
    var spanRanges: [NSRange] = []
    var videoLoop = false
    var videoRate: Float = 1
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
    public let root: UIView
    public var onEvent: ((RendererEvent) -> Void)?
    /// The first surface child's target background, after a successful commit.
    public var onPageBackgroundColor: ((UIColor) -> Void)?
    private var nodes: [UInt32: NodeRecord] = [:]
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

    public func apply(_ commit: RenderCommit) throws {
        guard commit.type == "Commit", commit.revision > revision, commit.commands.count <= 4096 else { throw RenderError.invalidCommit }
        try validate(commit.commands)
        do {
            for command in commit.commands { try applyOne(command) }
            for record in nodes.values { record.animation.commit() }
            revision = commit.revision
            updateScrollExtents()
            let page = root.subviews.first
            let color = nodes.values.first { $0.view === page }?.pageBackgroundColor ?? .clear
            onPageBackgroundColor?(color)
        } catch {
            clear()
            throw error
        }
    }

    public func clear() {
        touchSessions.removeAll()
        for record in nodes.values { releaseMedia(record) }
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
        if let native = record.native { return try native.invoke(method, args: args, completion: completion) }
        if method == "focus", let field = record.view as? UITextField { field.becomeFirstResponder() }
        else if method == "blur", let field = record.view as? UITextField { field.resignFirstResponder() }
        else if method == "scrollTo", let scroll = record.view as? UIScrollView,
                let args = args as? [String: Any], let x = args["x"] as? Double, let y = args["y"] as? Double, x.isFinite, y.isFinite {
            scroll.setContentOffset(CGPoint(x: x, y: y), animated: args["animated"] as? Bool ?? false)
        } else { throw NativeExtensionError.unsupportedMethod(method) }
        completion(.success(NSNull())); return nil
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
        case "Button":
            let button = UIButton(type: .system)
            button.titleLabel?.font = font
            button.setTitle(text, for: .normal)
            view = button
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

    private func validate(_ commands: [RenderCommand]) throws {
        var known = Set(nodes.keys)
        for command in commands {
            guard command.nodeId != 0 else { throw RenderError.invalidCommand }
            switch command.type {
            case "CreateNode":
                guard !known.contains(command.nodeId), ["View", "Text", "RichText", "Button", "TextInput", "ScrollView", "Image", "Video", "Native"].contains(command.kind ?? "") else { throw RenderError.invalidCommand }
                known.insert(command.nodeId)
            case "InsertChild", "MoveChild":
                guard known.contains(command.nodeId), let parent = command.parentId, parent == 0 || known.contains(parent), parent != command.nodeId, let index = command.index, index >= 0 else { throw RenderError.invalidCommand }
            case "RemoveNode":
                guard known.remove(command.nodeId) != nil else { throw RenderError.invalidCommand }
            case "SetProps":
                guard known.contains(command.nodeId), command.props != nil else { throw RenderError.invalidCommand }
            case "SetFrame":
                guard known.contains(command.nodeId), let frame = command.frame, frame.x.isFinite, frame.y.isFinite, frame.width.isFinite, frame.height.isFinite, frame.width >= 0, frame.height >= 0 else { throw RenderError.invalidCommand }
            case "BindEvent":
                guard known.contains(command.nodeId), ["tap", "changeText", "longPress", "backPress", "focus", "blur", "submit", "scroll", "scrollEnd", "layout", "touchDown", "touchMove", "touchUp", "touchCancel", "spanClick", "loadSuccess", "loadFailure", "playStateDidChanged", "playTimeDidChanged", "firstFrameDidDisplay", "nativeComponent"].contains(command.event ?? ""), command.enabled != nil else { throw RenderError.invalidCommand }
            default: throw RenderError.invalidCommand
            }
        }
    }

    private func applyOne(_ command: RenderCommand) throws {
        if command.type == "CreateNode" {
            let view: UIView
            let content: UIView
            var native: IOSNativeComponent?
            let extensionToken = UUID()
            switch command.kind {
            case "View": view = UIView(); content = view
            case "Text":
                let label = UILabel(); label.numberOfLines = 0
                view = label; content = label
            case "RichText":
                let label = UILabel(); label.numberOfLines = 0
                view = label; content = label
            case "Button":
                let button = UIButton(type: .system)
                button.addTarget(self, action: #selector(tapped(_:)), for: .touchUpInside)
                view = button; content = button
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
                let image = UIImageView(); image.contentMode = .scaleAspectFit; image.clipsToBounds = true
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
            nodes[command.nodeId] = record
            view.isUserInteractionEnabled = true
            view.isMultipleTouchEnabled = true
            if !(view is UIButton) {
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
            let targetIndex = min(index, target.subviews.count)
            if record.view.superview !== target || target.subviews.firstIndex(of: record.view) != targetIndex {
                record.view.removeFromSuperview()
                target.insertSubview(record.view, at: targetIndex)
            }
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
            if record.events.contains("layout") {
                DispatchQueue.main.async { [weak self] () -> Void in
                    guard let self, self.nodes[command.nodeId] === record else { return }
                    self.onEvent?(RendererEvent(type: "NativeEvent", nodeId: command.nodeId, revision: self.revision, event: "layout", x: frame.x, y: frame.y, contentWidth: frame.width, contentHeight: frame.height))
                }
            }
        case "BindEvent":
            guard let event = command.event, let enabled = command.enabled else { throw RenderError.invalidCommand }
            if enabled { record.events.insert(event) } else { record.events.remove(event) }
            for recognizer in record.view.gestureRecognizers ?? [] {
                if recognizer.name == "anseronui.tap" { recognizer.isEnabled = record.events.contains("tap") || record.events.contains("spanClick") }
                else if recognizer is UILongPressGestureRecognizer { recognizer.isEnabled = record.events.contains("longPress") }
            }
        default: throw RenderError.invalidCommand
        }
    }

    private func setProps(_ record: NodeRecord, _ props: RenderProps) throws {
        let view = record.view
        // Missing backgrounds are transparent, including when a prior color is removed.
        // An opaque UILabel with a nil background can draw a black backing surface.
        let backgroundColor = parseColor(props.backgroundColor) ?? .clear
        record.pageBackgroundColor = backgroundColor
        if let json = props.animation {
            guard let config = try decodeNativeJSON(json) as? [String: Any] else { throw NativeExtensionError.invalidArguments }
            record.animation.options = try TSAnimationOptions(config)
        } else { record.animation.options = nil }
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        backgroundColor.getRed(&r, green:&g, blue:&b, alpha:&a)
        record.animation.stage(["opacity":props.opacity ?? 1, "translateX":props.translateX ?? 0, "translateY":props.translateY ?? 0,
            "scaleX":props.scaleX ?? 1, "scaleY":props.scaleY ?? 1, "rotate":props.rotate ?? 0, "borderRadius":props.borderRadius ?? 0,
            "r":Double(r)*255,"g":Double(g)*255,"b":Double(b)*255,"a":Double(a)])
        view.layer.borderWidth = CGFloat(props.borderWidth ?? 0)
        view.layer.borderColor = parseColor(props.borderColor)?.cgColor
        view.clipsToBounds = view is UIScrollView || props.overflow == "hidden" || props.borderRadius != nil
        view.isHidden = props.visibility == "hidden"
        view.accessibilityIdentifier = props.testID
        record.touchAction = props.touchAction ?? "auto"
        view.accessibilityLabel = props.accessibilityLabel
        if let scroll = view as? UIScrollView {
            scroll.isScrollEnabled = props.scrollEnabled ?? true
            scroll.showsVerticalScrollIndicator = props.showsVerticalScrollIndicator ?? true
        }
        if let image = view as? UIImageView {
            image.contentMode = resizeMode(props.resizeMode)
            image.accessibilityLabel = props.accessibilityLabel
            let source = props.src ?? ""
            if source != record.mediaSource {
                record.mediaSource = source
                image.image = nil
                if let placeholder = props.placeholderSrc, let url = mediaURL(placeholder) { image.image = UIImage(contentsOfFile: url.path) }
                guard let url = mediaURL(source) else {
                    DispatchQueue.main.async { [weak self, weak record] in
                        guard let self, let record, record.mediaSource == source else { return }
                        self.emitMedia("loadFailure", id: self.nodeId(for: record), source: source, errorCode: 1)
                    }
                    return
                }
                if url.isFileURL {
                    image.image = UIImage(contentsOfFile: url.path)
                    DispatchQueue.main.async { [weak self, weak record] in
                        guard let self, let record, record.mediaSource == source else { return }
                        if image.image != nil { self.emitMedia("loadSuccess", id: self.nodeId(for: record), source: source) }
                        else { self.emitMedia("loadFailure", id: self.nodeId(for: record), source: source, errorCode: 1) }
                    }
                } else {
                    URLSession.shared.dataTask(with: url) { [weak image, weak record, weak self] data, _, error in
                        DispatchQueue.main.async {
                            guard let image, let record, let self, record.mediaSource == source else { return }
                            if let data, let loaded = UIImage(data: data) { image.image = loaded; self.emitMedia("loadSuccess", id: self.nodeId(for: record), source: source) }
                            else { self.emitMedia("loadFailure", id: self.nodeId(for: record), source: source, errorCode: 1) }
                        }
                    }.resume()
                }
            }
        }
        if let video = view as? TSVideoView {
            record.videoLoop = props.loop ?? false
            record.videoRate = Float(props.rate ?? 1)
            video.playerLayer.videoGravity = resizeGravity(props.resizeMode)
            video.playButton.isHidden = props.controls == false
            video.onToggle = { [weak self, weak record] in
                guard let self, let record, let player = record.player else { return }
                let playing = player.rate == 0
                if playing { player.playImmediately(atRate: record.videoRate) } else { player.pause() }
                self.emitMedia("playStateDidChanged", id: self.nodeId(for: record), source: record.mediaSource, state: playing ? "playing" : "paused")
            }
            let source = props.src ?? ""
            if source != record.mediaSource {
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
                            if record.videoLoop { player?.seek(to: .zero); player?.playImmediately(atRate: record.videoRate); return }
                            self.emitMedia("playStateDidChanged", id: self.nodeId(for: record), source: source, state: "ended")
                    }
                    record.timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self, weak record] time in
                        guard let self, let record else { return }
                        let duration = item.duration.seconds.isFinite ? item.duration.seconds : 0
                        self.emitMedia("playTimeDidChanged", id: self.nodeId(for: record), source: source, time: time.seconds, duration: duration)
                        if player.rate > 0 { self.emitMedia("playStateDidChanged", id: self.nodeId(for: record), source: source, state: "playing") }
                    }
                    if props.autoplay == true { player.playImmediately(atRate: record.videoRate) }
                } else {
                    DispatchQueue.main.async { [weak self, weak record] in
                        guard let self, let record, record.mediaSource == source else { return }
                        self.emitMedia("loadFailure", id: self.nodeId(for: record), source: source, errorCode: 1)
                    }
                }
            }
            record.player?.isMuted = props.muted ?? false
            if props.playControl == "play" { record.player?.playImmediately(atRate: record.videoRate); emitMedia("playStateDidChanged", id: nodeId(for: record), source: source, state: "playing") }
            else if props.playControl == "pause" { record.player?.pause(); emitMedia("playStateDidChanged", id: nodeId(for: record), source: source, state: "paused") }
            else if props.playControl == "stop" { record.player?.pause(); record.player?.seek(to: .zero); emitMedia("playStateDidChanged", id: nodeId(for: record), source: source, state: "paused") }
        }
        let fontSize = CGFloat(props.fontSize ?? 16)
        if let label = view as? UILabel {
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
        } else if let button = view as? UIButton {
            button.setTitle(props.title ?? "", for: .normal)
            button.titleLabel?.font = .systemFont(ofSize: fontSize)
            button.setTitleColor(parseColor(props.color) ?? .tintColor, for: .normal)
            button.setTitleColor(parseColor(props.color)?.withAlphaComponent(0.4) ?? .secondaryLabel, for: .disabled)
            button.isEnabled = !(props.disabled ?? false)
            button.accessibilityLabel = props.accessibilityLabel
        } else if let field = view as? UITextField {
            record.applyingValue = true
            if (props.inputRevision ?? 0) >= record.inputRevision && field.markedTextRange == nil {
                let value = props.value ?? ""
                if field.text != value { field.text = value }
                record.lastInputValue = value
            }
            field.placeholder = props.placeholder ?? ""
            field.font = .systemFont(ofSize: fontSize)
            field.textColor = parseColor(props.color) ?? .label
            field.isEnabled = props.editable ?? true
            field.isSecureTextEntry = props.secureTextEntry ?? false
            field.attributedPlaceholder = props.placeholder.map { NSAttributedString(string: $0, attributes: [.foregroundColor: parseColor(props.placeholderTextColor) ?? .placeholderText]) }
            field.keyboardType = props.keyboardType == "numeric" ? .numberPad : (props.keyboardType == "email-address" ? .emailAddress : (props.keyboardType == "phone-pad" ? .phonePad : (props.keyboardType == "url" ? .URL : .default)))
            field.returnKeyType = props.returnKeyType == "done" ? .done : (props.returnKeyType == "go" ? .go : (props.returnKeyType == "search" ? .search : (props.returnKeyType == "send" ? .send : .default)))
            field.autocapitalizationType = props.autoCapitalize == "characters" ? .allCharacters : (props.autoCapitalize == "words" ? .words : (props.autoCapitalize == "sentences" ? .sentences : .none))
            field.autocorrectionType = props.autoCorrect == false ? .no : .default
            field.accessibilityLabel = props.accessibilityLabel
            record.maxLength = props.maxLength
            field.delegate = props.maxLength == nil ? nil : self
            record.applyingValue = false
        }
    }

    private func releaseMedia(_ record: NodeRecord) {
        record.animation.cancel()
        record.native?.dispose(); record.native = nil
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

    @objc private func tapped(_ sender: UIButton) {
        // Commit any IME marked text before the following action enters the Core queue.
        root.endEditing(true)
        for record in nodes.values where record.kind == "TextInput" {
            if let field = record.view as? UITextField { publishInput(field, record: record, force: true) }
        }
        guard let (id, record) = nodes.first(where: { $0.value.view === sender }), record.events.contains("tap") else { return }
        onEvent?(RendererEvent(type: "Tap", nodeId: id, revision: revision, value: nil, inputRevision: nil))
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

    private func updateScrollExtents() {
        for record in nodes.values where record.kind == "ScrollView" {
            guard let scroll = record.view as? UIScrollView else { continue }
            let children = nodes.values.filter { $0.view.superview === record.content }
            let width = children.map { ($0.animation.declared["x"] ?? 0) + ($0.animation.declared["width"] ?? 0) }.max() ?? 0
            let height = children.map { ($0.animation.declared["y"] ?? 0) + ($0.animation.declared["height"] ?? 0) }.max() ?? 0
            record.content.frame = CGRect(x: 0, y: 0, width: max(scroll.bounds.width, width), height: max(scroll.bounds.height, height))
            scroll.contentSize = record.content.bounds.size
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
    guard let value, value.hasPrefix("#") else { return nil }
    let hex = String(value.dropFirst())
    guard hex.count == 6, let rgb = UInt32(hex, radix: 16) else { return nil }
    return UIColor(red: CGFloat((rgb >> 16) & 255) / 255, green: CGFloat((rgb >> 8) & 255) / 255, blue: CGFloat(rgb & 255) / 255, alpha: 1)
}
