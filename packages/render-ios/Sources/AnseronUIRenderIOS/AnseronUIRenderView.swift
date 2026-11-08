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
    public private(set) var routeStack: [String] = []

    private let extensions: IOSPlatformExtensions
    private let baseURL: URL?
    private let createCore: () throws -> IOSCoreTransport
    private var host: IOSHost?
    private var renderRoot: UIView?
    private var lastSize: CGSize?
    private var generation: UInt64 = 0
    private var failed = false

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
    public func load(page: String) {
        precondition(!isDestroyed && !page.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        routeStack = [page]
        loadCurrentPage()
    }

    /// Pushes a page and keeps the current page on the navigation stack.
    public func push(page: String) {
        precondition(!isDestroyed && !page.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        routeStack.append(page)
        loadCurrentPage()
    }

    /// Replaces the current stack entry.
    public func replace(page: String) {
        precondition(!isDestroyed && !routeStack.isEmpty && !page.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        routeStack[routeStack.count - 1] = page
        loadCurrentPage()
    }

    @discardableResult public func pop() -> Bool {
        guard !isDestroyed, routeStack.count > 1 else { return false }
        routeStack.removeLast()
        loadCurrentPage()
        return true
    }

    /// Called by a navigation controller before applying its default back behavior.
    public func handleBackPress() -> Bool { host?.handleBackPress() ?? false }

    private func loadCurrentPage() {
        guard let page = routeStack.last else { return }
        retirePage()
        self.page = page
        let root = UIView(frame: bounds)
        root.clipsToBounds = true
        addSubview(root)
        renderRoot = root
        synchronizeSize()
        setNeedsLayout()
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
        retirePage()
        page = nil
        routeStack.removeAll()
    }

    private func retirePage() {
        generation += 1
        host?.destroy()
        host = nil
        renderRoot?.removeFromSuperview()
        renderRoot = nil
        lastSize = nil
        failed = false
    }

    private func synchronizeSize() {
        guard !isDestroyed, !failed, let page, let root = renderRoot else { return }
        let size = root.bounds.size
        guard size.width.isFinite, size.height.isFinite, size.width >= 0, size.height >= 0 else { return }
        if let host {
            if size != lastSize {
                lastSize = size
                host.resize(width: size.width, height: size.height)
            }
            return
        }
        guard size.width > 0, size.height > 0 else { return }
        let currentGeneration = generation
        let host = IOSHost(root: root, baseURL: baseURL, extensions: extensions, router: { [weak self] method, args in
            guard let self, !self.isDestroyed else { throw NativeExtensionError.nodeUnmounted }
            let page = (args as? [String: Any])?["page"] as? String
            switch method {
            case "push":
                guard let page else { throw NativeExtensionError.invalidArguments }
                return IOSRouteResult(value: NSNull(), navigate: { [weak self] in self?.push(page: page) })
            case "replace":
                guard let page else { throw NativeExtensionError.invalidArguments }
                return IOSRouteResult(value: NSNull(), navigate: { [weak self] in self?.replace(page: page) })
            case "pop", "back":
                guard self.routeStack.count > 1 else { throw NativeExtensionError.unsupportedMethod("router stack is empty") }
                return IOSRouteResult(value: NSNull(), navigate: { [weak self] in _ = self?.pop() })
            case "current": return IOSRouteResult(value: self.routeStack.last ?? NSNull())
            default: throw NativeExtensionError.unsupportedMethod(method)
            }
        }, createCore: createCore)
        host.renderer.onPageBackgroundColor = { [weak self] color in
            guard let self, !self.isDestroyed, self.generation == currentGeneration else { return }
            self.onPageBackgroundColor?(color)
        }
        host.onReady = { [weak self] in
            guard let self, !self.isDestroyed, self.generation == currentGeneration else { return }
            self.onReady?()
        }
        host.onDiagnostic = { [weak self] code, message in
            guard let self, !self.isDestroyed, self.generation == currentGeneration else { return }
            self.onDiagnostic?(code, message)
        }
        host.onFailure = { [weak self] error in
            guard let self, !self.isDestroyed, self.generation == currentGeneration else { return }
            self.failed = true
            self.onFailure?(error)
        }
        self.host = host
        lastSize = size
        host.start(page: page, width: size.width, height: size.height)
    }
}
