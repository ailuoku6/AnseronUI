import Foundation
import UIKit

/// Embeddable page container. Call destroy() when its owner finishes using it.
/// Removing it from a superview does not destroy the page, so it can be reparented.
@MainActor public final class AnseronUIRenderView: UIView, UIGestureRecognizerDelegate {
    public var onReady: (() -> Void)?
    /// Lets the owning app extend the page background into system safe areas.
    public var onPageBackgroundColor: ((UIColor) -> Void)?
    public var onDiagnostic: ((String, String) -> Void)?
    public var onFailure: ((Error) -> Void)?
    public private(set) var page: String?
    public private(set) var isDestroyed = false
    private final class Route {
        let page: String
        let params: String
        var host: IOSHost?
        var root: UIView?
        var lastSize: CGSize?
        var failed = false
        var disposed = false
        var color: UIColor?
        init(_ page: String, _ params: String) { self.page = page; self.params = params }
    }
    private var routes: [Route] = []
    private var backPreview: (current: UIView, previous: UIView)?
    private var backTransitionID: UUID?
    private var backAnimationCompleted = false
    private var backInterception: Bool?
    private lazy var backGesture: UIScreenEdgePanGestureRecognizer = {
        let gesture = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleBackGesture(_:)))
        gesture.edges = .left
        gesture.delegate = self
        return gesture
    }()
    public var routeStack: [String] { routes.map { $0.page } }
    public var routeParams: [String: Any] { (try? decodeNativeJSON(routes.last?.params ?? "{}")) as? [String: Any] ?? [:] }
    private func parameterSnapshot(_ params: [String: Any]) -> String {
        precondition(JSONSerialization.isValidJSONObject(params), "Route params must be JSON")
        let encoded = try! encodeNativeJSON(params)
        precondition(encoded.utf8.count <= 48000, "Route params exceed 48 KB")
        return encoded
    }

    private let extensions: IOSPlatformExtensions
    private let baseURL: URL?
    private let createCore: () throws -> IOSCoreTransport
    private var host: IOSHost? { routes.last?.host }
    private var renderRoot: UIView? { routes.last?.root }

    public init(frame: CGRect = .zero, baseURL: URL? = nil, extensions: IOSPlatformExtensions? = nil,
                createCore: @escaping () throws -> IOSCoreTransport = { try NativeCore() }) {
        self.extensions = extensions ?? IOSPlatformExtensions()
        self.baseURL = baseURL
        self.createCore = createCore
        super.init(frame: frame)
        addGestureRecognizer(backGesture)
    }

    @available(*, unavailable, message: "Create AnseronUIRenderView programmatically")
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

    /// Loads a fresh page instance, replacing any previous one. Startup waits for a nonzero size.
    public func load(page: String, params: [String: Any] = [:]) {
        precondition(!isDestroyed && !page.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        let entry = Route(page, parameterSnapshot(params))
        resetBackPreview()
        retireAllPages()
        routes = [entry]
        loadCurrentPage()
    }

    /// Pushes a page and keeps the current page on the navigation stack.
    public func push(page: String, params: [String: Any] = [:]) {
        precondition(!isDestroyed && !page.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        let entry = Route(page, parameterSnapshot(params))
        resetBackPreview()
        renderRoot?.removeFromSuperview()
        routes.append(entry)
        loadCurrentPage()
    }

    /// Replaces the current stack entry.
    public func replace(page: String, params: [String: Any] = [:]) {
        precondition(!isDestroyed && !routeStack.isEmpty && !page.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        let entry = Route(page, parameterSnapshot(params))
        resetBackPreview()
        retirePage(routes.removeLast())
        routes.append(entry)
        loadCurrentPage()
    }

    @discardableResult public func pop() -> Bool {
        guard !isDestroyed, routeStack.count > 1 else { return false }
        resetBackPreview()
        retirePage(routes.removeLast())
        loadCurrentPage()
        return true
    }

    /// Called by a navigation controller before applying its default back behavior.
    public func handleBackPress() -> Bool { host?.handleBackPress() ?? false }

    public override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === backGesture else { return true }
        let velocity = backGesture.velocity(in: self)
        return !isDestroyed && routes.count > 1 && backPreview == nil && bounds.width > 0
            && velocity.x > abs(velocity.y)
    }

    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                                  shouldBeRequiredToFailBy otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        // Give an edge drag priority over a page's scroll view pan gesture.
        gestureRecognizer === backGesture && otherGestureRecognizer.view is UIScrollView
    }

    @objc private func handleBackGesture(_ gesture: UIScreenEdgePanGestureRecognizer) {
        switch gesture.state {
        case .began:
            guard routes.count > 1, let current = renderRoot, let previous = routes[routes.count - 2].root else { return }
            previous.frame = bounds
            insertSubview(previous, belowSubview: current)
            backPreview = (current, previous)
            updateBackPreview(translation: gesture.translation(in: self).x)
        case .changed:
            updateBackPreview(translation: gesture.translation(in: self).x)
        case .ended, .cancelled, .failed:
            guard let preview = backPreview else { return }
            let distance = max(0, gesture.translation(in: self).x)
            let velocity = gesture.velocity(in: self).x
            let shouldPop = gesture.state == .ended && velocity >= 0
                && (distance > bounds.width / 3 || velocity > 500)
            let transitionID = UUID()
            backTransitionID = transitionID
            backAnimationCompleted = false
            backInterception = nil
            animateBackPreview(preview, finishing: shouldPop, transitionID: transitionID) { [weak self] in
                guard let self, self.backTransitionID == transitionID else { return }
                if !shouldPop { self.resetBackPreview(); return }
                self.backAnimationCompleted = true
                if self.backInterception == false { self.finishBackTransition(transitionID) }
            }
            if shouldPop {
                host?.handleBackPress { [weak self] consumed in
                    guard let self, self.backTransitionID == transitionID,
                          let preview = self.backPreview else { return }
                    self.backInterception = consumed
                    if consumed {
                        self.backAnimationCompleted = false
                        self.animateBackPreview(preview, finishing: false, transitionID: transitionID) { [weak self] in
                            guard let self, self.backTransitionID == transitionID else { return }
                            self.resetBackPreview()
                        }
                    } else if self.backAnimationCompleted {
                        self.finishBackTransition(transitionID)
                    }
                }
            }
        default: break
        }
    }

    private func animateBackPreview(_ preview: (current: UIView, previous: UIView), finishing: Bool,
                                    transitionID: UUID, completion: @escaping () -> Void) {
        UIView.animate(withDuration: 0.2, delay: 0, options: [.curveEaseOut, .beginFromCurrentState], animations: {
            preview.current.transform = finishing ? CGAffineTransform(translationX: self.bounds.width, y: 0) : .identity
            preview.previous.transform = finishing ? .identity : CGAffineTransform(translationX: -self.bounds.width * 0.25, y: 0)
        }, completion: { [weak self] _ in
            guard let self, self.backTransitionID == transitionID else { return }
            completion()
        })
    }

    private func finishBackTransition(_ transitionID: UUID) {
        guard backTransitionID == transitionID else { return }
        resetBackPreview()
        _ = pop()
    }

    private func updateBackPreview(translation: CGFloat) {
        guard let preview = backPreview else { return }
        let distance = min(bounds.width, max(0, translation))
        preview.current.transform = CGAffineTransform(translationX: distance, y: 0)
        preview.previous.transform = CGAffineTransform(translationX: (distance - bounds.width) * 0.25, y: 0)
    }

    private func resetBackPreview() {
        backTransitionID = nil
        backAnimationCompleted = false
        backInterception = nil
        guard let preview = backPreview else { return }
        backPreview = nil
        preview.current.layer.removeAllAnimations()
        preview.previous.layer.removeAllAnimations()
        preview.current.transform = .identity
        preview.previous.transform = .identity
        preview.previous.removeFromSuperview()
    }

    private func loadCurrentPage() {
        guard let entry = routes.last else { return }
        self.page = entry.page
        if entry.root == nil {
            let root = UIView(frame: bounds)
            root.clipsToBounds = true
            entry.root = root
        }
        if let root = entry.root { root.frame = bounds; addSubview(root) }
        if let color = entry.color { onPageBackgroundColor?(color) }
        synchronizeSize()
        host?.environmentChanged()
        setNeedsLayout()
    }

    public override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        // Descendant render roots receive the new traits after their parent callback.
        DispatchQueue.main.async { [weak self] in
            self?.routes.forEach { $0.host?.environmentChanged() }
        }
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        if let preview = backPreview, preview.current.bounds.size != bounds.size { resetBackPreview() }
        // UIView.frame is undefined with a nonidentity transform. Assigning it
        // during an edge drag moves the view's center back under the finger.
        renderRoot?.bounds = CGRect(origin: .zero, size: bounds.size)
        renderRoot?.center = CGPoint(x: bounds.midX, y: bounds.midY)
        synchronizeSize()
    }

    /// Terminal and idempotent. Create another container to load pages after destruction.
    public func destroy() {
        guard !isDestroyed else { return }
        isDestroyed = true
        resetBackPreview()
        retireAllPages()
        page = nil
    }

    private func retirePage(_ entry: Route) {
        entry.disposed = true
        entry.host?.destroy(); entry.host = nil
        entry.root?.removeFromSuperview(); entry.root = nil
    }
    private func retireAllPages() {
        let old = routes; routes.removeAll()
        old.forEach { retirePage($0) }
    }

    private func synchronizeSize() {
        guard !isDestroyed, let entry = routes.last, !entry.failed, let root = entry.root else { return }
        let page = entry.page
        let size = root.bounds.size
        guard size.width.isFinite, size.height.isFinite, size.width >= 0, size.height >= 0 else { return }
        if let host {
            if size != entry.lastSize {
                entry.lastSize = size
                host.resize(width: size.width, height: size.height)
            }
            return
        }
        guard size.width > 0, size.height > 0 else { return }
        let host = IOSHost(root: root, baseURL: baseURL, extensions: extensions, router: { [weak self, weak entry] method, args in
            guard let self, let entry, !self.isDestroyed, !entry.disposed else { throw NativeExtensionError.nodeUnmounted }
            let page = (args as? [String: Any])?["page"] as? String
            let rawParams = (args as? [String: Any])?["params"]
            guard rawParams == nil || rawParams is [String: Any] else { throw NativeExtensionError.invalidArguments }
            let params = rawParams as? [String: Any] ?? [:]
            let encoded = try encodeNativeJSON(params)
            guard encoded.utf8.count <= 48000 else { throw NativeExtensionError.invalidArguments }
            if method == "getParams" { return IOSRouteResult(value: try decodeNativeJSON(entry.params)) }
            if method == "current" { return IOSRouteResult(value: entry.page) }
            guard self.routes.last === entry else { throw NativeExtensionError.unsupportedMethod("inactive route") }
            switch method {
            case "push":
                guard let page, page.range(of: "^[a-z][a-z0-9_-]*$", options: .regularExpression) != nil else { throw NativeExtensionError.invalidArguments }
                return IOSRouteResult(value: NSNull(), navigate: { [weak self, weak entry] in guard let self, let entry, self.routes.last === entry else { return }; self.push(page: page, params: params) })
            case "replace":
                guard let page, page.range(of: "^[a-z][a-z0-9_-]*$", options: .regularExpression) != nil else { throw NativeExtensionError.invalidArguments }
                return IOSRouteResult(value: NSNull(), navigate: { [weak self, weak entry] in guard let self, let entry, self.routes.last === entry else { return }; self.replace(page: page, params: params) })
            case "pop", "back":
                guard self.routeStack.count > 1 else { throw NativeExtensionError.unsupportedMethod("router stack is empty") }
                return IOSRouteResult(value: NSNull(), navigate: { [weak self, weak entry] in guard let self, let entry, self.routes.last === entry else { return }; _ = self.pop() })
            case "getParams": return IOSRouteResult(value: self.routeParams)
            case "current": return IOSRouteResult(value: self.routeStack.last ?? NSNull())
            default: throw NativeExtensionError.unsupportedMethod(method)
            }
        }, createCore: createCore)
        host.renderer.onPageBackgroundColor = { [weak self, weak entry] color in
            guard let self, let entry, !self.isDestroyed, !entry.disposed else { return }
            entry.color = color
            if self.routes.last === entry { self.onPageBackgroundColor?(color) }
        }
        host.onReady = { [weak self, weak entry] in
            guard let self, let entry, !self.isDestroyed, self.routes.last === entry else { return }
            self.onReady?()
        }
        host.onDiagnostic = { [weak self, weak entry] code, message in
            guard let self, let entry, !self.isDestroyed, self.routes.last === entry else { return }
            self.onDiagnostic?(code, message)
        }
        host.onFailure = { [weak self, weak entry] error in
            guard let self, let entry, !self.isDestroyed, !entry.disposed else { return }
            entry.failed = true
            if self.routes.last === entry { self.onFailure?(error) }
        }
        entry.host = host
        entry.lastSize = size
        host.start(page: page, width: size.width, height: size.height)
    }
}
