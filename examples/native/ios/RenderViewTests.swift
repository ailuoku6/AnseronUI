import XCTest
import UIKit
@testable import AnseronUIDemo

private final class RecordingCore: IOSCoreTransport {
    let bundleBuildId = "container-test"
    let runtimeEpoch: UInt32 = 1
    let disposed: XCTestExpectation
    let committed: XCTestExpectation
    var onResize: (() -> Void)?
    var onInput: (([String: Any]) -> Void)?
    private let lock = NSLock()
    private var inputs: [[String: Any]] = []
    private var outputs: [Data] = []
    private var sequence = 0

    init(disposed: XCTestExpectation, committed: XCTestExpectation) {
        self.disposed = disposed
        self.committed = committed
    }

    var messages: [[String: Any]] {
        lock.lock(); defer { lock.unlock() }
        return inputs
    }

    func post(_ input: Data) throws {
        let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: input) as? [String: Any])
        let payload = try XCTUnwrap(envelope["payload"] as? [String: Any])
        lock.lock(); inputs.append(payload); lock.unlock()
        onInput?(payload)
        switch payload["type"] as? String {
        case "Handshake":
            try emit(["type": "Ready", "supportedNodes": payload["requiredNodes"] ?? []], envelope)
        case "CreateSurface":
            try emit(["type": "Commit", "revision": 1, "commands": [
                ["type": "CreateNode", "nodeId": 1, "kind": "Text"],
                ["type": "SetProps", "nodeId": 1, "props": ["text": payload["page"] as? String ?? ""]],
                ["type": "InsertChild", "nodeId": 1, "parentId": 0, "index": 0],
            ]], envelope)
        case "CommitAck": committed.fulfill()
        case "Resize": onResize?()
        case "DestroySurface": try emit(["type": "SurfaceDisposed"], envelope)
        default: break
        }
    }

    private func emit(_ payload: [String: Any], _ input: [String: Any]) throws {
        sequence += 1
        var envelope = input
        envelope["sequence"] = sequence
        envelope["ackSequence"] = input["sequence"]
        envelope["payload"] = payload
        let data = try JSONSerialization.data(withJSONObject: envelope)
        lock.lock(); outputs.append(data); lock.unlock()
    }

    func step(maxMessages: Int) throws -> [Data] {
        lock.lock(); defer { lock.unlock() }
        let result = outputs
        outputs.removeAll()
        return result
    }

    func hasPendingWork() -> Bool { false }
    func dispose() { disposed.fulfill() }
}

private final class BackDrag: UIScreenEdgePanGestureRecognizer {
    var phase: UIGestureRecognizer.State = .began
    var offset: CGFloat = 0
    override var state: UIGestureRecognizer.State {
        get { phase }
        set { phase = newValue }
    }
    override func translation(in view: UIView?) -> CGPoint { CGPoint(x: offset, y: 0) }
    override func velocity(in view: UIView?) -> CGPoint { CGPoint(x: 100, y: 0) }
}

@MainActor final class RenderViewTests: XCTestCase {
    func testLayoutDuringBackDragPreservesTranslationAndSurfaceSize() async throws {
        let committed = expectation(description: "pages mounted"); committed.expectedFulfillmentCount = 2
        let disposed = expectation(description: "pages disposed"); disposed.expectedFulfillmentCount = 2
        let view = AnseronUIRenderView(frame: CGRect(x: 0, y: 0, width: 320, height: 480), createCore: {
            RecordingCore(disposed: disposed, committed: committed)
        })
        view.load(page: "counter")
        view.push(page: "async-form")
        await fulfillment(of: [committed], timeout: 5)
        let current = try XCTUnwrap(view.subviews.last)
        let gesture = BackDrag()
        view.perform(NSSelectorFromString("handleBackGesture:"), with: gesture)
        gesture.phase = .changed; gesture.offset = 120
        view.perform(NSSelectorFromString("handleBackGesture:"), with: gesture)
        view.setNeedsLayout(); view.layoutIfNeeded()
        XCTAssertEqual(current.transform.tx, 120, accuracy: 0.01)
        XCTAssertEqual(current.frame.minX, 120, accuracy: 0.01)
        XCTAssertEqual(current.bounds.size, CGSize(width: 320, height: 480))
        XCTAssertEqual(view.routeStack, ["counter", "async-form"])
        view.destroy()
        await fulfillment(of: [disposed], timeout: 5)
    }

    func testAsyncBackInterceptionDoesNotBlockMainThreadWhenCoreDoesNotReply() async {
        let committed = expectation(description: "page mounted")
        let disposed = expectation(description: "page disposed")
        let core = RecordingCore(disposed: disposed, committed: committed)
        let host = IOSHost(root: UIView(), createCore: { core })
        host.start(page: "counter", width: 320, height: 480)
        await fulfillment(of: [committed], timeout: 5)
        let resolved = expectation(description: "missing reply times out")
        let start = Date()
        host.handleBackPress { consumed in
            XCTAssertFalse(consumed)
            resolved.fulfill()
        }
        XCTAssertLessThan(Date().timeIntervalSince(start), 0.1)
        let responsive = expectation(description: "main queue remains responsive")
        DispatchQueue.main.async { responsive.fulfill() }
        await fulfillment(of: [responsive], timeout: 0.2)
        await fulfillment(of: [resolved], timeout: 2)
        host.destroy()
        await fulfillment(of: [disposed], timeout: 5)
    }

    func testPushRetainsHostAndPopDisposesOnlyTopEntry() async throws {
        let firstDisposed = expectation(description: "root disposed at container destruction")
        let secondDisposed = expectation(description: "detail disposed on pop")
        let firstCommitted = expectation(description: "root mounted")
        let secondCommitted = expectation(description: "detail mounted")
        let first = RecordingCore(disposed: firstDisposed, committed: firstCommitted)
        let second = RecordingCore(disposed: secondDisposed, committed: secondCommitted)
        let lock = NSLock(); var cores = [first, second]; var created = 0
        let view = AnseronUIRenderView(frame: CGRect(x: 0, y: 0, width: 320, height: 480), createCore: {
            lock.lock(); defer { lock.unlock() }; created += 1; return cores.removeFirst()
        })
        view.load(page: "counter", params: ["root": true]); view.layoutIfNeeded()
        await fulfillment(of: [firstCommitted], timeout: 5)
        let originalRoot = try XCTUnwrap(view.subviews.first)
        view.push(page: "async-form", params: ["id": 7]); view.layoutIfNeeded()
        await fulfillment(of: [secondCommitted], timeout: 5)
        XCTAssertNil(originalRoot.superview)
        XCTAssertFalse(first.messages.contains { $0["type"] as? String == "DestroySurface" })
        XCTAssertTrue(view.pop()); view.layoutIfNeeded()
        await fulfillment(of: [secondDisposed], timeout: 5)
        XCTAssertTrue(view.subviews.first === originalRoot)
        XCTAssertEqual(view.routeParams["root"] as? Bool, true)
        lock.lock(); let totalCreated = created; lock.unlock()
        XCTAssertEqual(totalCreated, 2, "Back reuses the original Core")
        XCTAssertEqual(first.messages.filter { $0["type"] as? String == "CreateSurface" }.count, 1)
        view.destroy()
        await fulfillment(of: [firstDisposed], timeout: 5)
    }

    func testRouteParameterSnapshotsAndBackRestoration() {
        let view = AnseronUIRenderView(createCore: { XCTFail("Zero-sized view must defer Core startup"); throw HostError.invalidOutput })
        defer { view.destroy() }
        let nested = NSMutableDictionary(dictionary: ["value": "original"])
        view.load(page: "counter", params: ["nested": nested])
        nested["value"] = "changed"
        XCTAssertEqual((view.routeParams["nested"] as? [String: String])?["value"], "original")
        view.push(page: "async-form", params: ["id": 1])
        view.push(page: "async-form", params: ["id": 2, "values": [true, NSNull()]])
        XCTAssertEqual(view.routeStack, ["counter", "async-form", "async-form"])
        XCTAssertEqual(view.routeParams["id"] as? Int, 2)
        XCTAssertTrue(view.pop()); XCTAssertEqual(view.routeParams["id"] as? Int, 1)
        view.replace(page: "async-form", params: ["replacement": true])
        XCTAssertNil(view.routeParams["id"])
        XCTAssertEqual(view.routeParams["replacement"] as? Bool, true)
        XCTAssertTrue(view.pop())
        XCTAssertEqual((view.routeParams["nested"] as? [String: String])?["value"], "original")
        XCTAssertFalse(view.pop())
        view.push(page: "async-form")
        XCTAssertTrue(view.routeParams.isEmpty)
        view.load(page: "counter")
        XCTAssertEqual(view.routeStack, ["counter"]); XCTAssertTrue(view.routeParams.isEmpty)
    }

    func testApplicationInboxSurvivesPageDisposalAndAcknowledgesByID() async throws {
        let tag = UUID().uuidString
        let first = StandardServices(root: UIView(), baseURL: nil)
        AnseronUINotifications.receive(["test": tag, "sequence": 1])
        AnseronUINotifications.receive(["test": tag, "sequence": 2], opened: true)
        first.dispose()
        let second = StandardServices(root: UIView(), baseURL: nil)
        defer { second.dispose() }
        func call(_ module: String, _ method: String, _ args: [String: Any] = [:]) async throws -> Any {
            try await withCheckedThrowingContinuation { continuation in
                do { _ = try second.invoke(module, method, args) { continuation.resume(with: $0) } }
                catch { continuation.resume(throwing: error) }
            }
        }
        let all = try await call("notifications", "getEvents") as! [[String: Any]]
        let matching = all.filter { ($0["payload"] as? [String: Any])?["test"] as? String == tag }
        XCTAssertEqual(matching.count, 2)
        XCTAssertEqual(matching.map { $0["kind"] as! String }, ["received", "opened"])
        let ids = matching.map { $0["id"] as! String }
        _ = try await call("notifications", "acknowledge", ["ids": [ids[0]]])
        let remaining = try await call("notifications", "getEvents") as! [[String: Any]]
        XCTAssertFalse(remaining.contains { $0["id"] as? String == ids[0] })
        XCTAssertTrue(remaining.contains { $0["id"] as? String == ids[1] })
        _ = try await call("notifications", "acknowledge", ["ids": ids])
        XCTAssertThrowsError(try second.invoke("background", "schedule", ["identifier": "unregistered"]) { _ in }) { error in XCTAssertTrue(String(describing: error).contains("INVALID_ARGUMENT")) }
        XCTAssertThrowsError(try second.invoke("notifications", "schedule", ["id": "invalid", "title": "test", "body": "body", "delaySeconds": -1]) { _ in })
    }

    func testStandardServicesStorageAndSubscriptionLifecycle() async throws {
        let root = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        let services = StandardServices(root: root, baseURL: nil)
        defer { services.dispose() }
        func call(_ module: String, _ method: String, _ args: [String: Any] = [:]) async throws -> Any {
            try await withCheckedThrowingContinuation { continuation in
                do { _ = try services.invoke(module, method, args) { continuation.resume(with: $0) } }
                catch { continuation.resume(throwing: error) }
            }
        }
        let namespace = "test-" + UUID().uuidString
        _ = try await call("storage", "set", ["namespace": namespace, "key": "message", "value": "你好"])
        _ = try await call("storage", "set", ["namespace": namespace + "other", "key": "message", "value": "keep"])
        let value = try await call("storage", "get", ["namespace": namespace, "key": "message"])
        XCTAssertEqual(value as? String, "你好")
        _ = try await call("storage", "clear", ["namespace": namespace])
        let retained = try await call("storage", "get", ["namespace": namespace + "other", "key": "message"])
        XCTAssertEqual(retained as? String, "keep")
        _ = try await call("storage", "clear", ["namespace": namespace + "other"])
        _ = try await call("secureStorage", "set", ["namespace": namespace, "key": "token", "value": "test-value"])
        let secureValue = try await call("secureStorage", "get", ["namespace": namespace, "key": "token"])
        XCTAssertEqual(secureValue as? String, "test-value")
        _ = try await call("secureStorage", "clear", ["namespace": namespace])
        let empty = try await call("secureStorage", "get", ["namespace": namespace, "key": "token"])
        XCTAssertTrue(empty is NSNull)
        let supported = try await call("capabilities", "has", ["module": "biometrics"])
        XCTAssertEqual(supported as? Bool, false)
        let first = try await call("events", "next", ["id": "metrics", "module": "window"])
        XCTAssertEqual((first as? [String: Any])?["width"] as? CGFloat, 320)
        var deliveries = 0
        let stop = try services.invoke("events", "next", ["id": "metrics", "module": "window"]) { _ in deliveries += 1 }
        stop?(); root.frame.size.width = 640; services.changed()
        XCTAssertEqual(deliveries, 0, "Cancelled observers cannot receive late values")
        XCTAssertThrowsError(try services.invoke("device", "missing", NSNull()) { _ in })
    }

    func testAnimationFramesCancellationAndDisposal() async throws {
        let root = UIView(frame: CGRect(x:0,y:0,width:390,height:844))
        let renderer = IOSRenderer(root:root)
        func commit(_ revision: Int, _ commands: [[String:Any]]) throws {
            try renderer.applyJSON(JSONSerialization.data(withJSONObject:["type":"Commit","revision":revision,"commands":commands]))
        }
        try commit(1, [
            ["type":"CreateNode","nodeId":1,"kind":"View"],
            ["type":"InsertChild","nodeId":1,"parentId":0,"index":0],
            ["type":"SetProps","nodeId":1,"props":["backgroundColor":"#0000ff","animation":"{\"duration\":400,\"easing\":\"linear\"}"]],
            ["type":"SetFrame","nodeId":1,"frame":["x":0,"y":0,"width":50,"height":50]]
        ])
        let view = try XCTUnwrap(renderer.view(for:1))
        XCTAssertEqual(view.frame.width,50)
        try commit(2, [["type":"SetFrame","nodeId":1,"frame":["x":100,"y":20,"width":150,"height":80]]])
        try await Task.sleep(nanoseconds:180_000_000)
        XCTAssertGreaterThan(view.frame.minX,5); XCTAssertLessThan(view.frame.minX,95)
        try await Task.sleep(nanoseconds:300_000_000)
        XCTAssertEqual(view.frame.minX,100,accuracy:0.01); XCTAssertEqual(view.frame.width,150,accuracy:0.01)
        var outcomes: [Bool] = []
        try renderer.invoke(nodeId:1,method:"animate",args:["style":["translateX":100,"opacity":0.5],"options":["duration":500,"easing":"linear"]]) { result in
            outcomes.append((try? result.get() as? [String:Bool])?["finished"] ?? false)
        }
        try await Task.sleep(nanoseconds:200_000_000)
        let before = view.transform.tx
        XCTAssertGreaterThan(before,5); XCTAssertLessThan(before,95)
        try commit(3, [["type":"SetProps","nodeId":1,"props":["backgroundColor":"#0000ff","testID":"updated","animation":"{\"duration\":400,\"easing\":\"linear\"}"]]])
        XCTAssertEqual(view.transform.tx,before,accuracy:0.01)
        try renderer.invoke(nodeId:1,method:"cancelAnimation",args:NSNull()) { _ in }
        XCTAssertEqual(outcomes,[false])
        let frozen = view.transform.tx
        try await Task.sleep(nanoseconds:100_000_000)
        XCTAssertEqual(view.transform.tx,frozen,accuracy:0.01)
        try renderer.invoke(nodeId:1,method:"animate",args:["style":["rotate":180],"options":["duration":80,"iterations":2,"autoreverse":true]]) { result in
            outcomes.append((try? result.get() as? [String:Bool])?["finished"] ?? false)
        }
        try await Task.sleep(nanoseconds:450_000_000)
        XCTAssertEqual(outcomes,[false,true]); XCTAssertEqual(view.transform.b,0,accuracy:0.01)
        try renderer.invoke(nodeId:1,method:"animate",args:["style":["scaleX":2],"options":["iterations":-1]]) { result in
            outcomes.append((try? result.get() as? [String:Bool])?["finished"] ?? false)
        }
        renderer.clear(); XCTAssertEqual(outcomes,[false,true,false]); XCTAssertTrue(root.subviews.isEmpty)
    }

    func testButtonDoesNotPublishAnUntouchedControlledInputWithZeroRevision() throws {
        let renderer = IOSRenderer(root: UIView())
        var events: [RendererEvent] = []
        renderer.onEvent = { events.append($0) }
        try renderer.applyJSON(JSONSerialization.data(withJSONObject: ["type": "Commit", "revision": 1, "commands": [
            ["type": "CreateNode", "nodeId": 1, "kind": "TextInput"],
            ["type": "SetProps", "nodeId": 1, "props": ["value": "预填文本"]],
            ["type": "BindEvent", "nodeId": 1, "event": "changeText", "enabled": true],
            ["type": "CreateNode", "nodeId": 2, "kind": "Button"],
            ["type": "SetProps", "nodeId": 2, "props": ["title": "read"]],
            ["type": "BindEvent", "nodeId": 2, "event": "tap", "enabled": true],
        ]]))
        let button = try XCTUnwrap(renderer.view(for: 2) as? UIButton)
        button.sendActions(for: .touchUpInside)
        XCTAssertEqual(events.map { $0.type }, ["Tap"])
    }

    func testScrollViewportClipsContentAfterPropsUpdate() throws {
        let renderer = IOSRenderer(root: UIView())
        try renderer.applyJSON(JSONSerialization.data(withJSONObject: ["type": "Commit", "revision": 1, "commands": [
            ["type": "CreateNode", "nodeId": 1, "kind": "ScrollView"],
            ["type": "SetProps", "nodeId": 1, "props": ["testID": "scroll"]],
        ]]))
        let scroll = try XCTUnwrap(renderer.view(for: 1) as? UIScrollView)
        XCTAssertTrue(scroll.clipsToBounds, "Scroll content must not draw over the fixed header")
        XCTAssertTrue(scroll.isScrollEnabled)
    }

    func testHostPreservesSubmitAndSpanValuesWithoutInputRevision() async throws {
        let disposed = expectation(description: "Core disposed")
        let committed = expectation(description: "Initial commit")
        let events = expectation(description: "Native values delivered"); events.expectedFulfillmentCount = 2
        let core = RecordingCore(disposed: disposed, committed: committed)
        core.onInput = { payload in if payload["type"] as? String == "NativeEvent" { events.fulfill() } }
        let host = IOSHost(root: UIView(), createCore: { core })
        host.start(page: "counter", width: 320, height: 480)
        await fulfillment(of: [committed], timeout: 5)
        host.renderer.onEvent?(RendererEvent(type: "NativeEvent", nodeId: 1, revision: 1, value: "hello", event: "submit"))
        host.renderer.onEvent?(RendererEvent(type: "NativeEvent", nodeId: 1, revision: 1, value: "3", event: "spanClick"))
        await fulfillment(of: [events], timeout: 5)
        let inputs = core.messages.filter { $0["type"] as? String == "NativeEvent" }
        XCTAssertEqual(inputs.first?["value"] as? String, "hello")
        XCTAssertEqual(inputs.last?["value"] as? String, "3")
        XCTAssertNil(inputs.last?["inputRevision"])
        host.destroy()
        await fulfillment(of: [disposed], timeout: 5)
    }

    func testTextMeasurementRoundsOutwardBeforeLayout() throws {
        let renderer = IOSRenderer(root: UIView())
        for text in ["Count: 0", "Count: 1", "Async form", "Status: idle"] {
            let label = UILabel()
            label.font = .systemFont(ofSize: 20)
            label.numberOfLines = 0
            label.text = text
            let intrinsic = label.sizeThatFits(CGSize(width: 208, height: CGFloat.greatestFiniteMagnitude))
            let measured = try renderer.measure(kind: "Text", text: text, fontSize: 20, maxWidth: 208)
            XCTAssertEqual(measured.width, ceil(intrinsic.width), text)
            XCTAssertEqual(measured.height, ceil(intrinsic.height), text)
        }
    }

    func testRendererAcceptsAllProtocolEventBindings() throws {
        let renderer = IOSRenderer(root: UIView())
        let events = ["tap", "changeText", "longPress", "focus", "blur", "submit", "scroll", "scrollEnd", "layout", "touchDown", "touchMove", "touchUp", "touchCancel", "spanClick", "loadSuccess", "loadFailure", "playStateDidChanged", "playTimeDidChanged", "firstFrameDidDisplay"]
        var commands: [[String: Any]] = [["type": "CreateNode", "nodeId": 1, "kind": "View"]]
        // Core sends disabled bindings too, even on pages without media nodes.
        for enabled in [false, true] {
            commands += events.map { ["type": "BindEvent", "nodeId": 1, "event": $0, "enabled": enabled] }
        }
        try renderer.applyJSON(JSONSerialization.data(withJSONObject: ["type": "Commit", "revision": 1, "commands": commands]))
        XCTAssertNotNil(renderer.view(for: 1))
    }

    func testDeferredStartResizeReparentAndDestroy() async throws {
        let disposed = expectation(description: "Core disposed")
        let committed = expectation(description: "Page rendered")
        let resized = expectation(description: "Page resized")
        let core = RecordingCore(disposed: disposed, committed: committed)
        core.onResize = { resized.fulfill() }
        let view = AnseronUIRenderView(createCore: { core })
        defer { view.destroy() }
        view.load(page: "counter")
        view.layoutIfNeeded()
        XCTAssertTrue(core.messages.isEmpty, "Zero size must not start Core")

        view.frame = CGRect(x: 0, y: 0, width: 320, height: 480)
        view.setNeedsLayout(); view.layoutIfNeeded()
        await fulfillment(of: [committed], timeout: 5)
        let create = try XCTUnwrap(core.messages.first { ($0["type"] as? String) == "CreateSurface" })
        XCTAssertEqual(create["page"] as? String, "counter")
        XCTAssertEqual(create["width"] as? Double, 320)
        XCTAssertEqual(create["height"] as? Double, 480)

        view.frame.size = CGSize(width: 200, height: 300)
        view.setNeedsLayout(); view.layoutIfNeeded()
        view.setNeedsLayout(); view.layoutIfNeeded()
        await fulfillment(of: [resized], timeout: 5)
        let sizes = core.messages.filter { ($0["type"] as? String) == "Resize" }
        XCTAssertEqual(sizes.count, 1)
        XCTAssertEqual(sizes.first?["width"] as? Double, 200)
        XCTAssertEqual(sizes.first?["height"] as? Double, 300)

        let parent = UIView()
        parent.addSubview(view)
        view.removeFromSuperview()
        parent.addSubview(view)
        XCTAssertFalse(view.isDestroyed)
        XCTAssertEqual(view.page, "counter")
        XCTAssertFalse(core.messages.contains { ($0["type"] as? String) == "DestroySurface" })
        view.destroy(); view.destroy()
        await fulfillment(of: [disposed], timeout: 5)
        XCTAssertTrue(view.isDestroyed)
        XCTAssertNil(view.page)
        XCTAssertTrue(view.subviews.isEmpty)
        XCTAssertEqual(core.messages.filter { ($0["type"] as? String) == "DestroySurface" }.count, 1)
    }

    func testReplacementKeepsNewRootAndSuppressesOldCallbacks() async throws {
        let firstDisposed = expectation(description: "Old Core disposed")
        let secondDisposed = expectation(description: "New Core disposed")
        let unusedCommit = XCTestExpectation(description: "Old commit may be retired")
        let newCommit = expectation(description: "New page rendered")
        let first = RecordingCore(disposed: firstDisposed, committed: unusedCommit)
        let second = RecordingCore(disposed: secondDisposed, committed: newCommit)
        let lock = NSLock()
        let firstCreated = DispatchSemaphore(value: 0)
        var cores = [first, second]
        let view = AnseronUIRenderView(frame: CGRect(x: 0, y: 0, width: 320, height: 480), createCore: {
            lock.lock(); defer { lock.unlock() }
            let core = cores.removeFirst()
            if core === first { firstCreated.signal() }
            return core
        })
        defer { view.destroy() }
        var readyCount = 0
        view.onReady = { readyCount += 1 }
        view.load(page: "counter")
        // Ensure Core exists while keeping the UI queue blocked so its Ready callback is stale.
        XCTAssertEqual(firstCreated.wait(timeout: .now() + 5), .success)
        let oldRoot = try XCTUnwrap(view.subviews.first)
        view.load(page: "async-form")
        let newRoot = try XCTUnwrap(view.subviews.first)
        XCTAssertFalse(oldRoot === newRoot)
        await fulfillment(of: [firstDisposed, newCommit], timeout: 5)
        XCTAssertEqual(readyCount, 1)
        XCTAssertTrue(view.subviews.first === newRoot)
        XCTAssertEqual((newRoot.subviews.first as? UILabel)?.text, "async-form")
        view.destroy()
        await fulfillment(of: [secondDisposed], timeout: 5)
    }

    func testDestroyBeforeLayoutDoesNotCreateCore() {
        let view = AnseronUIRenderView(createCore: {
            XCTFail("Destroyed pending page must not create Core")
            throw HostError.invalidOutput
        })
        view.load(page: "counter")
        view.destroy(); view.destroy()
        view.frame.size = CGSize(width: 320, height: 480)
        view.setNeedsLayout(); view.layoutIfNeeded()
        XCTAssertTrue(view.isDestroyed)
        XCTAssertNil(view.page)
        XCTAssertTrue(view.subviews.isEmpty)
    }

    func testFailureAllowsLayoutAndReload() async {
        let failed = expectation(description: "Startup failed")
        let committed = expectation(description: "Replacement rendered")
        let disposed = expectation(description: "Replacement disposed")
        let core = RecordingCore(disposed: disposed, committed: committed)
        var attempts = 0
        let view = AnseronUIRenderView(frame: CGRect(x: 0, y: 0, width: 320, height: 480), createCore: {
            attempts += 1
            if attempts == 1 { throw HostError.invalidOutput }
            return core
        })
        defer { view.destroy() }
        view.onFailure = { _ in failed.fulfill() }
        view.load(page: "counter")
        await fulfillment(of: [failed], timeout: 5)
        view.frame.size = CGSize(width: 200, height: 300)
        view.setNeedsLayout(); view.layoutIfNeeded()
        view.load(page: "async-form")
        await fulfillment(of: [committed], timeout: 5)
        view.destroy()
        await fulfillment(of: [disposed], timeout: 5)
        XCTAssertEqual(attempts, 2)
    }
}
