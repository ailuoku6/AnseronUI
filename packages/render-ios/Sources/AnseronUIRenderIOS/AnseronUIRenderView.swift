import Foundation
import UIKit

/// Embeddable page container. Call destroy() when its owner finishes using it.
/// Removing it from a superview does not destroy the page, so it can be reparented.
@MainActor public final class AnseronUIRenderView: UIView {
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
    }

    @available(*, unavailable, message: "Create AnseronUIRenderView programmatically")
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

    /// Loads a fresh page instance, replacing any previous one. Startup waits for a nonzero size.
    public func load(page: String, params: [String: Any] = [:]) {
        precondition(!isDestroyed && !page.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        let entry = Route(page, parameterSnapshot(params))
        retireAllPages()
        routes = [entry]
        loadCurrentPage()
    }

    /// Pushes a page and keeps the current page on the navigation stack.
    public func push(page: String, params: [String: Any] = [:]) {
        precondition(!isDestroyed && !page.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        let entry = Route(page, parameterSnapshot(params))
        renderRoot?.removeFromSuperview()
        routes.append(entry)
        loadCurrentPage()
    }

    /// Replaces the current stack entry.
    public func replace(page: String, params: [String: Any] = [:]) {
        precondition(!isDestroyed && !routeStack.isEmpty && !page.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        let entry = Route(page, parameterSnapshot(params))
        retirePage(routes.removeLast())
        routes.append(entry)
        loadCurrentPage()
    }

    @discardableResult public func pop() -> Bool {
        guard !isDestroyed, routeStack.count > 1 else { return false }
        retirePage(routes.removeLast())
        loadCurrentPage()
        return true
    }

    /// Called by a navigation controller before applying its default back behavior.
    public func handleBackPress() -> Bool { host?.handleBackPress() ?? false }

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
        setNeedsLayout()
    }

    public override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        host?.environmentChanged()
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        renderRoot?.frame = bounds
        synchronizeSize()
    }

    /// Terminal and idempotent. Create another container to load pages after destruction.
    public func destroy() {
        guard !isDestroyed else { return }
        isDestroyed = true
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
