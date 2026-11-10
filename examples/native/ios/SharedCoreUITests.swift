import XCTest
import UIKit

final class SharedCoreUITests: XCTestCase {
    func testRoutingWithParametersAndReplacement() {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.buttons["+1"].waitForExistence(timeout: 15)); app.buttons["+1"].tap()
        app.buttons["打开 Async Form"].tap()
        let params = app.staticTexts["form-route-params"]
        XCTAssertTrue(params.waitForExistence(timeout: 15))
        expectation(for: NSPredicate(format: "label CONTAINS %@", "\"count\":1"), evaluatedWith: params); waitForExpectations(timeout: 10)
        XCTAssertTrue(params.label.contains("来自 Counter 的参数"))
        app.buttons["替换当前页并传参"].tap()
        expectation(for: NSPredicate(format: "label CONTAINS %@", "replace 的新参数"), evaluatedWith: params); waitForExpectations(timeout: 10)
        app.buttons["返回 Counter"].tap()
        let root = app.staticTexts["counter-route-params"]
        XCTAssertTrue(root.waitForExistence(timeout: 15))
        expectation(for: NSPredicate(format: "label == %@", "路由参数: {}"), evaluatedWith: root); waitForExpectations(timeout: 10)
    }

    func testRouteParametersAndPreservedPageState() {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.staticTexts["Count: 0"].waitForExistence(timeout: 15))
        app.buttons["+1"].tap()
        app.buttons["打开 Async Form"].tap()
        let params = app.staticTexts["form-route-params"]
        expectation(for: NSPredicate(format: "label CONTAINS %@", "\"count\":1"), evaluatedWith: params); waitForExpectations(timeout: 15)
        let field = app.textFields["form-draft"]
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText("retained draft")
        app.buttons["打开 Counter 后返回验证表单保留"].tap()
        XCTAssertTrue(app.staticTexts["Count: 0"].waitForExistence(timeout: 15))
        app.buttons["返回上一页"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 15)); XCTAssertEqual(field.value as? String, "retained draft")
        app.buttons["替换当前页并传参"].tap()
        expectation(for: NSPredicate(format: "label CONTAINS %@", "replace 的新参数"), evaluatedWith: params); waitForExpectations(timeout: 15)
        XCTAssertEqual(field.value as? String, "Task name", "replace creates a fresh form")
        app.buttons["返回 Counter"].tap()
        XCTAssertTrue(app.staticTexts["Count: 1"].waitForExistence(timeout: 15))
    }

    func testStandardNativeServicesShowcase() {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.segmentedControls.buttons["扩展"].waitForExistence(timeout: 15))
        app.segmentedControls.buttons["扩展"].tap()
        let info = app.buttons["native-info"]
        XCTAssertTrue(info.waitForExistence(timeout: 15))
        let scroll = app.scrollViews["extensions-scroll"]
        for _ in 0..<8 { if info.isHittable { break }; scroll.swipeUp() }
        XCTAssertTrue(info.isHittable); info.tap()
        let status = app.staticTexts["native-status"]
        expectation(for: NSPredicate(format: "label CONTAINS %@", "iOS"), evaluatedWith: status); waitForExpectations(timeout: 15)
        let storage = app.buttons["native-storage"]
        for _ in 0..<6 { if storage.isHittable { break }; scroll.swipeUp() }
        XCTAssertTrue(storage.isHittable); storage.tap()
        expectation(for: NSPredicate(format: "label CONTAINS %@", "AnseronUI 原生能力示例"), evaluatedWith: status); waitForExpectations(timeout: 15)
        let inbox = app.buttons["device-notification-inbox"]
        for _ in 0..<24 { if inbox.isHittable { break }; scroll.swipeUp() }
        XCTAssertTrue(inbox.isHittable); inbox.tap()
        let deviceStatus = app.staticTexts["device-status"]
        expectation(for: NSPredicate(format: "label BEGINSWITH %@", "["), evaluatedWith: deviceStatus); waitForExpectations(timeout: 15)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "standard-native-services"; shot.lifetime = .keepAlways; add(shot)
    }

    func testAnimationShowcase() {
        let app = XCUIApplication()
        app.launchArguments += ["--components"]
        app.launch()
        let toggle = app.buttons["animation-mode-toggle"]
        XCTAssertTrue(toggle.waitForExistence(timeout:15))
        expectation(for:NSPredicate { _, _ in toggle.frame.width == 52 && toggle.frame.minX > 100 },evaluatedWith:toggle)
        waitForExpectations(timeout:5)
        toggle.tap()
        let box = app.otherElements["animation-layout-box"]
        XCTAssertTrue(box.waitForExistence(timeout:10))
        XCTAssertEqual(box.frame.width,70,accuracy:1)
        app.buttons["animation-layout-toggle"].tap()
        expectation(for:NSPredicate { _, _ in abs(box.frame.width-140)<1 },evaluatedWith:box)
        waitForExpectations(timeout:5)
        app.buttons["animation-sequence"].tap()
        let status = app.staticTexts["animation-status"]
        expectation(for:NSPredicate(format:"label == %@","串行动画完成"),evaluatedWith:status)
        waitForExpectations(timeout:8)
        // Starting an infinite animation and leaving the page must tear down its display link.
        app.scrollViews["component-scroll"].swipeUp()
        app.buttons["animation-repeat-toggle"].tap()
        app.buttons["animation-mode-toggle"].tap()
        XCTAssertTrue(app.otherElements["style-box"].waitForExistence(timeout:10))
    }

    func testLayoutStylesAndFloatingBall() {
        let app = XCUIApplication()
        app.launchArguments += ["--components"]
        app.launch()
        let ball = app.otherElements["floating-ball"]
        XCTAssertTrue(ball.waitForExistence(timeout: 15))
        expectation(for: NSPredicate { _, _ in ball.frame.width == 56 && abs(ball.frame.minX - 248) < 2 }, evaluatedWith: ball)
        waitForExpectations(timeout: 10)
        let before = ball.frame
        let scroll = app.scrollViews["component-scroll"]
        let styleBox = app.otherElements["style-box"]
        let boxBefore = styleBox.frame
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let start = origin.withOffset(CGVector(dx: before.midX, dy: before.midY))
        let end = origin.withOffset(CGVector(dx: before.midX - 70, dy: before.midY + 130))
        start.press(forDuration: 0.1, thenDragTo: end)
        XCTAssertEqual(ball.frame.minX, before.minX - 70, accuracy: 3)
        XCTAssertEqual(ball.frame.minY, before.minY + 130, accuracy: 3)
        XCTAssertEqual(styleBox.frame.minY, boxBefore.minY, accuracy: 2, "Dragging the overlay must not scroll")
        let fixed = ball.frame
        scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.85)).press(forDuration: 0.05,
            thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.4)))
        XCTAssertEqual(ball.frame.minY, fixed.minY, accuracy: 2)
        app.buttons["layout-mode-toggle"].tap()
        let measured = app.staticTexts["layout-measurement"]
        expectation(for: NSPredicate(format: "label == %@", "画布: 280 · 实测: 280 × 64"), evaluatedWith: measured)
        waitForExpectations(timeout: 10)
        let row = app.otherElements["layout-between"]
        XCTAssertEqual(row.frame.width, 280, accuracy: 1)
        app.buttons["layout-width-toggle"].tap()
        expectation(for: NSPredicate(format: "label == %@", "画布: 220 · 实测: 220 × 64"), evaluatedWith: measured)
        waitForExpectations(timeout: 10)
        XCTAssertEqual(row.frame.width, 220, accuracy: 1)
        XCTAssertEqual(ball.frame.minY, fixed.minY, accuracy: 2)
    }

    func testAllBasicComponents() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleInterfaceStyle", "Light"]
        app.launch()
        app.segmentedControls.buttons["组件"].tap()
        let scroll = app.scrollViews["component-scroll"]
        XCTAssertTrue(scroll.waitForExistence(timeout: 15))
        func reveal(_ element: XCUIElement) {
            for _ in 0..<10 {
                if element.exists && element.isHittable && element.frame.minY >= scroll.frame.minY && element.frame.maxY <= scroll.frame.maxY { return }
                let upwards = !element.exists || element.frame.minY >= scroll.frame.minY
                scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: upwards ? 0.8 : 0.3))
                    .press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: upwards ? 0.3 : 0.8)))
            }
            XCTFail("Component cannot be reached: \(element)")
        }
        func expect(_ id: String, _ value: String) {
            let label = app.staticTexts[id]
            let predicate = NSPredicate(format: "label == %@", value)
            expectation(for: predicate, evaluatedWith: label)
            waitForExpectations(timeout: 15)
        }
        let increment = app.buttons["component-increment"]
        reveal(increment); increment.tap()
        expect("component-count", "点击: 1")
        XCTAssertFalse(app.buttons["component-disabled"].isEnabled)
        let input = app.textFields["component-input"]
        reveal(input); input.tap(); input.typeText("AnseronUI\n")
        expect("input-echo", "输入: AnseronUI")

        let rich = app.descendants(matching: .any)["component-rich"].firstMatch
        reveal(rich)
        // Tap the underlined fourth span on the first line.
        let prefix = ("普通 " as NSString).size(withAttributes: [.font: UIFont.systemFont(ofSize: 16)]).width
            + ("粗体 " as NSString).size(withAttributes: [.font: UIFont.boldSystemFont(ofSize: 16)]).width
            + ("斜体 " as NSString).size(withAttributes: [.font: UIFont.italicSystemFont(ofSize: 16)]).width
        rich.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: prefix + 10, dy: 10)).tap()
        expect("component-event", "事件: rich span 3")

        let pad = app.otherElements["touch-pad"]
        reveal(pad)
        pad.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).press(forDuration: 0.1,
            thenDragTo: pad.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5)))
        expect("component-event", "事件: touch up")
        XCTAssertNotEqual(app.staticTexts["touch-moves"].label, "移动事件: 0")
        XCTAssertEqual(app.staticTexts["touch-bubble"].label, "外层收到移动: 0")
        let propagation = app.buttons["允许事件冒泡"]
        reveal(propagation); propagation.tap()
        XCTAssertTrue(app.buttons["阻止事件冒泡"].waitForExistence(timeout: 5))
        let movedPad = app.otherElements["touch-pad"]
        reveal(movedPad)
        movedPad.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).press(forDuration: 0.1,
            thenDragTo: movedPad.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5)))
        let bubbled = NSPredicate(format: "label BEGINSWITH '外层收到移动: ' AND label != '外层收到移动: 0'")
        expectation(for: bubbled, evaluatedWith: app.staticTexts["touch-bubble"])
        waitForExpectations(timeout: 5)

        XCTAssertNotEqual(app.staticTexts["touch-capture"].label, "捕获收到移动: 0")
        // Ending outside the original pad must still complete the original stream.
        reveal(pad)
        pad.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.5)).press(forDuration: 0.1,
            thenDragTo: pad.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 1.25)))
        expect("component-event", "事件: touch up")
        let actionToggle = app.buttons["touch-action-toggle"]
        reveal(actionToggle); actionToggle.tap()
        XCTAssertTrue(app.buttons["切换为允许纵向滚动"].waitForExistence(timeout: 5))
        reveal(pad)
        let initialY = pad.frame.minY
        pad.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.8)).press(forDuration: 0.1,
            thenDragTo: pad.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.2)))
        expect("component-event", "事件: touch up")
        XCTAssertEqual(pad.frame.minY, initialY, accuracy: 2, "touchAction none must retain vertical drags")
        reveal(actionToggle); actionToggle.tap()
        reveal(pad)
        pad.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.8)).press(forDuration: 0.1,
            thenDragTo: pad.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.1)))
        expect("component-event", "事件: touch cancel")

        let imageState = app.staticTexts["image-state"]
        reveal(imageState); expect("image-state", "Image: loaded")
        let image = app.images["component-image"]
        XCTAssertTrue(image.exists)
        let imageAttachment = XCTAttachment(screenshot: image.screenshot()); imageAttachment.name = "Image"; imageAttachment.lifetime = .keepAlways; add(imageAttachment)

        let play = app.buttons["video-play"]
        reveal(play); play.tap()
        expect("video-state", "Video: playing")
        let progress = NSPredicate(format: "label CONTAINS '首帧: yes' AND NOT (label BEGINSWITH '进度: 0s')")
        expectation(for: progress, evaluatedWith: app.staticTexts["video-progress"])
        waitForExpectations(timeout: 15)
        app.buttons["video-pause"].tap(); expect("video-state", "Video: paused")
        app.buttons["video-stop"].tap()
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "Components media"; attachment.lifetime = .keepAlways; add(attachment)
        let footer = app.staticTexts["scroll-footer"]
        reveal(footer)
        XCTAssertFalse(footer.label.hasSuffix("滚动: 0"))
        app.segmentedControls.buttons["Counter"].tap()
        XCTAssertTrue(app.staticTexts["Count: 0"].waitForExistence(timeout: 15))
    }

    func testNativeExtensions() {
        let app = XCUIApplication()
        app.launchArguments += ["--extensions"]
        app.launch()
        func expect(_ id: String, _ value: String) {
            expectation(for: NSPredicate(format: "label == %@", value), evaluatedWith: app.staticTexts[id])
            waitForExpectations(timeout: 15)
        }
        XCTAssertTrue(app.buttons["读取平台信息"].waitForExistence(timeout: 15))
        app.buttons["读取平台信息"].tap(); expect("extension-platform", "平台: iOS")
        let control = app.switches["demo-switch-control"]
        XCTAssertTrue(control.exists)
        control.tap(); expect("extension-value", "开关: on")
        expect("extension-status", "状态: native change")
        app.buttons["更新原生属性"].tap(); expect("extension-value", "开关: off")
        XCTAssertEqual(control.value as? String, "0")
        app.buttons["调用原生方法"].tap(); expect("extension-status", "状态: ref toggle")
        XCTAssertEqual(control.value as? String, "1")
        app.buttons["测量原生节点"].tap(); expect("extension-status", "状态: measure 100")
        app.buttons["组件 ref 聚焦"].tap(); expect("extension-status", "状态: component focus")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        app.textFields["extension-input"].typeText("ref test\n")
        app.buttons["卸载原生组件"].tap()
        XCTAssertFalse(control.exists)
        app.buttons["检查卸载 ref"].tap(); expect("extension-status", "状态: ref cleared / stale rejected")
        app.buttons["重新挂载"].tap(); XCTAssertTrue(control.waitForExistence(timeout: 5))
    }

    func testStartupAndPageSwitching() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["Count: 0"].waitForExistence(timeout: 15))
        app.segmentedControls.buttons["Async form"].tap()
        XCTAssertTrue(app.staticTexts["Status: idle"].waitForExistence(timeout: 15))
        app.buttons["Wait"].tap()
        XCTAssertTrue(app.staticTexts["Status: done"].waitForExistence(timeout: 15))
        app.segmentedControls.buttons["Counter"].tap()
        XCTAssertTrue(app.staticTexts["Count: 0"].waitForExistence(timeout: 15))
        app.buttons["+1"].tap()
        XCTAssertTrue(app.staticTexts["Count: 1"].waitForExistence(timeout: 15))
    }

    func testCounterTextIsVisibleAfterUpdates() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleInterfaceStyle", "Light"]
        app.launch()
        try assertVisibleCounter(app.staticTexts["Count: 0"])
        app.buttons["+1"].tap()
        try assertVisibleCounter(app.staticTexts["Count: 1"])
    }

    private func assertVisibleCounter(_ label: XCUIElement) throws {
        XCTAssertTrue(label.waitForExistence(timeout: 15))
        let screenshot = label.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = label.label
        attachment.lifetime = .keepAlways
        add(attachment)

        // Accessibility still exposes the text when its backing surface is black.
        // Check actual rendered pixels, including both background and glyphs.
        let image = try XCTUnwrap(screenshot.image.cgImage)
        let width = image.width
        let height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        try pixels.withUnsafeMutableBytes { buffer in
            let context = try XCTUnwrap(CGContext(
                data: buffer.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
            ))
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        var backgroundPixels = 0
        var glyphPixels = 0
        for offset in stride(from: 0, to: pixels.count, by: 4) {
            let red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2]
            if red > 220 && green > 220 && blue > 220 { backgroundPixels += 1 }
            if red < 100 && green < 100 && blue < 100 { glyphPixels += 1 }
        }
        XCTAssertGreaterThan(backgroundPixels, width * height / 2, "Text must show the light parent background, not a black rectangle")
        XCTAssertGreaterThan(glyphPixels, width * height / 200, "Counter glyphs must actually be visible")
        let textWidth = (label.label as NSString).size(withAttributes: [.font: UIFont.systemFont(ofSize: 20)]).width
        XCTAssertGreaterThanOrEqual(label.frame.width, ceil(textWidth), "Counter must have enough width to show the complete value")
    }

    func testSharedPages() throws {
        let app = XCUIApplication()
        app.launch()
        func expect(_ label: String) {
            XCTAssertTrue(app.staticTexts[label].waitForExistence(timeout: 15), "Missing: \(label)")
        }
        expect("Count: 0")
        app.buttons["+1"].tap()
        expect("Count: 1")
        app.segmentedControls.buttons["Async form"].tap()
        expect("Status: idle")
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("iOS shared task")
        app.buttons["Add task"].tap()
        expect("iOS shared task")
        app.buttons["Wait"].tap()
        expect("Status: done")
        app.buttons["Load message"].tap()
        expect("Status: loaded from HTTP")
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.lifetime = .keepAlways
        add(screenshot)
        app.segmentedControls.buttons["Counter"].tap()
        expect("Count: 0")
        app.buttons["+1"].tap()
        expect("Count: 1")
    }
}
