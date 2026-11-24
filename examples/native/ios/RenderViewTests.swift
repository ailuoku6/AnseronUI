import XCTest
import UIKit
@testable import AnseronUIDemo

private final class PendingImageProtocol: URLProtocol {
    static var started: XCTestExpectation?
    static var stopped: XCTestExpectation?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "cleanup-image.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Self.started?.fulfill() }
    override func stopLoading() { Self.stopped?.fulfill() }
}

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
    func testWorkerCoalescesPendingMotionWithoutCrossingGestureBoundaries() async throws {
        let entered = expectation(description: "worker blocked before startup")
        let processed = expectation(description: "all gesture input processed")
        let committed = expectation(description: "initial commit"), disposed = expectation(description: "worker disposed")
        let gate = DispatchSemaphore(value: 0)
        let core = RecordingCore(disposed: disposed, committed: committed)
        core.onInput = { input in if input["type"] as? String == "InspectRuntime" { processed.fulfill() } }
        let host = IOSHost(root: UIView(), createCore: {
            entered.fulfill()
            guard gate.wait(timeout: .now() + 10) == .success else { throw HostError.invalidOutput }
            return core
        })
        host.start(page: "test", width: 320, height: 480)
        await fulfillment(of: [entered], timeout: 5)
        func emit(_ phase: String, _ x: Double, pointer: UInt32 = 1) {
            host.renderer.onEvent?(RendererEvent(type: "NativeEvent", nodeId: 1, revision: 1,
                event: phase, x: x, y: 0, pageX: x, pageY: 0, pointerId: pointer, touches: [], targetId: 1))
        }
        emit("touchDown", 0)
        for x in 1...500 { emit("touchMove", Double(x)) }
        emit("touchUp", 500)
        emit("touchDown", 500)
        emit("touchMove", 40)
        emit("touchMove", 60, pointer: 2)
        emit("touchCancel", 60)
        host.inspectRuntime()
        gate.signal()
        await fulfillment(of: [processed, committed], timeout: 10)
        let events = core.messages.filter { $0["type"] as? String == "NativeEvent" }
        XCTAssertEqual(events.compactMap { $0["event"] as? String },
            ["touchDown", "touchMove", "touchUp", "touchDown", "touchMove", "touchMove", "touchCancel"])
        XCTAssertEqual(events.compactMap { $0["pageX"] as? Double }, [0, 500, 500, 500, 40, 60, 60])
        host.destroy()
        await fulfillment(of: [disposed], timeout: 5)
    }

    func testGlassFallbackDefaultsRespectExplicitZeroAndDarkColors() throws {
        func decoded(_ values: [String:Any]) throws -> RenderProps { try JSONDecoder().decode(RenderProps.self, from:JSONSerialization.data(withJSONObject:values)) }
        let defaults = try decoded(["glassEffect":true]).glassFallback(false,nativeGlass:false)
        XCTAssertEqual(defaults.backgroundColor, "#f2f5facc"); XCTAssertEqual(defaults.opacity, 0.88); XCTAssertEqual(defaults.backgroundBlurRadius, 20)
        let custom = try decoded(["glassEffect":true,"backgroundColor":"transparent","opacity":0,"backgroundBlurRadius":0]).glassFallback(false,nativeGlass:false)
        XCTAssertEqual(custom.backgroundColor, "transparent"); XCTAssertEqual(custom.opacity, 0); XCTAssertEqual(custom.backgroundBlurRadius, 0)
        let dark = try decoded(["glassEffect":true,"dmBackgroundColor":"#123456"]).themed(true).glassFallback(true,nativeGlass:false)
        XCTAssertEqual(dark.backgroundColor, "#123456")
        let native = try decoded(["glassEffect":true]).glassFallback(false,nativeGlass:true)
        XCTAssertNil(native.backgroundColor); XCTAssertNil(native.opacity); XCTAssertNil(native.backgroundBlurRadius)
    }

    func testBackgroundMaterialChangesAndResetsWithoutBlurringContent() throws {
        let renderer = IOSRenderer(root:UIView())
        defer { renderer.clear() }
        var revision = 0
        func apply(_ commands:[[String:Any]]) throws {
            revision += 1
            try renderer.applyJSON(JSONSerialization.data(withJSONObject:["type":"Commit","revision":revision,"commands":commands]))
        }
        try apply([
            ["type":"CreateNode","nodeId":1,"kind":"View"],
            ["type":"SetProps","nodeId":1,"props":["backgroundBlurRadius":20,"backgroundColor":"#12345680"]],
            ["type":"InsertChild","nodeId":1,"parentId":0,"index":0],
            ["type":"CreateNode","nodeId":2,"kind":"Text"],
            ["type":"SetProps","nodeId":2,"props":["text":"Sharp content"]],
            ["type":"InsertChild","nodeId":2,"parentId":1,"index":0],
        ])
        let view = try XCTUnwrap(renderer.view(for:1) as? TSPrimitiveView)
        let child = try XCTUnwrap(renderer.view(for:2))
        let blur = try XCTUnwrap(view.contentView.subviews.compactMap { $0 as? UIVisualEffectView }.first)
        let firstEffect = try XCTUnwrap(blur.effect as? UIBlurEffect)
        XCTAssertTrue(child.superview === view.nodeContent)
        try apply([["type":"SetProps","nodeId":1,"props":["backgroundBlurRadius":7]]])
        XCTAssertNotNil(blur.effect as? UIBlurEffect)
        XCTAssertFalse(blur.effect === firstEffect)
        try apply([["type":"SetProps","nodeId":1,"props":["backgroundBlurRadius":0]]])
        XCTAssertNil(blur.effect)
        XCTAssertTrue(child.superview === view.nodeContent)
        try apply([["type":"SetProps","nodeId":1,"props":["backgroundBlurRadius":20]]])
        let reenabled = try XCTUnwrap(view.contentView.subviews.compactMap { $0 as? UIVisualEffectView }.first)
        XCTAssertNotNil(reenabled.effect as? UIBlurEffect)
        XCTAssertEqual(view.alpha, 1)
        try apply([["type":"SetProps","nodeId":1,"props":[:]]])
        XCTAssertNil(reenabled.effect)
        XCTAssertTrue(child.superview === view.nodeContent)
    }

    func testBackgroundBlurClipsItsOwnCornersWithoutClippingOverflowOrShadow() async throws {
        let renderer = IOSRenderer(root:UIView())
        defer { renderer.clear() }
        var revision = 0
        func apply(_ commands:[[String:Any]]) throws {
            revision += 1
            try renderer.applyJSON(JSONSerialization.data(withJSONObject:["type":"Commit","revision":revision,"commands":commands]))
        }
        try apply([
            ["type":"CreateNode","nodeId":1,"kind":"View"],
            ["type":"SetProps","nodeId":1,"props":["backgroundBlurRadius":20,"borderRadius":16,"backgroundColor":"#ffffff33","shadowOpacity":0.4]],
            ["type":"SetFrame","nodeId":1,"frame":["x":20,"y":20,"width":220,"height":56]],
            ["type":"InsertChild","nodeId":1,"parentId":0,"index":0],
            ["type":"CreateNode","nodeId":2,"kind":"View"],
            ["type":"SetFrame","nodeId":2,"frame":["x":-10,"y":0,"width":30,"height":30]],
            ["type":"InsertChild","nodeId":2,"parentId":1,"index":0],
        ])
        let view = try XCTUnwrap(renderer.view(for:1) as? TSPrimitiveView)
        let blur = try XCTUnwrap(view.contentView.subviews.compactMap { $0 as? UIVisualEffectView }.first)
        let child = try XCTUnwrap(renderer.view(for:2))
        XCTAssertTrue(blur.effect is UIBlurEffect)
        XCTAssertTrue(blur.clipsToBounds)
        XCTAssertEqual(blur.layer.cornerRadius,16)
        XCTAssertEqual(blur.frame,view.bounds)
        XCTAssertFalse(view.clipsToBounds,"Background rounding must preserve overflow and outer shadows")
        XCTAssertEqual(view.layer.shadowOpacity,0.4)
        XCTAssertTrue(child.superview === view.nodeContent)
        XCTAssertTrue(view.contentView.subviews.first === blur)
        try apply([
            ["type":"SetProps","nodeId":1,"props":["backgroundBlurRadius":20,"borderRadius":24]],
            ["type":"SetFrame","nodeId":1,"frame":["x":20,"y":20,"width":180,"height":72]],
        ])
        XCTAssertEqual(blur.layer.cornerRadius,24)
        XCTAssertEqual(blur.frame,view.bounds)
        let animated = expectation(description:"Background corner animation completes")
        try renderer.invoke(nodeId:1,method:"animate",args:["style":["borderRadius":8],"options":["duration":20]]) { _ in animated.fulfill() }
        await fulfillment(of:[animated],timeout:2)
        XCTAssertEqual(blur.layer.cornerRadius,8)
        // Immediate style updates must also remove a previously declared radius.
        try apply([["type":"SetProps","nodeId":1,"props":["backgroundBlurRadius":20]]])
        XCTAssertEqual(blur.layer.cornerRadius,0)
        try apply([["type":"SetProps","nodeId":1,"props":["backgroundBlurRadius":0,"borderRadius":16]]])
        XCTAssertNil(blur.effect)
        XCTAssertFalse(view.clipsToBounds)
        try apply([["type":"SetProps","nodeId":1,"props":["backgroundBlurRadius":20,"borderRadius":16,"overflow":"hidden"]]])
        XCTAssertTrue(view.clipsToBounds)
        let reenabled = try XCTUnwrap(view.contentView.subviews.compactMap { $0 as? UIVisualEffectView }.first)
        XCTAssertEqual(reenabled.layer.cornerRadius,16)
    }

    func testInteractiveGlassSurvivesUnrelatedCommits() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("Liquid Glass requires iOS 26") }
        let renderer = IOSRenderer(root: UIView())
        defer { renderer.clear() }
        var revision = 0
        func apply(_ commands: [[String: Any]]) throws {
            revision += 1
            try renderer.applyJSON(JSONSerialization.data(withJSONObject: ["type":"Commit","revision":revision,"commands":commands]))
        }
        try apply([
            ["type":"CreateNode","nodeId":1,"kind":"View"],
            ["type":"SetProps","nodeId":1,"props":["glassEffect":true,"glassEffectInteractive":true,"borderRadius":28]],
            ["type":"InsertChild","nodeId":1,"parentId":0,"index":0],
        ])
        let view = try XCTUnwrap(renderer.view(for: 1) as? UIVisualEffectView)
        let effect = try XCTUnwrap(view.effect as? UIGlassEffect)
        XCTAssertTrue(effect.isInteractive)
        var replacements = 0
        let observation = view.observe(\.effect) { _, _ in replacements += 1 }
        defer { observation.invalidate() }
        try apply([["type":"SetProps","nodeId":1,"props":["glassEffect":true,"glassEffectInteractive":true,"borderRadius":28,"testID":"dragging"]]])
        XCTAssertEqual(replacements, 0, "Touch state commits must not reset the active glass highlight")
        try apply([["type":"SetProps","nodeId":1,"props":["glassEffect":true,"glassEffectInteractive":true,"disabled":true]]])
        XCTAssertGreaterThan(replacements, 0, "Changing glass configuration must replace the effect")
        XCTAssertFalse(try XCTUnwrap(view.effect as? UIGlassEffect).isInteractive)
        try apply([["type":"SetProps","nodeId":1,"props":["glassEffect":true,"glassEffectInteractive":true]]])
        XCTAssertTrue(try XCTUnwrap(view.effect as? UIGlassEffect).isInteractive)
        try apply([["type":"SetProps","nodeId":1,"props":["glassEffect":true]]])
        XCTAssertFalse(try XCTUnwrap(view.effect as? UIGlassEffect).isInteractive)
        try apply([["type":"SetProps","nodeId":1,"props":[:]]])
        XCTAssertNil(view.effect)
    }

    @MainActor func testAccessibilitySemanticsActionsAndReset() throws {
        let root = UIView()
        let renderer = IOSRenderer(root: root)
        var events: [RendererEvent] = []
        renderer.onEvent = { events.append($0) }
        var revision = 0
        func apply(_ commands: [[String: Any]]) throws {
            revision += 1
            try renderer.applyJSON(JSONSerialization.data(withJSONObject: ["type":"Commit","revision":revision,"commands":commands]))
        }
        try apply([
            ["type":"CreateNode","nodeId":1,"kind":"View"],
            ["type":"SetProps","nodeId":1,"props":["accessibilityRole":"checkbox","accessibilityLabel":"通知","accessibilityHint":"切换通知","accessibilityChecked":true]],
            ["type":"InsertChild","nodeId":1,"parentId":0,"index":0],
            ["type":"BindEvent","nodeId":1,"event":"tap","enabled":true],
            ["type":"BindEvent","nodeId":1,"event":"longPress","enabled":true],
        ])
        let node = try XCTUnwrap(root.subviews.first)
        XCTAssertTrue(node.isAccessibilityElement)
        XCTAssertEqual(node.accessibilityLabel, "通知")
        XCTAssertTrue(node.accessibilityTraits.contains(.button))
        XCTAssertTrue(node.accessibilityTraits.contains(.selected))
        XCTAssertTrue(node.accessibilityActivate())
        XCTAssertEqual(events.last?.type, "Tap")
        let action = try XCTUnwrap(node.accessibilityCustomActions?.first)
        XCTAssertTrue(action.actionHandler?(action) == true)
        XCTAssertEqual(events.last?.event, "longPress")
        try apply([["type":"SetProps","nodeId":1,"props":["accessibilityRole":"button","disabled":true]]])
        XCTAssertFalse(node.accessibilityActivate())
        XCTAssertTrue(node.accessibilityTraits.contains(.notEnabled))
        try apply([["type":"SetProps","nodeId":1,"props":["accessibilityRole":"none"]]])
        XCTAssertFalse(node.isAccessibilityElement)
        try apply([["type":"SetProps","nodeId":1,"props":["accessibilityHidden":true]]])
        XCTAssertTrue(node.accessibilityElementsHidden)
        try apply([["type":"SetProps","nodeId":1,"props":[:]]])
        XCTAssertNil(node.accessibilityLabel)
        XCTAssertNil(node.accessibilityHint)
        XCTAssertNil(node.accessibilityValue)
        XCTAssertFalse(node.accessibilityElementsHidden)
        XCTAssertFalse(node.accessibilityTraits.contains(.selected))
        renderer.clear()
    }

    func testPageCleanupCancelsAnInFlightImageRequest() async throws {
        let started = expectation(description: "image request started"), stopped = expectation(description: "image request cancelled")
        PendingImageProtocol.started = started; PendingImageProtocol.stopped = stopped
        URLProtocol.registerClass(PendingImageProtocol.self)
        let renderer = IOSRenderer(root: UIView())
        defer {
            renderer.clear(); URLProtocol.unregisterClass(PendingImageProtocol.self)
            PendingImageProtocol.started = nil; PendingImageProtocol.stopped = nil
        }
        try renderer.applyJSON(JSONSerialization.data(withJSONObject: ["type": "Commit", "revision": 1, "commands": [
            ["type": "CreateNode", "nodeId": 1, "kind": "Image"],
            ["type": "SetProps", "nodeId": 1, "props": ["src": "https://cleanup-image.invalid/pending.png"]],
        ]]))
        await fulfillment(of: [started], timeout: 5)
        renderer.clear(); renderer.clear()
        await fulfillment(of: [stopped], timeout: 5)
        XCTAssertNil(renderer.view(for: 1))
    }
    func testDarkStylesAndOuterShadowRepaintWithoutChangingInput() throws {
        let root = UIView(frame:CGRect(x:0,y:0,width:320,height:480))
        let window = UIWindow(frame:root.frame)
        window.addSubview(root); window.isHidden = false
        defer { window.isHidden = true }
        func checkColor(_ actual:UIColor?, _ expected:UIColor, file:StaticString = #filePath, line:UInt = #line) {
            var r:CGFloat = 0, g:CGFloat = 0, b:CGFloat = 0, a:CGFloat = 0
            var er:CGFloat = 0, eg:CGFloat = 0, eb:CGFloat = 0, ea:CGFloat = 0
            XCTAssertNotNil(actual,file:file,line:line)
            actual?.getRed(&r,green:&g,blue:&b,alpha:&a); expected.getRed(&er,green:&eg,blue:&eb,alpha:&ea)
            XCTAssertEqual(r,er,accuracy:0.001,file:file,line:line); XCTAssertEqual(g,eg,accuracy:0.001,file:file,line:line)
            XCTAssertEqual(b,eb,accuracy:0.001,file:file,line:line); XCTAssertEqual(a,ea,accuracy:0.001,file:file,line:line)
        }
        root.overrideUserInterfaceStyle = .light
        let renderer = IOSRenderer(root:root)
        func commit(_ revision:Int, _ commands:[[String:Any]]) throws {
            try renderer.applyJSON(JSONSerialization.data(withJSONObject:["type":"Commit","revision":revision,"commands":commands]))
        }
        try commit(1, [
            ["type":"CreateNode","nodeId":1,"kind":"View"],
            ["type":"CreateNode","nodeId":2,"kind":"TextInput"],
            ["type":"CreateNode","nodeId":3,"kind":"RichText"],
            ["type":"InsertChild","nodeId":1,"parentId":0,"index":0],
            ["type":"InsertChild","nodeId":2,"parentId":1,"index":0],
            ["type":"InsertChild","nodeId":3,"parentId":1,"index":1],
            ["type":"SetProps","nodeId":1,"props":["backgroundColor":"#ffffff","dmBackgroundColor":"#111111","borderColor":"#123456","dmBorderColor":"#abcdef","borderRadius":12,"shadowColor":"#000000","dmShadowColor":"#ffffff","shadowOpacity":0.4,"shadowRadius":8,"shadowOffsetX":-2,"shadowOffsetY":4]],
            ["type":"SetFrame","nodeId":1,"frame":["x":20,"y":20,"width":200,"height":100]],
            ["type":"SetProps","nodeId":2,"props":["value":"declared","color":"#000000","dmColor":"#ffffff","placeholder":"Hint","placeholderTextColor":"#666666","dmPlaceholderTextColor":"#aaaaaa"]],
            ["type":"SetProps","nodeId":3,"props":["spans":"[{\"text\":\"span\",\"color\":\"#123456\",\"dmColor\":\"#abcdef\"}]"]]
        ])
        let card = try XCTUnwrap(renderer.view(for:1)), input = try XCTUnwrap(renderer.view(for:2) as? UITextField), rich = try XCTUnwrap(renderer.view(for:3) as? UILabel)
        XCTAssertFalse(card.clipsToBounds); XCTAssertEqual(card.layer.shadowRadius,8); XCTAssertEqual(card.layer.shadowOffset,CGSize(width:-2,height:4)); XCTAssertEqual(card.layer.shadowOpacity,0.4)
        XCTAssertEqual(card.layer.shadowPath?.boundingBox,card.bounds)
        input.text = "local unsent"
        let frame = card.frame
        root.overrideUserInterfaceStyle = .dark
        renderer.appearanceChanged()
        XCTAssertEqual(root.traitCollection.userInterfaceStyle,.dark)
        checkColor(card.backgroundColor,UIColor(white:17.0/255,alpha:1))
        checkColor(card.layer.shadowColor.map { UIColor(cgColor:$0) },.white)
        XCTAssertEqual(input.text,"local unsent"); checkColor(input.textColor,.white)
        checkColor(input.attributedPlaceholder?.attribute(.foregroundColor,at:0,effectiveRange:nil) as? UIColor,UIColor(white:170.0/255,alpha:1))
        checkColor(rich.attributedText?.attribute(.foregroundColor,at:0,effectiveRange:nil) as? UIColor,UIColor(red:171.0/255,green:205.0/255,blue:239.0/255,alpha:1))
        XCTAssertEqual(card.frame,frame)
        root.overrideUserInterfaceStyle = .light
        renderer.appearanceChanged()
        checkColor(card.backgroundColor,.white); checkColor(input.textColor,.black)
        try commit(2,[["type":"SetProps","nodeId":1,"props":["backgroundColor":"#eeeeee"]]])
        root.overrideUserInterfaceStyle = .dark
        renderer.appearanceChanged()
        checkColor(card.backgroundColor,UIColor(white:238.0/255,alpha:1)); XCTAssertEqual(card.layer.shadowOpacity,0)
        try commit(3,[["type":"SetProps","nodeId":1,"props":["borderRadius":12,"overflow":"hidden"]]])
        XCTAssertTrue(card.clipsToBounds)
        renderer.clear()
    }
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

    func testBackGestureSettlesImmediatelyWhileCoreInterceptionIsPending() async throws {
        let committed = expectation(description: "pages mounted"); committed.expectedFulfillmentCount = 2
        let disposed = expectation(description: "pages disposed"); disposed.expectedFulfillmentCount = 2
        let view = AnseronUIRenderView(frame: CGRect(x: 0, y: 0, width: 320, height: 480), createCore: {
            RecordingCore(disposed: disposed, committed: committed)
        })
        view.load(page: "counter")
        view.push(page: "async-form")
        await fulfillment(of: [committed], timeout: 5)
        let gesture = BackDrag()
        view.perform(NSSelectorFromString("handleBackGesture:"), with: gesture)
        gesture.phase = .changed; gesture.offset = 180
        view.perform(NSSelectorFromString("handleBackGesture:"), with: gesture)
        gesture.phase = .ended
        let start = Date()
        view.perform(NSSelectorFromString("handleBackGesture:"), with: gesture)
        XCTAssertLessThan(Date().timeIntervalSince(start), 0.1, "Ending the edge gesture must not wait for Core")
        XCTAssertEqual(view.routeStack, ["counter", "async-form"], "Navigation waits for async back interception")
        let settled = expectation(description: "interception timeout and transition completed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { settled.fulfill() }
        await fulfillment(of: [settled], timeout: 3)
        XCTAssertEqual(view.routeStack, ["counter"])
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

    func testVisibilityAndMemoryPressureRemountWithOriginalParams() async throws {
        let committed = expectation(description: "three instances mounted"); committed.expectedFulfillmentCount = 3
        let disposed = expectation(description: "three instances disposed"); disposed.expectedFulfillmentCount = 3
        var cores: [RecordingCore] = []
        let lock = NSLock()
        let view = AnseronUIRenderView(frame: CGRect(x:0,y:0,width:320,height:480), createCore: {
            let core = RecordingCore(disposed: disposed, committed: committed)
            lock.lock(); cores.append(core); lock.unlock()
            return core
        })
        defer { view.destroy() }
        func until(_ condition: () -> Bool) async {
            let deadline = Date(timeIntervalSinceNow: 5)
            while !condition() && Date() < deadline { try? await Task.sleep(nanoseconds: 10_000_000) }
            XCTAssertTrue(condition())
        }
        func instances() -> [RecordingCore] { lock.lock(); defer { lock.unlock() }; return cores }
        view.setVisibility(false)
        view.load(page:"counter",params:["origin":"root"])
        await until { instances().first?.messages.contains { $0["type"] as? String == "CreateSurface" } == true }
        let first = try XCTUnwrap(instances().first)
        XCTAssertEqual(first.messages.first { $0["type"] as? String == "CreateSurface" }?["visible"] as? Bool, false)
        view.setVisibility(true)
        await until { first.messages.contains { $0["type"] as? String == "SurfaceVisibility" && $0["visible"] as? Bool == true } }
        await until { first.messages.contains { $0["type"] as? String == "CommitAck" } }
        view.push(page:"timers"); view.layoutIfNeeded()
        await until { instances().count == 2 && instances()[1].messages.contains { $0["type"] as? String == "CommitAck" } }
        var evicted: [String] = []; view.onPageEvicted = { evicted.append($0) }
        NotificationCenter.default.post(name:UIApplication.didReceiveMemoryWarningNotification, object:nil)
        XCTAssertEqual(evicted,["counter"])
        XCTAssertEqual(view.routeStack,["counter","timers"])
        XCTAssertTrue(view.pop()); view.layoutIfNeeded()
        XCTAssertEqual(view.routeParams["origin"] as? String,"root")
        await until { instances().count == 3 }
        await fulfillment(of:[committed],timeout:5)
        view.destroy()
        await fulfillment(of:[disposed],timeout:5)
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

    func testTextLineHeightAndDarkImageSource() throws {
        let root = UIView(); root.overrideUserInterfaceStyle = .light
        let renderer = IOSRenderer(root: root)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { renderer.clear(); try? FileManager.default.removeItem(at: directory) }
        func image(_ name: String, _ size: CGSize) throws -> String {
            let format = UIGraphicsImageRendererFormat(); format.scale = 1
            let image = UIGraphicsImageRenderer(size: size, format: format).image { context in UIColor.blue.setFill(); context.fill(CGRect(origin: .zero, size: size)) }
            let url = directory.appendingPathComponent(name + ".png"); try image.pngData()!.write(to: url); return url.absoluteString
        }
        let light = try image("light", CGSize(width: 8, height: 4)), dark = try image("dark", CGSize(width: 12, height: 6))
        try renderer.applyJSON(JSONSerialization.data(withJSONObject: ["type": "Commit", "revision": 1, "commands": [
            ["type": "CreateNode", "nodeId": 1, "kind": "Image"],
            ["type": "SetProps", "nodeId": 1, "props": ["src": light, "dmSrc": dark]],
            ["type": "CreateNode", "nodeId": 2, "kind": "Text"],
            ["type": "SetProps", "nodeId": 2, "props": ["text": "first\nsecond", "fontSize": 16, "lineHeight": 30]],
        ]]))
        let view = try XCTUnwrap(renderer.view(for: 1) as? UIImageView)
        XCTAssertEqual(view.image?.size.width, 8)
        root.overrideUserInterfaceStyle = .dark; renderer.appearanceChanged()
        XCTAssertEqual(view.image?.size.width, 12)
        root.overrideUserInterfaceStyle = .light; renderer.appearanceChanged()
        XCTAssertEqual(view.image?.size.width, 8)
        let props = try JSONDecoder().decode(RenderProps.self, from: Data("{\"lineHeight\":30}".utf8))
        let measured = try renderer.measure(kind: "Text", text: "first\nsecond", fontSize: 16, maxWidth: 200, props: props)
        XCTAssertEqual(measured.height, 60, accuracy: 1)
        let label = try XCTUnwrap(renderer.view(for: 2) as? UILabel)
        let paragraph = try XCTUnwrap(label.attributedText?.attribute(.paragraphStyle, at: 0, effectiveRange: nil) as? NSParagraphStyle)
        XCTAssertEqual(paragraph.minimumLineHeight, 30)
        try renderer.applyJSON(JSONSerialization.data(withJSONObject: ["type": "Commit", "revision": 2, "commands": [
            ["type": "SetProps", "nodeId": 1, "props": ["src": light]],
            ["type": "SetProps", "nodeId": 2, "props": ["text": "reset"]],
        ]]))
        root.overrideUserInterfaceStyle = .dark; renderer.appearanceChanged()
        XCTAssertEqual(view.image?.size.width, 8)
        XCTAssertEqual((label.attributedText?.attribute(.paragraphStyle, at: 0, effectiveRange: nil) as? NSParagraphStyle)?.maximumLineHeight ?? 0, 0)
    }

    func testButtonDoesNotPublishAnUntouchedControlledInputWithZeroRevision() throws {
        let renderer = IOSRenderer(root: UIView())
        var events: [RendererEvent] = []
        renderer.onEvent = { events.append($0) }
        try renderer.applyJSON(JSONSerialization.data(withJSONObject: ["type": "Commit", "revision": 1, "commands": [
            ["type": "CreateNode", "nodeId": 1, "kind": "TextInput"],
            ["type": "SetProps", "nodeId": 1, "props": ["value": "预填文本"]],
            ["type": "BindEvent", "nodeId": 1, "event": "changeText", "enabled": true],
            ["type": "CreateNode", "nodeId": 2, "kind": "View"],
            ["type": "SetProps", "nodeId": 2, "props": ["accessibilityRole": "button", "accessibilityLabel": "read"]],
            ["type": "BindEvent", "nodeId": 2, "event": "tap", "enabled": true],
        ]]))
        let button = try XCTUnwrap(renderer.view(for: 2))
        XCTAssertTrue(button.accessibilityActivate())
        XCTAssertEqual(events.map { $0.type }, ["Tap"])
    }

    func testFieldPatchPreservesNativeInputAndRestoresDefaults() throws {
        let renderer = IOSRenderer(root: UIView())
        func commit(_ revision: Int, _ commands: [[String: Any]]) throws {
            try renderer.applyJSON(JSONSerialization.data(withJSONObject: ["type":"Commit", "revision":revision, "commands":commands]))
        }
        try commit(1, [["type":"CreateNode", "nodeId":1, "kind":"TextInput"],
                       ["type":"PatchProps", "nodeId":1, "set":["value":"7", "inputRevision":0, "placeholder":"hint"], "unset":[]]])
        let input = try XCTUnwrap(renderer.view(for: 1) as? UITextField)
        input.text = "local unsent"
        let patch: [[String: Any]] = [["type":"PatchProps", "nodeId":1, "set":["opacity":0.4], "unset":[]]]
        try commit(2, patch); try commit(2, patch)
        XCTAssertEqual(input.text, "local unsent"); XCTAssertEqual(input.placeholder, "hint")
        XCTAssertEqual(input.alpha, 0.4, accuracy: 0.001)
        try commit(3, [["type":"PatchProps", "nodeId":1, "set":[:], "unset":["opacity", "placeholder"]]])
        XCTAssertEqual(input.alpha, 1); XCTAssertEqual(input.text, "local unsent"); XCTAssertTrue(input.placeholder?.isEmpty ?? true)
        try commit(4, [["type":"PatchProps", "nodeId":1, "set":["value":"7", "inputRevision":1], "unset":[]]])
        XCTAssertEqual(input.text, "7")
        XCTAssertThrowsError(try commit(4, []))
        renderer.clear()
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
