import XCTest
import UIKit
import AnseronUIDemo

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

@MainActor final class RenderViewTests: XCTestCase {
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
