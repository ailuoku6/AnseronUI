import Foundation
import AppKit

/// Implement this protocol in the generated scriptc C binding. Calls stay on one owner thread.
public protocol MacOSCoreTransport: AnyObject {
    var bundleBuildId: String { get }
    var runtimeEpoch: UInt32 { get }
    func post(_ input: Data) throws
    func step(maxMessages: Int) throws -> [Data]
    func hasPendingWork() -> Bool
    func dispose()
}

public enum HostError: Error {
    case invalidOutput, messageTooLarge, sequenceOverflow, invalidModule
}

/// Page-stack operation owned by AnseronUIRenderView. The host completes the
/// Core request first, then runs `navigate` so the caller's Promise settles.
public struct MacOSRouteResult {
    public let value: Any
    public let navigate: (() -> Void)?
    public init(value: Any, navigate: (() -> Void)? = nil) { self.value = value; self.navigate = navigate }
}
public typealias MacOSRouteHandler = (_ method: String, _ args: Any) throws -> MacOSRouteResult

private final class BackReply {
    private let condition = NSCondition()
    private var result: Bool?
    func finish(_ value: Bool) { condition.lock(); if result == nil { result = value }; condition.signal(); condition.unlock() }
    func wait() -> Bool {
        condition.lock(); defer { condition.unlock() }
        let deadline = Date(timeIntervalSinceNow: 0.75)
        while result == nil { if !condition.wait(until: deadline) { result = false; break } }
        return result ?? false
    }
}

/// Owns the Core's fixed OS thread. UI callbacks only enqueue copied values.
private final class CoreWorker {
    private let condition = NSCondition()
    private var jobs: [() -> Void] = []
    private var stopped = false
    private var thread: Thread?
    private let createCore: () throws -> MacOSCoreTransport
    private let baseURL: URL?
    var emitUI: ([String: Any]) -> Void = { _ in }
    var reportError: (Error) -> Void = { _ in }
    private var core: MacOSCoreTransport?
    private var inputSequence: UInt32 = 0
    private var outputSequence: UInt32 = 0
    private var ready = false
    private var pendingSurface: (page: String, width: Double, height: Double)?
    private var requests: [UInt32: () -> Void] = [:]
    private var backWaiter: ((Bool) -> Void)?

    init(createCore: @escaping () throws -> MacOSCoreTransport, baseURL: URL?) {
        self.createCore = createCore
        self.baseURL = baseURL
        thread = Thread { [weak self] in self?.run() }
        thread?.name = "AnseronUICore"
        thread?.start()
    }

    func start(page: String, width: Double, height: Double) {
        enqueue { [weak self] in
            guard let self else { return }
            self.pendingSurface = (page, width, height)
            self.core = try self.createCore()
            guard let core = self.core, !core.bundleBuildId.isEmpty, core.bundleBuildId.utf8.count <= 128 else { throw HostError.invalidOutput }
            try self.sendNow(["type": "Handshake", "requiredNodes": ["View", "Text", "RichText", "Button", "TextInput", "ScrollView", "Image", "Video"]])
        }
    }

    func send(_ payload: [String: Any]) {
        enqueue { [weak self] in try self?.sendNow(payload) }
    }

    func wake() { enqueue {} }
    func backPress() -> Bool {
        let reply = BackReply()
        enqueue { [weak self] in
            guard let self else { reply.finish(false); return }
            self.backWaiter = { value in reply.finish(value) }
            try self.sendNow(["type": "BackPress"])
        }
        // Core handles BackPress without waiting for main-thread rendering.
        return reply.wait()
    }
    func stop() { enqueue { [weak self] in self?.finish() } }

    private func sendNow(_ payload: [String: Any]) throws {
        guard let core else { return }
        guard inputSequence < UInt32.max else { throw HostError.sequenceOverflow }
        inputSequence += 1
        let envelope: [String: Any] = [
            "protocolMajor": 1, "protocolMinor": 0, "bundleBuildId": core.bundleBuildId,
            "runtimeEpoch": core.runtimeEpoch, "surfaceId": 1, "surfaceGeneration": 1,
            "sequence": inputSequence, "ackSequence": outputSequence, "payload": payload
        ]
        let data = try JSONSerialization.data(withJSONObject: envelope)
        guard data.count <= 1_048_576 else { throw HostError.messageTooLarge }
        try core.post(data)
    }

    private func enqueue(_ job: @escaping () throws -> Void) {
        condition.lock()
        if !stopped { jobs.append { [weak self] in
            do { try job(); try self?.drain() }
            catch { self?.reportError(error); self?.finish() }
        }; condition.signal() }
        condition.unlock()
    }

    private func run() {
        while true {
            condition.lock()
            while jobs.isEmpty && !stopped { condition.wait() }
            if stopped { condition.unlock(); return }
            let job = jobs.removeFirst()
            condition.unlock()
            autoreleasepool { job() }
        }
    }

    private func drain() throws {
        guard let core else { return }
        for _ in 0..<32 {
            let outputs = try core.step(maxMessages: 64)
            if outputs.isEmpty {
                if core.hasPendingWork() { wake() }
                return
            }
            for data in outputs { try handle(data) }
        }
        if core.hasPendingWork() { wake() }
    }

    private func handle(_ data: Data) throws {
        guard data.count <= 1_048_576,
              let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let core,
              (envelope["protocolMajor"] as? Int) == 1,
              let minor = envelope["protocolMinor"] as? Int, minor >= 0,
              (envelope["bundleBuildId"] as? String) == core.bundleBuildId,
              (envelope["runtimeEpoch"] as? UInt32) == core.runtimeEpoch,
              (envelope["surfaceId"] as? Int) == 1,
              (envelope["surfaceGeneration"] as? Int) == 1,
              outputSequence < UInt32.max,
              let sequence = envelope["sequence"] as? UInt32, sequence == outputSequence + 1,
              let ack = envelope["ackSequence"] as? UInt32, ack <= inputSequence,
              let payload = envelope["payload"] as? [String: Any],
              let kind = payload["type"] as? String else { throw HostError.invalidOutput }
        outputSequence = sequence
        switch kind {
        case "Ready":
            guard !ready, let surface = pendingSurface,
                  let nodes = payload["supportedNodes"] as? [String],
                  Set(["View", "Text", "RichText", "Button", "TextInput", "ScrollView", "Image", "Video"]).isSubset(of: Set(nodes)) else { throw HostError.invalidOutput }
            ready = true
            try sendNow(["type": "CreateSurface", "page": surface.page, "width": surface.width, "height": surface.height])
            emitUI(payload)
        case "Commit", "MeasureRequest": emitUI(payload)
        case "Diagnostic": emitUI(payload); if !ready { finish() }
        case "InvokeModule": try invoke(payload)
        case "CancelRequest":
            emitUI(payload)
            guard let id = payload["requestId"] as? UInt32 else { throw HostError.invalidOutput }
            requests.removeValue(forKey: id)?()
        case "BackPressResult":
            let reply = backWaiter; backWaiter = nil; reply?(payload["consumed"] as? Bool ?? false)
        case "SurfaceDisposed": emitUI(payload); finish()
        default: throw HostError.invalidOutput
        }
    }

    private func invoke(_ payload: [String: Any]) throws {
        guard let id = payload["requestId"] as? UInt32, id != 0, requests[id] == nil,
              let module = payload["module"] as? String,
              let method = payload["method"] as? String,
              let argument = payload["argument"] as? String else { throw HostError.invalidOutput }
        if module == "timer" && method == "sleep" {
            guard let delay = UInt32(argument), delay <= 2_147_483_647 else { throw HostError.invalidModule }
            let task = DispatchWorkItem { [weak self] in self?.complete(id, ok: true, value: "") }
            requests[id] = { task.cancel() }
            DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(Int(delay)), execute: task)
        } else if module == "http" && method == "getText" {
            guard let url = URL(string: argument, relativeTo: baseURL)?.absoluteURL,
                  url.scheme == "http" || url.scheme == "https" else { throw HostError.invalidModule }
            let task = URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
                if let error { self?.complete(id, ok: false, value: String(describing: error)); return }
                guard let response = response as? HTTPURLResponse, (200...299).contains(response.statusCode) else {
                    self?.complete(id, ok: false, value: "HTTP " + String((response as? HTTPURLResponse)?.statusCode ?? 0)); return
                }
                guard let data, data.count <= 65_536, let value = String(data: data, encoding: .utf8) else {
                    self?.complete(id, ok: false, value: "INVALID_RESPONSE"); return
                }
                self?.complete(id, ok: true, value: value)
            }
            requests[id] = { task.cancel() }
            task.resume()
        } else {
            emitUI(payload)
        }
    }

    private func complete(_ id: UInt32, ok: Bool, value: String) {
        enqueue { [weak self] in
            guard let self, self.requests.removeValue(forKey: id) != nil else { return }
            try self.sendNow(["type": "ModuleResult", "requestId": id, "ok": ok, "value": String(value.prefix(65_536))])
        }
    }

    private func finish() {
        condition.lock()
        if stopped { condition.unlock(); return }
        stopped = true
        jobs.removeAll()
        condition.broadcast()
        condition.unlock()
        backWaiter?(false); backWaiter = nil
        requests.values.forEach { $0() }
        requests.removeAll()
        core?.dispose()
        core = nil
    }
}

/// Connects a compiled Core transport to AppKit without entering Core from a view callback.
@MainActor public final class MacOSHost {
    public let renderer: MacOSRenderer
    public var onReady: (() -> Void)?
    public var onDiagnostic: ((String, String) -> Void)?
    public var onFailure: ((Error) -> Void)?
    private let worker: CoreWorker
    private var started = false
    private var destroyed = false
    private let extensions: MacOSPlatformExtensions
    private let router: MacOSRouteHandler?
    private let standardServices: StandardServices
    private var extensionRequests: [UInt32: () -> Void] = [:]

    public init(root: NSView, baseURL: URL? = nil, extensions: MacOSPlatformExtensions? = nil, router: MacOSRouteHandler? = nil, createCore: @escaping () throws -> MacOSCoreTransport) {
        let registry = extensions ?? MacOSPlatformExtensions()
        self.standardServices = StandardServices(root: root, baseURL: baseURL, sources: registry.subscriptions)
        self.extensions = registry
        self.router = router
        renderer = MacOSRenderer(root: root, extensions: registry)
        worker = CoreWorker(createCore: createCore, baseURL: baseURL)
        worker.emitUI = { [weak self] payload in
            DispatchQueue.main.async { [weak self] in self?.deliver(payload) }
        }
        worker.reportError = { [weak self] error in
            DispatchQueue.main.async { [weak self] in
                self?.cancelExtensions()
                self?.renderer.clear()
                self?.onFailure?(error)
            }
        }
        renderer.onEvent = { [weak worker] event in
            var payload: [String: Any] = ["type": event.type, "nodeId": event.nodeId, "revision": event.revision]
            if let value = event.value { payload["value"] = value }
            if let inputRevision = event.inputRevision { payload["inputRevision"] = inputRevision }
            if let name = event.event { payload["event"] = name }
            if let x = event.x { payload["x"] = x }
            if let y = event.y { payload["y"] = y }
            if let width = event.contentWidth { payload["contentWidth"] = width }
            if let height = event.contentHeight { payload["contentHeight"] = height }
            if let source = event.source { payload["source"] = source }
            if let state = event.state { payload["state"] = state }
            if let duration = event.duration { payload["duration"] = duration }
            if let errorCode = event.errorCode { payload["errorCode"] = errorCode }
            if let pageX = event.pageX { payload["pageX"] = pageX }
            if let pageY = event.pageY { payload["pageY"] = pageY }
            if let pointerId = event.pointerId { payload["pointerId"] = pointerId }
            if let touches = event.touches { payload["touches"] = touches }
            if let targetId = event.targetId { payload["targetId"] = targetId }
            worker?.send(payload)
        }
    }

    public func start(page: String, width: Double, height: Double) {
        precondition(!started && !destroyed && !page.isEmpty && width.isFinite && height.isFinite && width >= 0 && height >= 0)
        started = true
        worker.start(page: page, width: width, height: height)
    }

    public func resize(width: Double, height: Double) {
        precondition(started && !destroyed && width.isFinite && height.isFinite && width >= 0 && height >= 0)
        standardServices.changed()
        worker.send(["type": "Resize", "width": width, "height": height])
    }

    public func environmentChanged() { standardServices.changed() }
    public func wake() { worker.wake() }
    /// Synchronously asks Core whether the current TSX page consumed system back.
    public func handleBackPress() -> Bool { worker.backPress() }
    public func destroy() {
        if destroyed { return }
        destroyed = true
        cancelExtensions()
        renderer.clear()
        if started { worker.send(["type": "DestroySurface"]) }
        worker.stop()
    }

    deinit { worker.stop() }

    private func cancelExtensions() {
        standardServices.dispose()
        let requests = extensionRequests; extensionRequests.removeAll()
        requests.values.forEach { $0() }
    }
    private func invokeExtension(_ payload: [String: Any]) {
        guard !destroyed, let id = payload["requestId"] as? UInt32,
              let module = payload["module"] as? String, let method = payload["method"] as? String,
              let argument = payload["argument"] as? String else { return }
        extensionRequests[id] = {}
        let completion: NativeCompletion = { [weak self] result in
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.destroyed, self.extensionRequests.removeValue(forKey: id) != nil else { return }
                do {
                    let value = try encodeNativeJSON(result.get())
                    self.worker.send(["type": "ModuleResult", "requestId": id, "ok": true, "value": value])
                } catch {
                    self.worker.send(["type": "ModuleResult", "requestId": id, "ok": false, "value": String(String(describing: error).prefix(4096))])
                }
            }
        }
        do {
            let args = try decodeNativeJSON(argument)
            let cancel: (() -> Void)?
            if module == "__view" {
                guard let request = args as? [String: Any], let node = request["nodeId"] as? UInt32 else { throw NativeExtensionError.invalidArguments }
                cancel = try renderer.invoke(nodeId: node, method: method, args: request["args"] ?? NSNull(), completion: completion)
            } else if module == "router" {
                guard let router else { throw NativeExtensionError.unsupportedModule(module) }
                let result = try router(method, args)
                completion(.success(result.value))
                if let navigate = result.navigate { DispatchQueue.main.async { navigate() } }
                cancel = nil
            } else {
                if let handler = extensions.modules[module], !standardServices.handles(module, method) { cancel = try handler(method, args, completion) }
                else { cancel = try standardServices.invoke(module, method, args, completion) }
            }
            if extensionRequests[id] != nil { extensionRequests[id] = cancel ?? {} }
        } catch { completion(.failure(error)) }
    }

    private func deliver(_ payload: [String: Any]) {
        guard let type = payload["type"] as? String, !destroyed || type == "SurfaceDisposed" else { return }
        switch type {
        case "InvokeModule": invokeExtension(payload)
        case "CancelRequest":
            if let id = payload["requestId"] as? UInt32 { extensionRequests.removeValue(forKey: id)?() }
        case "Ready": onReady?()
        case "Commit":
            guard let revision = payload["revision"] as? UInt32 else { return }
            do {
                let data = try JSONSerialization.data(withJSONObject: payload)
                try renderer.applyJSON(data)
                worker.send(["type": "CommitAck", "revision": revision])
            } catch {
                worker.send(["type": "CommitFailed", "revision": revision, "reason": String(describing: error)])
            }
        case "MeasureRequest":
            do {
                guard let id = payload["requestId"] as? UInt32, let node = payload["nodeId"] as? UInt32,
                      let kind = payload["kind"] as? String, let text = payload["text"] as? String,
                      let font = payload["fontSize"] as? Double, let maxWidth = payload["maxWidth"] as? Double else { throw HostError.invalidOutput }
                let props = try (payload["props"] as? [String: Any]).map { try JSONDecoder().decode(RenderProps.self, from: JSONSerialization.data(withJSONObject: $0)) }
                let size = try renderer.measure(kind: kind, text: text, fontSize: font, maxWidth: maxWidth, props: props)
                worker.send(["type": "MeasureResult", "requestId": id, "nodeId": node,
                             "width": size.width, "height": size.height, "baseline": size.baseline])
            } catch { onFailure?(error); destroy() }
        case "Diagnostic": onDiagnostic?(payload["code"] as? String ?? "UNKNOWN", payload["message"] as? String ?? "")
        case "SurfaceDisposed": cancelExtensions(); renderer.clear()
        default: onFailure?(HostError.invalidOutput)
        }
    }
}
