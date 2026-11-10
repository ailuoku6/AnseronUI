import AppKit
import AVKit

/// Core frames use a top-left origin and logical points.
@MainActor public class FlippedView: NSView {
    public override var isFlipped: Bool { true }
    public override init(frame: NSRect) { super.init(frame:frame); autoresizesSubviews = false }
    public required init?(coder:NSCoder) { super.init(coder:coder); autoresizesSubviews = false }
}

private final class DesktopScrollView: NSScrollView {
    var allowsScroll = true
    override func scrollWheel(with event: NSEvent) { if allowsScroll { super.scrollWheel(with:event) } }
}

@MainActor private final class NodeRecord {
    let view: FlippedView
    var widget: NSView
    var content: NSView
    let kind: String
    lazy var animation = AnseronUINodeAnimation(view: view)
    var events = Set<String>()
    var clickRecognizer: NSClickGestureRecognizer?
    var pressRecognizer: NSPressGestureRecognizer?
    var parent: UInt32 = 0
    var background = NSColor.clear
    var inputRevision: UInt32 = 0
    var lastInputValue = ""
    var maxLength: Int?
    var source = ""
    var placeholderSource = ""
    var sourceToken = UUID()
    var imageTask: URLSessionDataTask?
    var placeholderTask: URLSessionDataTask?
    var imageLoaded = false
    var native: MacOSNativeComponent?
    var nativeToken = UUID()
    var observers: [NSObjectProtocol] = []
    var player: AVPlayer?
    var timeObserver: Any?
    var statusObserver: NSKeyValueObservation?
    var firstFrameObserver: NSKeyValueObservation?
    var loop = false
    var spans: [[String:Any]] = []
    var rateObserver: NSKeyValueObservation?
    var scrollEnd: DispatchWorkItem?
    var rate: Float = 1
    var desiredPlay = false
    var playControl: String?
    var autoplay = false
    var touchAction = "auto"
    var inputAutoCorrect = false
    var playbackState: String?
    var displayedFirstFrame = false
    init(view: FlippedView, widget: NSView, content: NSView, kind: String) {
        self.view = view; self.widget = widget; self.content = content; self.kind = kind
    }
}

/// AppKit is confined to MainActor. All callbacks enqueue protocol values in MacOSHost.
@MainActor public final class MacOSRenderer: NSObject, NSTextFieldDelegate, NSTextViewDelegate {
    public let root: NSView
    public var onEvent: ((RendererEvent) -> Void)?
    public var onPageBackgroundColor: ((NSColor) -> Void)?
    private var nodes: [UInt32: NodeRecord] = [:]
    private var revision: UInt32 = 0
    private let extensions: MacOSPlatformExtensions
    private var mouseMonitor: Any?
    private var windowObserver: NSObjectProtocol?
    private struct PointerSession {
        var owner: UInt32?
        var target: UInt32
        var page: NSPoint
        var start: NSPoint
        var scroll: UInt32?
        var origin: NSPoint = .zero
        var allowX = true
        var allowY = true
        var axis: Bool? // true is vertical; locked after the drag threshold.
        var scrolling = false
    }
    private var pointer: PointerSession?

    public init(root: NSView, extensions: MacOSPlatformExtensions? = nil) {
        self.root = root; self.extensions = extensions ?? MacOSPlatformExtensions()
        super.init()
        mouseMonitor = NSEvent.addLocalMonitorForEvents(matching:[.leftMouseDown,.leftMouseDragged,.leftMouseUp]) { [weak self] event in
            let consumed = MainActor.assumeIsolated { self?.receiveMouse(type:event.type,locationInWindow:event.locationInWindow,window:event.window) ?? false }
            return consumed ? nil : event
        }
        windowObserver = NotificationCenter.default.addObserver(forName:NSWindow.didResignKeyNotification,object:nil,queue:.main) { [weak self] note in
            MainActor.assumeIsolated {
                guard let self, let window = note.object as? NSWindow, window === self.root.window else { return }
                self.cancelPointer()
            }
        }
    }
    deinit {
        if let mouseMonitor { NSEvent.removeMonitor(mouseMonitor) }
        if let windowObserver { NotificationCenter.default.removeObserver(windowObserver) }
    }
    public func applyJSON(_ data: Data) throws { try apply(JSONDecoder().decode(RenderCommit.self, from: data)) }
    public func apply(_ commit: RenderCommit) throws {
        guard commit.type == "Commit", commit.revision > revision, commit.commands.count <= 4096 else { throw RenderError.invalidCommit }
        try validate(commit.commands)
        do {
            for command in commit.commands { try applyOne(command) }
            for record in nodes.values { record.animation.commit(); if record.widget !== record.view { record.widget.frame = record.view.bounds } }
            revision = commit.revision
            updateScrollExtents()
            onPageBackgroundColor?(nodes.values.first { $0.view === root.subviews.first }?.background ?? .clear)
        } catch { clear(); throw error }
    }
    public func clear() {
        for record in nodes.values { release(record) }
        pointer = nil; nodes.removeAll(); root.subviews.forEach { $0.removeFromSuperview() }; revision = 0
    }
    private func validate(_ commands: [RenderCommand]) throws {
        var parents = nodes.mapValues { $0.parent }
        for c in commands {
            guard c.nodeId != 0 else { throw RenderError.invalidCommand }
            switch c.type {
            case "CreateNode":
                guard parents[c.nodeId] == nil, ["View","Text","RichText","Button","TextInput","ScrollView","Image","Video","Native"].contains(c.kind ?? "") else { throw RenderError.invalidCommand }
                parents[c.nodeId] = 0
            case "RemoveNode":
                guard parents[c.nodeId] != nil else { throw RenderError.invalidCommand }
                var removed: Set<UInt32> = [c.nodeId]
                while true {
                    let next = Set(parents.filter { removed.contains($0.value) }.keys).union(removed)
                    if next == removed { break }; removed = next
                }
                for id in removed { parents.removeValue(forKey: id) }
            case "InsertChild", "MoveChild":
                guard parents[c.nodeId] != nil, let parent = c.parentId, parent == 0 || parents[parent] != nil,
                      let index = c.index, index >= 0 else { throw RenderError.invalidCommand }
                var ancestor = parent
                while ancestor != 0 {
                    guard ancestor != c.nodeId else { throw RenderError.invalidCommand }
                    ancestor = parents[ancestor] ?? 0
                }
                parents[c.nodeId] = parent
            case "SetFrame":
                guard parents[c.nodeId] != nil, let f = c.frame, [f.x,f.y,f.width,f.height].allSatisfy({ $0.isFinite }), f.width >= 0, f.height >= 0 else { throw RenderError.invalidCommand }
            case "SetProps": guard parents[c.nodeId] != nil, c.props != nil else { throw RenderError.invalidCommand }
            case "BindEvent": guard parents[c.nodeId] != nil, ["tap","changeText","longPress","backPress","focus","blur","submit","scroll","scrollEnd","layout","touchDown","touchMove","touchUp","touchCancel","spanClick","loadSuccess","loadFailure","playStateDidChanged","playTimeDidChanged","firstFrameDidDisplay","nativeComponent"].contains(c.event ?? ""), c.enabled != nil else { throw RenderError.invalidCommand }
            default: throw RenderError.invalidCommand
            }
        }
    }
    private func applyOne(_ c: RenderCommand) throws {
        if c.type == "CreateNode" { try create(c); return }
        guard let record = nodes[c.nodeId] else { throw RenderError.invalidCommand }
        switch c.type {
        case "RemoveNode":
            let removed = nodes.filter { $0.value.view === record.view || $0.value.view.isDescendant(of: record.view) }
            if let pointer, removed[pointer.target] != nil || pointer.owner.map({ removed[$0] != nil }) == true || pointer.scroll.map({ removed[$0] != nil }) == true { cancelPointer() }
            for (id, item) in removed { release(item); nodes.removeValue(forKey: id) }
            record.view.removeFromSuperview()
        case "InsertChild", "MoveChild":
            let parent = c.parentId!
            guard parent == 0 || nodes[parent]?.kind == "View" || nodes[parent]?.kind == "ScrollView" || nodes[parent]?.native?.contentView != nil else { throw RenderError.invalidCommand }
            guard let target = parent == 0 ? root : nodes[parent]?.content else { throw RenderError.invalidCommand }
            // Core emits MoveChild for every retained node. Detaching a view
            // that is already in place cancels NSButton mouse tracking when a
            // video time update commits between mouse down and mouse up.
            if record.view.superview === target,
               target.subviews.firstIndex(of:record.view) == min(c.index!,max(0,target.subviews.count-1)) {
                record.parent = parent
                break
            }
            record.view.removeFromSuperview()
            let index = min(c.index!, target.subviews.count)
            if index < target.subviews.count { target.addSubview(record.view, positioned:.below, relativeTo:target.subviews[index]) }
            else { target.addSubview(record.view) }
            record.parent = parent
        case "SetProps": try setProps(record, c.props!)
        case "SetFrame":
            let f = c.frame!
            record.animation.stage(["x":f.x,"y":f.y,"width":f.width,"height":f.height])
            if record.events.contains("layout") {
                DispatchQueue.main.async { [weak self, weak record] in
                    guard let self, let record, self.nodes[c.nodeId] === record else { return }
                    self.emit("layout", id: c.nodeId, x:f.x, y:f.y, width:f.width, height:f.height)
                }
            }
        case "BindEvent":
            if c.enabled! { record.events.insert(c.event!) } else { record.events.remove(c.event!) }
            updateRecognizers(record)
        default: throw RenderError.invalidCommand
        }
    }
    private func create(_ c: RenderCommand) throws {
        let view = FlippedView(); view.wantsLayer = true
        var widget: NSView = view, content: NSView = view
        var native: MacOSNativeComponent?
        let token = UUID()
        switch c.kind {
        case "View": break
        case "Text", "RichText":
            let label = DesktopTextField(frame: .zero)
            label.isSelectable = false; label.maximumNumberOfLines = 0
            widget = label; content = label
        case "Button":
            let button = NSButton(title: "", target:self, action:#selector(tapped(_:)))
            button.bezelStyle = .rounded; widget = button; content = button
        case "TextInput":
            let field = NSTextField(); field.delegate = self
            field.target = self; field.action = #selector(submitted(_:))
            field.isBezeled = false; field.drawsBackground = false
            widget = field; content = field
        case "ScrollView":
            let scroll = DesktopScrollView(); scroll.drawsBackground = false; scroll.borderType = .noBorder
            scroll.hasVerticalScroller = true; scroll.autohidesScrollers = true
            let document = FlippedView(); scroll.documentView = document
            widget = scroll; content = document
        case "Image": let image = DesktopImageView(); widget = image; content = image
        case "Video": let video = AVPlayerView(); video.controlsStyle = .inline; widget = video; content = video
        case "Native":
            guard let name = c.nativeName, let factory = extensions.components[name] else { throw RenderError.invalidCommand }
            let instance = try factory { [weak self] name, args in
                DispatchQueue.main.async { [weak self] in
                    guard let self, let r = self.nodes[c.nodeId], r.nativeToken == token,
                          let json = try? encodeNativeJSON(["name":name,"data":args]) else { return }
                    self.emit("nativeComponent", id:c.nodeId, value:json)
                }
            }
            native = instance; widget = instance.view; content = instance.contentView ?? instance.view
        default: throw RenderError.invalidCommand
        }
        if widget !== view { widget.frame = view.bounds; widget.autoresizingMask = [.width,.height]; view.addSubview(widget) }
        let record = NodeRecord(view:view, widget:widget, content:content, kind:c.kind!)
        record.native = native; record.nativeToken = token; nodes[c.nodeId] = record
        if let scroll = widget as? NSScrollView {
            scroll.contentView.postsBoundsChangedNotifications = true
            record.observers.append(NotificationCenter.default.addObserver(forName:NSView.boundsDidChangeNotification, object:scroll.contentView, queue:.main) { [weak self, weak record] _ in
                MainActor.assumeIsolated {
                guard let self, let record, self.nodes[c.nodeId] === record else { return }
                let offset = scroll.contentView.bounds.origin
                self.emit("scroll", id:c.nodeId, x:offset.x, y:offset.y, width:record.content.frame.width, height:record.content.frame.height)
                record.scrollEnd?.cancel()
                let end = DispatchWorkItem { [weak self, weak record] in
                    guard let self, let record, self.nodes[c.nodeId] === record else { return }
                    self.emit("scrollEnd",id:c.nodeId,x:scroll.contentView.bounds.minX,y:scroll.contentView.bounds.minY,width:record.content.frame.width,height:record.content.frame.height)
                }
                record.scrollEnd = end; DispatchQueue.main.asyncAfter(deadline:.now()+0.15,execute:end)
                }
            })
        }
    }
    private func updateRecognizers(_ r:NodeRecord) {
        // Unbound recognizers on every wrapper compete with child NSButton /
        // AVPlayerView mouse handling. Install only the gestures Core requests.
        let clickView = r.widget is DesktopTextField ? r.widget : r.view
        let needsClick = (r.events.contains("tap") || r.events.contains("spanClick")) && !["Button","TextInput","Video","ScrollView","Native"].contains(r.kind)
        if needsClick, r.clickRecognizer == nil {
            let click = NSClickGestureRecognizer(target:self,action:#selector(clicked(_:)))
            clickView.addGestureRecognizer(click); r.clickRecognizer = click
        } else if !needsClick, let click = r.clickRecognizer {
            click.view?.removeGestureRecognizer(click); r.clickRecognizer = nil
        }
        if r.events.contains("longPress"), r.pressRecognizer == nil {
            let press = NSPressGestureRecognizer(target:self,action:#selector(pressed(_:)))
            press.minimumPressDuration = 0.5; r.view.addGestureRecognizer(press); r.pressRecognizer = press
        } else if !r.events.contains("longPress"), let press = r.pressRecognizer {
            press.view?.removeGestureRecognizer(press); r.pressRecognizer = nil
        }
    }
    private func setProps(_ r: NodeRecord, _ p: RenderProps) throws {
        r.touchAction = p.touchAction ?? "auto"
        r.background = parseColor(p.backgroundColor) ?? .clear
        if let config = p.animation { guard let options = try decodeNativeJSON(config) as? [String:Any] else { throw NativeExtensionError.invalidArguments }; r.animation.options = try TSAnimationOptions(options) }
        else { r.animation.options = nil }
        let color = r.background.usingColorSpace(.sRGB) ?? .clear
        r.animation.stage(["opacity":p.opacity ?? 1,"translateX":p.translateX ?? 0,"translateY":p.translateY ?? 0,"scaleX":p.scaleX ?? 1,"scaleY":p.scaleY ?? 1,"rotate":p.rotate ?? 0,"borderRadius":p.borderRadius ?? 0,"r":color.redComponent*255,"g":color.greenComponent*255,"b":color.blueComponent*255,"a":color.alphaComponent])
        r.view.layer?.borderWidth = p.borderWidth ?? 0; r.view.layer?.borderColor = parseColor(p.borderColor)?.cgColor
        r.view.layer?.masksToBounds = p.overflow == "hidden" || p.borderRadius != nil || r.kind == "ScrollView"
        r.view.isHidden = p.visibility == "hidden"
        if r.kind == "TextInput", let field = r.widget as? NSTextField, (field is NSSecureTextField) != (p.secureTextEntry == true) {
            let wasEditing = field.currentEditor() != nil
            if wasEditing { root.window?.makeFirstResponder(nil) }
            let replacement: NSTextField = p.secureTextEntry == true ? NSSecureTextField() : NSTextField()
            replacement.frame = field.frame; replacement.autoresizingMask = [.width,.height]
            replacement.stringValue = field.stringValue; replacement.delegate = self; replacement.target = self; replacement.action = #selector(submitted(_:))
            replacement.isBezeled = false; replacement.drawsBackground = false
            field.removeFromSuperview(); r.view.addSubview(replacement); r.widget = replacement; r.content = replacement
            if wasEditing { root.window?.makeFirstResponder(replacement) }
        }
        r.widget.identifier = p.testID.map { NSUserInterfaceItemIdentifier($0) }
        r.widget.setAccessibilityIdentifier(p.testID); r.widget.setAccessibilityLabel(p.accessibilityLabel)
        let font = textFont(size:p.fontSize ?? 14, weight:p.fontWeight, style:p.fontStyle)
        if let label = r.widget as? NSTextField, r.kind == "Text" || r.kind == "RichText" {
            r.spans = p.spans.flatMap { try? JSONSerialization.jsonObject(with:Data($0.utf8)) as? [[String:Any]] } ?? []
            label.attributedStringValue = attributed(text:p.text ?? "", font:font, props:p)
            label.maximumNumberOfLines = p.numberOfLines ?? 0
            label.lineBreakMode = lineBreak(p)
        }
        if let button = r.widget as? NSButton {
            button.title = p.title ?? ""; button.font = font; button.isEnabled = !(p.disabled ?? false)
            button.contentTintColor = parseColor(p.color)
        }
        if let field = r.widget as? NSTextField, r.kind == "TextInput" {
            r.maxLength = p.maxLength
            field.font = font; field.textColor = parseColor(p.color) ?? .labelColor
            field.isEditable = p.editable != false && p.disabled != true
            field.isSelectable = p.disabled != true
            field.isEnabled = p.disabled != true; field.placeholderString = p.placeholder
            field.placeholderAttributedString = p.placeholder.map { NSAttributedString(string:$0,attributes:[.font:font,.foregroundColor:parseColor(p.placeholderTextColor) ?? .placeholderTextColor]) }
            r.inputAutoCorrect = p.autoCorrect ?? false
            let editor = field.currentEditor() as? NSTextView
            editor?.isAutomaticSpellingCorrectionEnabled = r.inputAutoCorrect
            if editor?.hasMarkedText() != true, p.inputRevision == nil || p.inputRevision! >= r.inputRevision {
                let value = p.value ?? ""
                if field.stringValue != value {
                    let selection = editor?.selectedRange()
                    field.stringValue = value
                    if let editor, let selection { editor.setSelectedRange(NSRange(location:min(selection.location,(value as NSString).length),length:0)) }
                }
                r.lastInputValue = value
            }
            // Preserve the native editor while applying controlled values outside composition.
            if let cell = field.cell as? NSTextFieldCell { cell.wraps = false; cell.isScrollable = true }
        }
        if let scroll = r.widget as? DesktopScrollView { scroll.allowsScroll = p.scrollEnabled != false; scroll.hasVerticalScroller = p.showsVerticalScrollIndicator != false; scroll.verticalScrollElasticity = p.scrollEnabled == false ? .none : .automatic }
        if let image = r.widget as? DesktopImageView {
            image.resizeMode = p.resizeMode ?? "contain"
            try loadImage(r, image:image, source:p.src ?? "", placeholder:p.placeholderSrc)
        }
        if let video = r.widget as? AVPlayerView { try configureVideo(r, view:video, props:p) }
        if let native = r.native {
            guard let props = try decodeNativeJSON(p.nativeProps ?? "{}") as? [String:Any] else { throw NativeExtensionError.invalidArguments }
            try native.setProps(props)
        }
    }
    public func measure(kind: String, text: String, fontSize: Double, maxWidth: Double, props: RenderProps?) throws -> (width:Double,height:Double,baseline:Double) {
        guard fontSize.isFinite, fontSize > 0, maxWidth.isFinite, maxWidth >= 0 else { throw RenderError.invalidCommand }
        let font = textFont(size:fontSize,weight:props?.fontWeight,style:props?.fontStyle)
        let string = attributed(text:text.isEmpty ? " " : text,font:font,props:props)
        let inset = kind == "Button" ? CGSize(width:20,height:12) : (kind == "TextInput" ? CGSize(width:4,height:4) : .zero)
        let layout = DesktopTextLayout(string, size:NSSize(width:max(0,maxWidth-inset.width),height:CGFloat.greatestFiniteMagnitude), lines:props?.numberOfLines ?? 0, lineBreak:lineBreak(props))
        let rect = layout.usedRect
        return (min(maxWidth,ceil(rect.width+inset.width)),ceil(rect.height+inset.height),font.ascender+inset.height/2)
    }
    public func invoke(nodeId: UInt32, method: String, args: Any, completion: @escaping NativeCompletion) throws -> (() -> Void)? {
        guard let r = nodes[nodeId] else { throw NativeExtensionError.nodeUnmounted }
        if method == "animate" { try r.animation.animate(args) { completion(.success(["finished":$0])) }; return { r.animation.cancel() } }
        if method == "cancelAnimation" { r.animation.cancel(); completion(.success(NSNull())); return nil }
        if let native = r.native { return try native.invoke(method,args:args,completion:completion) }
        switch method {
        case "measure":
            let frame = r.view.convert(r.view.bounds, to:root)
            completion(.success(["x":frame.minX,"y":frame.minY,"width":frame.width,"height":frame.height])); return nil
        case "focus": root.window?.makeFirstResponder(r.widget)
        case "blur": if root.window?.firstResponder === (r.widget as? NSTextField)?.currentEditor() { root.window?.makeFirstResponder(nil) }
        case "scrollTo":
            guard let scroll = r.widget as? NSScrollView, let value = args as? [String:Any], let x = value["x"] as? Double, let y = value["y"] as? Double, x.isFinite, y.isFinite else { throw NativeExtensionError.invalidArguments }
            scroll.contentView.scroll(to:NSPoint(x:x,y:y)); scroll.reflectScrolledClipView(scroll.contentView)
        default: throw NativeExtensionError.unsupportedMethod(method)
        }
        completion(.success(NSNull())); return nil
    }
    private func updateScrollExtents() {
        for r in nodes.values where r.kind == "ScrollView" {
            r.content.frame.size = NSSize(width:max(r.widget.bounds.width,r.content.subviews.map { $0.frame.maxX }.max() ?? 0),height:max(r.widget.bounds.height,r.content.subviews.map { $0.frame.maxY }.max() ?? 0))
        }
    }
    private func id(for view:NSView) -> UInt32? { nodes.first { $0.value.widget === view || $0.value.view === view }?.key }
    private func emit(_ event:String,id:UInt32,value:String? = nil,x:Double? = nil,y:Double? = nil,width:Double? = nil,height:Double? = nil) {
        guard let r = nodes[id], r.events.contains(event) else { return }
        onEvent?(RendererEvent(type:"NativeEvent",nodeId:id,revision:revision,value:value,event:event,x:x,y:y,contentWidth:width,contentHeight:height))
    }
    @objc private func tapped(_ sender:NSButton) {
        root.window?.makeFirstResponder(nil)
        guard let id = id(for:sender), nodes[id]?.events.contains("tap") == true else { return }
        onEvent?(RendererEvent(type:"Tap",nodeId:id,revision:revision))
    }
    @objc private func clicked(_ sender:NSClickGestureRecognizer) {
        guard let view = sender.view, let id = id(for:view), let r = nodes[id] else { return }
        if r.events.contains("spanClick"), let label = r.widget as? DesktopTextField, !r.spans.isEmpty {
            if let character = label.textLayout().character(at:sender.location(in:label)) {
                var start = 0
                for (index,span) in r.spans.enumerated() {
                    let length = ((span["text"] as? String ?? "") as NSString).length
                    if NSLocationInRange(character,NSRange(location:start,length:length)) { emit("spanClick",id:id,value:String(index)); return }; start += length
                }
            }
        }
        if r.events.contains("tap") { onEvent?(RendererEvent(type:"Tap",nodeId:id,revision:revision)) }
    }
    /// Returns true once a drag belongs to scrolling, so native recognizers do
    /// not turn the same gesture into a click or a long press.
    @discardableResult func receiveMouse(type:NSEvent.EventType,locationInWindow:NSPoint,window:NSWindow?) -> Bool {
        guard window === root.window, root.window != nil else { return false }
        let page = root.convert(locationInWindow,from:nil)
        if type == .leftMouseDown {
            cancelPointer()
            // AppKit hitTest takes a point in the superview's coordinates.
            guard root.bounds.contains(page), var view = root.hitTest(root.convert(page,to:root.superview)) else { return false }
            var target:UInt32?, owner:UInt32?, scrollID:UInt32?
            var allowX = true, allowY = true, nativeInteraction = false
            while view !== root {
                if view is NSScroller { nativeInteraction = true }
                if let id = id(for:view), let record = nodes[id] {
                    if target == nil { target = id }
                    if owner == nil, !record.events.isDisjoint(with:["touchDown","touchMove","touchUp","touchCancel"]) { owner = id }
                    if scrollID == nil {
                        allowX = allowX && record.touchAction != "none" && record.touchAction != "pan-y"
                        allowY = allowY && record.touchAction != "none" && record.touchAction != "pan-x"
                        if let scroll = record.widget as? DesktopScrollView, scroll.allowsScroll { scrollID = id }
                    }
                    if ["Button","TextInput","Video","Native"].contains(record.kind) { nativeInteraction = true }
                }
                guard let parent = view.superview else { break }; view = parent
            }
            if let target {
                pointer = PointerSession(owner:owner,target:target,page:page,start:page,scroll:nativeInteraction ? nil : scrollID,
                    origin:scrollID.flatMap { (nodes[$0]?.widget as? NSScrollView)?.contentView.bounds.origin } ?? .zero,
                    allowX:allowX,allowY:allowY)
            }
        }
        guard var session = pointer, nodes[session.target] != nil else { return false }
        session.page = page
        if type == .leftMouseDragged, let id = session.scroll, let scroll = nodes[id]?.widget as? DesktopScrollView, scroll.allowsScroll {
            let dx = page.x-session.start.x, dy = page.y-session.start.y
            if session.axis == nil, max(abs(dx),abs(dy)) >= 5 {
                let vertical = abs(dy) >= abs(dx)
                session.axis = vertical
                let extent = scroll.documentView?.frame.size ?? .zero
                session.scrolling = vertical ? session.allowY && extent.height > scroll.contentSize.height : session.allowX && extent.width > scroll.contentSize.width
                if session.scrolling {
                    emitPointer("touchCancel",session:session)
                    session.owner = nil
                    // Cancel pending press/click recognition throughout the hit path.
                    var ancestor:NSView? = nodes[session.target]?.view
                    while let view = ancestor, view !== root {
                        for gesture in view.gestureRecognizers where gesture.isEnabled { gesture.isEnabled = false; gesture.isEnabled = true }
                        ancestor = view.superview
                    }
                }
            }
            if session.scrolling {
                let extent = scroll.documentView?.frame.size ?? .zero
                let x = session.axis == false ? min(max(0,session.origin.x-dx),max(0,extent.width-scroll.contentSize.width)) : scroll.contentView.bounds.minX
                let y = session.axis == true ? min(max(0,session.origin.y-dy),max(0,extent.height-scroll.contentSize.height)) : scroll.contentView.bounds.minY
                scroll.contentView.scroll(to:NSPoint(x:x,y:y)); scroll.reflectScrolledClipView(scroll.contentView)
            }
        }
        pointer = session
        if !session.scrolling {
            emitPointer(type == .leftMouseDown ? "touchDown" : (type == .leftMouseUp ? "touchUp" : "touchMove"),session:session)
        }
        if type == .leftMouseUp { pointer = nil }
        return session.scrolling
    }
    private func emitPointer(_ name:String,session:PointerSession) {
        guard let owner = session.owner, nodes[owner] != nil, let record = nodes[session.target] else { return }
        let page = session.page, local = record.view.convert(page,from:root)
        onEvent?(RendererEvent(type:"NativeEvent",nodeId:owner,revision:revision,event:name,x:local.x,y:local.y,pageX:page.x,pageY:page.y,pointerId:1,touches:["touchUp","touchCancel"].contains(name) ? [] : [["x":local.x,"y":local.y,"pageX":page.x,"pageY":page.y,"pointerId":1]],targetId:session.target))
    }
    private func cancelPointer() {
        guard let session = pointer else { return }
        pointer = nil
        if !session.scrolling { emitPointer("touchCancel",session:session) }
    }
    @objc private func pressed(_ sender:NSPressGestureRecognizer) {
        guard sender.state == .began, let view = sender.view, let id = id(for:view) else { return }; emit("longPress",id:id)
    }
    @objc private func submitted(_ sender:NSTextField) {
        guard let id = id(for:sender), (sender.currentEditor() as? NSTextView)?.hasMarkedText() != true else { return }
        publishInput(sender); emit("submit",id:id,value:sender.stringValue)
    }
    public func controlTextDidBeginEditing(_ obj:Notification) {
        guard let field = obj.object as? NSTextField, let id = id(for:field) else { return }
        (field.currentEditor() as? NSTextView)?.isAutomaticSpellingCorrectionEnabled = nodes[id]?.inputAutoCorrect ?? false
        emit("focus",id:id)
    }
    public func controlTextDidEndEditing(_ obj:Notification) { guard let field = obj.object as? NSTextField, let id = id(for:field) else { return }; publishInput(field); emit("blur",id:id) }
    public func controlTextDidChange(_ obj:Notification) {
        guard let field = obj.object as? NSTextField, let id = id(for:field), let r = nodes[id] else { return }
        r.inputRevision &+= 1; publishInput(field)
    }
    private func publishInput(_ field:NSTextField) {
        guard let id = id(for:field), let r = nodes[id], (field.currentEditor() as? NSTextView)?.hasMarkedText() != true else { return }
        if let limit = r.maxLength, field.stringValue.count > limit { field.stringValue = String(field.stringValue.prefix(limit)) }
        let value = field.stringValue
        guard r.events.contains("changeText"), value != r.lastInputValue else { return }
        r.lastInputValue = value
        onEvent?(RendererEvent(type:"InputChange",nodeId:id,revision:revision,value:value,inputRevision:r.inputRevision))
    }
    private func release(_ r:NodeRecord) {
        r.scrollEnd?.cancel(); r.scrollEnd = nil; r.animation.cancel(); r.imageTask?.cancel(); r.imageTask = nil
        r.placeholderTask?.cancel(); r.placeholderTask = nil; r.native?.dispose(); r.native = nil
        r.observers.forEach(NotificationCenter.default.removeObserver); r.observers.removeAll()
        r.player?.pause(); if let token = r.timeObserver { r.player?.removeTimeObserver(token) }
        r.timeObserver = nil; r.rateObserver = nil; r.statusObserver = nil; r.firstFrameObserver = nil; r.player = nil
        (r.widget as? AVPlayerView)?.player = nil
    }
    private func mediaURL(_ source:String) -> URL? {
        if source.hasPrefix("asset://") {
            let name = String(source.dropFirst(8))
            guard name.range(of:"^[A-Za-z0-9_-][A-Za-z0-9_.-]*$",options:.regularExpression) != nil else { return nil }
            return Bundle.main.resourceURL?.appendingPathComponent("assets").appendingPathComponent(name)
        }
        guard let url = URL(string:source), ["http","https","file"].contains(url.scheme?.lowercased() ?? "") else { return nil }; return url
    }
    private func loadImage(_ r:NodeRecord,image:NSImageView,source:String,placeholder:String?) throws {
        guard source != r.source || (placeholder ?? "") != r.placeholderSource else { return }
        r.imageTask?.cancel(); r.placeholderTask?.cancel(); r.source = source; r.sourceToken = UUID(); r.imageLoaded = false
        r.placeholderSource = placeholder ?? ""
        let token = r.sourceToken
        image.image = nil
        guard let id = id(for:image) else { return }
        if let placeholderURL = placeholder.flatMap(mediaURL) {
            let showPlaceholder: (NSImage?) -> Void = { [weak self, weak r, weak image] loaded in
                guard let self, let r, self.nodes[id] === r, r.sourceToken == token, !r.imageLoaded else { return }
                image?.image = loaded
            }
            // NSImage(contentsOf: remoteURL) blocks AppKit while downloading.
            if placeholderURL.isFileURL { image.image = NSImage(contentsOf:placeholderURL) }
            else {
                r.placeholderTask = URLSession.shared.dataTask(with:placeholderURL) { data,response,error in
                    DispatchQueue.main.async { showPlaceholder(error == nil && (response as? HTTPURLResponse).map { (200...299).contains($0.statusCode) } != false ? data.flatMap(NSImage.init(data:)) : nil) }
                }; r.placeholderTask?.resume()
            }
        }
        let finish: (NSImage?) -> Void = { [weak self, weak r, weak image] loaded in
            guard let self, let r, self.nodes[id] === r, r.sourceToken == token else { return }
            r.imageLoaded = loaded != nil
            if let loaded { image?.image = loaded; r.placeholderTask?.cancel(); r.placeholderTask = nil }
            self.emitMedia(loaded == nil ? "loadFailure" : "loadSuccess",id:id,source:source,error:loaded == nil ? 1 : nil)
        }
        guard let url = mediaURL(source) else { DispatchQueue.main.async { finish(nil) }; return }
        if url.isFileURL { let loaded = NSImage(contentsOf:url); DispatchQueue.main.async { finish(loaded) } }
        else {
            r.imageTask = URLSession.shared.dataTask(with:url) { data,response,error in
                DispatchQueue.main.async { finish(error == nil && (response as? HTTPURLResponse).map { (200...299).contains($0.statusCode) } != false ? data.flatMap(NSImage.init(data:)) : nil) }
            }; r.imageTask?.resume()
        }
    }
    private func configureVideo(_ r:NodeRecord,view:AVPlayerView,props p:RenderProps) throws {
        let sourceChanged = (p.src ?? "") != r.source
        let playbackChanged = sourceChanged || p.playControl != r.playControl || (p.autoplay ?? false) != r.autoplay
        let rateChanged = Float(p.rate ?? 1) != r.rate
        r.loop = p.loop ?? false; r.rate = Float(p.rate ?? 1)
        r.playControl = p.playControl; r.autoplay = p.autoplay ?? false
        if playbackChanged { r.desiredPlay = p.playControl == "play" || (p.playControl == nil && r.autoplay) }
        view.controlsStyle = p.controls == false ? .none : .inline
        view.videoGravity = p.resizeMode == "cover" ? .resizeAspectFill : (p.resizeMode == "stretch" ? .resize : .resizeAspect)
        if sourceChanged {
            if let token = r.timeObserver { r.player?.removeTimeObserver(token) }; r.timeObserver = nil
            r.player?.pause(); r.rateObserver = nil; r.statusObserver = nil; r.firstFrameObserver = nil
            r.observers.forEach(NotificationCenter.default.removeObserver); r.observers.removeAll()
            r.source = p.src ?? ""; r.sourceToken = UUID(); let token = r.sourceToken
            r.playbackState = nil; r.displayedFirstFrame = false
            r.player = nil; view.player = nil
            guard let id = id(for:view) else { return }
            guard let url = mediaURL(r.source) else {
                DispatchQueue.main.async { [weak self, weak r] in
                    guard let self, let r, self.nodes[id] === r, r.sourceToken == token else { return }
                    self.emitMedia("loadFailure",id:id,source:r.source,error:1)
                    self.emitPlaybackState(r,id:id,state:"error")
                }
                return
            }
            let player = AVPlayer(url:url); r.player = player; view.player = player
            r.firstFrameObserver = view.observe(\.isReadyForDisplay,options:[.initial,.new]) { [weak self, weak r] video,_ in
                guard video.isReadyForDisplay else { return }
                DispatchQueue.main.async {
                    guard let self, let r, self.nodes[id] === r, r.sourceToken == token, !r.displayedFirstFrame else { return }
                    r.displayedFirstFrame = true
                    self.emitMedia("firstFrameDidDisplay",id:id,source:r.source)
                }
            }
            r.rateObserver = player.observe(\.rate,options:[.new]) { [weak self, weak r] player,_ in
                let playing = player.rate != 0
                DispatchQueue.main.async {
                    guard let self, let r, self.nodes[id] === r, r.sourceToken == token else { return }
                    if r.playbackState == "ended" || r.playbackState == "error" { if !playing { return } }
                    self.emitPlaybackState(r,id:id,state:playing ? "playing" : "paused")
                }
            }
            r.statusObserver = player.currentItem?.observe(\.status,options:[.initial,.new]) { [weak self, weak r] item,_ in
                DispatchQueue.main.async {
                    guard let self, let r, self.nodes[id] === r, r.sourceToken == token else { return }
                    if item.status == .readyToPlay { self.emitMedia("loadSuccess",id:id,source:r.source); if r.desiredPlay { r.player?.playImmediately(atRate:r.rate) } }
                    else if item.status == .failed {
                        self.emitMedia("loadFailure",id:id,source:r.source,error:1)
                        self.emitPlaybackState(r,id:id,state:"error")
                    }
                }
            }
            r.timeObserver = player.addPeriodicTimeObserver(forInterval:CMTime(seconds:0.25,preferredTimescale:600),queue:.main) { [weak self, weak r] time in
                MainActor.assumeIsolated {
                guard let self, let r, self.nodes[id] === r, r.sourceToken == token, time.seconds.isFinite else { return }
                self.emitMedia("playTimeDidChanged",id:id,source:r.source,value:String((time.seconds * 1000).rounded()),duration:r.player?.currentItem.map { ($0.duration.seconds * 1000).rounded() })
                }
            }
            r.observers.append(NotificationCenter.default.addObserver(forName:.AVPlayerItemDidPlayToEndTime,object:player.currentItem,queue:.main) { [weak self, weak r] _ in
                MainActor.assumeIsolated {
                guard let self, let r, self.nodes[id] === r, r.sourceToken == token else { return }
                if r.loop {
                    r.player?.seek(to:.zero) { [weak self, weak r] finished in
                        DispatchQueue.main.async {
                            guard finished, let self, let r, self.nodes[id] === r, r.sourceToken == token else { return }
                            r.player?.playImmediately(atRate:r.rate)
                        }
                    }
                } else { self.emitPlaybackState(r,id:id,state:"ended") }
                }
            })
        }
        r.player?.isMuted = p.muted ?? false
        // Re-renders (for example onTimeUpdate -> state) must not undo native
        // controls or repeatedly seek a stopped video back to its beginning.
        if playbackChanged {
            if r.desiredPlay { r.player?.playImmediately(atRate:r.rate) } else { r.player?.pause() }
            if p.playControl == "stop" { r.player?.seek(to:.zero) }
            if !r.desiredPlay, r.player != nil, let id = id(for:view) {
                // An already-ended player has rate zero: pause() emits no KVO
                // change, but a reset must still leave the ended UI state.
                DispatchQueue.main.async { [weak self, weak r] in
                    guard let self, let r, self.nodes[id] === r, !r.desiredPlay, r.playbackState != "error" else { return }
                    self.emitPlaybackState(r,id:id,state:"paused")
                }
            }
        } else if rateChanged, r.player?.rate != 0 { r.player?.rate = r.rate }
    }
    private func emitPlaybackState(_ record:NodeRecord,id:UInt32,state:String) {
        guard record.playbackState != state else { return }
        record.playbackState = state
        emitMedia("playStateDidChanged",id:id,source:record.source,state:state)
    }
    private func emitMedia(_ event:String,id:UInt32,source:String,value:String? = nil,state:String? = nil,duration:Double? = nil,error:Double? = nil) {
        guard nodes[id]?.events.contains(event) == true else { return }
        onEvent?(RendererEvent(type:"NativeEvent",nodeId:id,revision:revision,value:value,event:event,x:event == "playTimeDidChanged" ? value.flatMap(Double.init) : nil,source:source,state:state,duration:duration.flatMap { $0.isFinite ? $0 : nil },errorCode:error))
    }
    private func parseColor(_ value:String?) -> NSColor? {
        guard let value else { return nil }
        if value == "transparent" { return .clear }
        guard value.range(of:"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$",options:.regularExpression) != nil, let hex = UInt64(value.dropFirst(),radix:16) else { return nil }
        let alpha = value.count == 9 ? Double(hex & 255)/255 : 1
        let rgb = value.count == 9 ? hex >> 8 : hex
        return NSColor(srgbRed:Double((rgb >> 16)&255)/255,green:Double((rgb >> 8)&255)/255,blue:Double(rgb&255)/255,alpha:alpha)
    }
    private func textFont(size:Double,weight:String?,style:String?) -> NSFont {
        let font = NSFont.systemFont(ofSize:size,weight:weight == "bold" ? .bold : .regular)
        return style == "italic" ? NSFontManager.shared.convert(font,toHaveTrait:.italicFontMask) : font
    }
    private func lineBreak(_ p:RenderProps?) -> NSLineBreakMode { p?.ellipsizeMode == "clip" ? .byClipping : ((p?.numberOfLines ?? 0) == 0 ? .byWordWrapping : .byTruncatingTail) }
    private func attributed(text:String,font:NSFont,props p:RenderProps?) -> NSAttributedString {
        let paragraph = NSMutableParagraphStyle(); paragraph.alignment = p?.textAlign == "center" ? .center : (p?.textAlign == "right" ? .right : .left); paragraph.lineBreakMode = lineBreak(p)
        func attributes(_ span:[String:Any] = [:]) -> [NSAttributedString.Key:Any] {
            var values: [NSAttributedString.Key:Any] = [.font:textFont(size:span["fontSize"] as? Double ?? font.pointSize,weight:span["fontWeight"] as? String ?? p?.fontWeight,style:span["fontStyle"] as? String ?? p?.fontStyle),.foregroundColor:parseColor(span["color"] as? String ?? p?.color) ?? .labelColor,.paragraphStyle:paragraph]
            let decoration = span["textDecorationLine"] as? String ?? p?.textDecorationLine
            if decoration == "underline" { values[.underlineStyle] = NSUnderlineStyle.single.rawValue }
            if decoration == "line-through" { values[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
            return values
        }
        if let spans = p?.spans, let data = spans.data(using:.utf8), let values = try? JSONSerialization.jsonObject(with:data) as? [[String:Any]] {
            let result = NSMutableAttributedString(string:"")
            for span in values { result.append(NSAttributedString(string:span["text"] as? String ?? "",attributes:attributes(span))) }
            return result
        }
        return NSAttributedString(string:text,attributes:attributes())
    }
}
