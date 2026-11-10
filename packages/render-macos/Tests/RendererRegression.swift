import AppKit
import AVKit

@MainActor enum RendererRegression {
    final class TrackingRoot: FlippedView {
        var removals = 0
        override func willRemoveSubview(_ subview:NSView) { removals += 1; super.willRemoveSubview(subview) }
    }
    @MainActor final class Fixture {
        let window = NSWindow(contentRect:NSRect(x:0,y:0,width:500,height:400),styleMask:[.titled],backing:.buffered,defer:false)
        let root = TrackingRoot(frame:NSRect(x:0,y:0,width:500,height:400))
        lazy var renderer = MacOSRenderer(root:root)
        var events: [RendererEvent] = []
        var revision = 0
        init() {
            window.contentView = root
            renderer.onEvent = { [weak self] event in self?.events.append(event) }
        }
        func apply(_ commands:[[String:Any]]) throws {
            revision += 1
            try renderer.applyJSON(JSONSerialization.data(withJSONObject:["type":"Commit","revision":revision,"commands":commands]))
        }
        func create(_ id:Int,_ kind:String,_ props:[String:Any],_ frame:NSRect,parent:Int = 0) throws {
            try apply([
                ["type":"CreateNode","nodeId":id,"kind":kind],
                ["type":"SetProps","nodeId":id,"props":props],
                ["type":"InsertChild","nodeId":id,"parentId":parent,"index":0],
                ["type":"SetFrame","nodeId":id,"frame":["x":frame.minX,"y":frame.minY,"width":frame.width,"height":frame.height]],
            ])
        }
        func bind(_ id:Int,_ names:[String]) throws {
            try apply(names.map { ["type":"BindEvent","nodeId":id,"event":$0,"enabled":true] })
        }
        func widget(_ id:String) -> NSView { Integration.descendants(root).first { $0.identifier?.rawValue == id }! }
        func mouse(_ type:NSEvent.EventType,_ point:NSPoint) {
            renderer.receiveMouse(type:type,locationInWindow:root.convert(point,to:nil),window:window)
        }
        func close() { renderer.clear(); window.orderOut(nil) }
    }
    static func props(_ value:[String:Any]) throws -> RenderProps {
        try JSONDecoder().decode(RenderProps.self,from:JSONSerialization.data(withJSONObject:value))
    }
    static func pixels(_ view:NSView) -> NSBitmapImageRep {
        let image = view.bitmapImageRepForCachingDisplay(in:view.bounds)!
        view.cacheDisplay(in:view.bounds,to:image)
        return image
    }
    static func run() throws {
        try darkStyles()
        try text()
        try images()
        try input()
        try retainedViews()
        try pointer()
        try scroll()
        try animation()
        try media()
        print("PASS: renderer regressions (text layout/hits, image scaling, IME, input, mouse cancellation, animations, video lifecycle)")
    }
    static func darkStyles() throws {
        let f = Fixture(); defer { f.close() }
        f.root.appearance = NSAppearance(named:.aqua)
        try f.create(1,"View",["testID":"card","backgroundColor":"#ffffff","dmBackgroundColor":"#111111","borderColor":"#123456","dmBorderColor":"#abcdef","borderRadius":12,"shadowColor":"#000000","dmShadowColor":"#ffffff","shadowOpacity":0.4,"shadowRadius":8,"shadowOffsetX":-2,"shadowOffsetY":4],NSRect(x:20,y:20,width:200,height:100))
        try f.create(2,"TextInput",["testID":"input","value":"declared","color":"#000000","dmColor":"#ffffff","placeholder":"Hint","placeholderTextColor":"#666666","dmPlaceholderTextColor":"#aaaaaa"],NSRect(x:0,y:0,width:150,height:30),parent:1)
        try f.create(3,"RichText",["testID":"rich","spans":"[{\"text\":\"span\",\"color\":\"#123456\",\"dmColor\":\"#abcdef\"}]"],NSRect(x:0,y:40,width:150,height:30),parent:1)
        let card = f.root.subviews.first!, input = f.widget("input") as! NSTextField, rich = f.widget("rich") as! NSTextField
        input.stringValue = "local unsent"
        let frame = card.frame
        Integration.check(card.layer?.masksToBounds == false && card.layer?.shadowRadius == 8 && card.layer?.shadowOffset == CGSize(width:-2,height:4),"outer shadow geometry and radius without clipping: mask=\(String(describing:card.layer?.masksToBounds)) radius=\(String(describing:card.layer?.shadowRadius)) offset=\(String(describing:card.layer?.shadowOffset))")
        f.root.appearance = NSAppearance(named:.darkAqua); f.renderer.appearanceChanged()
        func rgb(_ color:NSColor?) -> NSColor { color!.usingColorSpace(.sRGB)! }
        Integration.check(abs(rgb(NSColor(cgColor:card.layer!.backgroundColor!)).redComponent - 17.0/255) < 0.001,"dark background")
        Integration.check(rgb(NSColor(cgColor:card.layer!.shadowColor!)).redComponent > 0.99,"dark shadow color")
        Integration.check(input.stringValue == "local unsent" && rgb(input.textColor).redComponent > 0.99,"appearance preserves input and updates text")
        Integration.check(abs(rgb(input.placeholderAttributedString!.attribute(.foregroundColor,at:0,effectiveRange:nil) as? NSColor).redComponent - 170.0/255) < 0.001,"dark placeholder")
        Integration.check(abs(rgb(rich.attributedStringValue.attribute(.foregroundColor,at:0,effectiveRange:nil) as? NSColor).redComponent - 171.0/255) < 0.001 && card.frame == frame,"dark rich span preserves frame")
        f.root.appearance = NSAppearance(named:.aqua); f.renderer.appearanceChanged()
        Integration.check(rgb(input.textColor).redComponent < 0.01,"return to light")
        try f.apply([["type":"SetProps","nodeId":1,"props":["backgroundColor":"#eeeeee"]]])
        f.root.appearance = NSAppearance(named:.darkAqua); f.renderer.appearanceChanged()
        Integration.check(abs(rgb(NSColor(cgColor:card.layer!.backgroundColor!)).redComponent - 238.0/255) < 0.001 && card.layer?.shadowOpacity == 0,"removed dark override and shadow reset")
        try f.apply([["type":"SetProps","nodeId":1,"props":["borderRadius":12,"overflow":"hidden"]]])
        Integration.check(card.layer?.masksToBounds == true,"explicit overflow still clips rounded content")
        try f.apply([["type":"SetProps","nodeId":1,"props":["borderRadius":12,"overflow":"visible"]]])
        Integration.check(card.layer?.masksToBounds == false && card.layer?.shadowPath?.boundingBox == card.bounds,"visible overflow and rounded shadow path survive animation paint")
        print("PASS: macOS dark colors, shadow geometry, span/placeholder fallback and retained input")
    }
    static func text() throws {
        let f = Fixture(); defer { f.close() }
        let spans:[[String:Any]] = [["text":"普通 👩🏽‍💻 ","color":"#d44c30"],["text":"大号文字","fontSize":30,"color":"#17926b"]]
        let attributes:[String:Any] = ["testID":"rich","fontSize":16,"spans":String(data:try JSONSerialization.data(withJSONObject:spans),encoding:.utf8)!]
        let measured = try f.renderer.measure(kind:"RichText",text:"普通 👩🏽‍💻 大号文字",fontSize:16,maxWidth:145,props:props(attributes))
        try f.create(1,"RichText",attributes,NSRect(x:0,y:0,width:measured.width,height:measured.height))
        try f.bind(1,["spanClick"])
        let label = f.widget("rich") as! DesktopTextField
        let bitmap = pixels(label)
        var coloredRows = Set<Int>()
        for y in 0..<bitmap.pixelsHigh { for x in 0..<bitmap.pixelsWide {
            guard let color = bitmap.colorAt(x:x,y:y)?.usingColorSpace(.sRGB) else { continue }
            if color.greenComponent > color.redComponent * 1.5 && color.greenComponent > color.blueComponent * 1.1 && color.alphaComponent > 0.5 { coloredRows.insert(y) }
        } }
        Integration.check(coloredRows.count >= 20,"mixed-size wrapped RichText must draw its second line without clipping")
        let layout = label.textLayout()
        let offset = (spans[0]["text"] as! NSString).length
        let glyph = layout.manager.glyphIndexForCharacter(at:offset)
        let rect = layout.manager.boundingRect(forGlyphRange:NSRange(location:glyph,length:1),in:layout.container)
        Integration.check(layout.character(at:NSPoint(x:rect.midX,y:rect.midY)) == offset,"RichText hit uses UTF-16 index after emoji")
        Integration.check(layout.character(at:NSPoint(x:label.bounds.maxX-1,y:label.bounds.maxY-1)) == nil,"blank text area must not hit nearest glyph")
        // Dispatch the recognizer action with an actual location in its view.
        let click = ClickLocation(target:nil,action:nil)
        click.point = NSPoint(x:rect.midX,y:rect.midY)
        label.addGestureRecognizer(click)
        let recognizer = label.gestureRecognizers.first { $0 is NSClickGestureRecognizer && $0 !== click }!
        _ = (recognizer.target as? NSObject)?.perform(recognizer.action!,with:click)
        Integration.check(f.events.last?.event == "spanClick" && f.events.last?.value == "1","RichText click routes to correct span")
        let centered = try props(["fontSize":16,"textAlign":"center"])
        let size = try f.renderer.measure(kind:"Text",text:"Center",fontSize:16,maxWidth:200,props:centered)
        Integration.check(size.width > 0 && size.height > 0,"centered text measurement")
        let truncated = DesktopTextLayout(NSAttributedString(string:"A very long line that must truncate",attributes:[.font:NSFont.systemFont(ofSize:16)]),size:NSSize(width:55,height:25),lines:1,lineBreak:.byTruncatingTail)
        let hidden = truncated.manager.truncatedGlyphRange(inLineFragmentForGlyphAt:0)
        Integration.check(hidden.location != NSNotFound,"single-line text truncates with TextKit")
        Integration.check(truncated.character(at:NSPoint(x:50,y:12)) == nil,"ellipsis must not activate hidden span")
    }
    final class ClickLocation: NSClickGestureRecognizer {
        var point = NSPoint.zero
        override func location(in view:NSView?) -> NSPoint { point }
    }
    static func images() throws {
        let source = NSImage(size:NSSize(width:120,height:40))
        source.lockFocus()
        NSColor.red.setFill(); NSRect(x:0,y:0,width:40,height:40).fill()
        NSColor.green.setFill(); NSRect(x:40,y:0,width:40,height:40).fill()
        NSColor.blue.setFill(); NSRect(x:80,y:0,width:40,height:40).fill()
        source.unlockFocus()
        let f = Fixture(); defer { f.close() }
        try f.create(1,"Image",["testID":"image"],NSRect(x:0,y:0,width:40,height:40))
        let view = f.widget("image") as! DesktopImageView
        view.image = source; view.resizeMode = "cover"
        let cover = pixels(view)
        let green = cover.colorAt(x:cover.pixelsWide/2,y:2)!.usingColorSpace(.sRGB)!
        Integration.check(green.greenComponent > 0.8 && green.greenComponent > green.redComponent * 1.5 && green.greenComponent > green.blueComponent * 1.5,"cover must fill and center-crop, including top edge")
        view.resizeMode = "contain"
        let contain = pixels(view)
        Integration.check(contain.colorAt(x:contain.pixelsWide/2,y:2)!.alphaComponent < 0.1,"contain must letterbox without stretching")
        let file = URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent("examples/components/assets/showcase.png")
        try f.bind(1,["loadFailure"])
        try f.apply([["type":"SetProps","nodeId":1,"props":["testID":"image","src":"invalid://source","placeholderSrc":file.absoluteString]]])
        Integration.wait("image failure callback") { f.events.contains { $0.event == "loadFailure" } }
        Integration.check(view.image != nil,"failed main image must preserve loaded placeholder")
    }
    static func input() throws {
        let f = Fixture(); defer { f.close() }
        try f.create(1,"TextInput",["testID":"input","value":"","maxLength":2,"placeholder":"提示","placeholderTextColor":"#d44c30","autoCorrect":true],NSRect(x:10,y:10,width:200,height:40))
        try f.bind(1,["changeText","focus","blur","submit"])
        let field = f.widget("input") as! NSTextField
        f.window.makeKeyAndOrderFront(nil)
        Integration.check(f.window.makeFirstResponder(field),"input focus")
        guard let editor = field.currentEditor() as? NSTextView else { Integration.check(false,"native field editor"); return }
        editor.setMarkedText("ni",selectedRange:NSRange(location:2,length:0),replacementRange:NSRange(location:NSNotFound,length:0))
        f.renderer.controlTextDidChange(Notification(name:NSControl.textDidChangeNotification,object:field))
        Integration.check(!f.events.contains { $0.type == "InputChange" },"IME preedit must not enter controlled TS state")
        try f.apply([["type":"SetProps","nodeId":1,"props":["testID":"input","value":"stale","maxLength":2,"inputRevision":0]]])
        Integration.check(editor.hasMarkedText() && editor.string == "ni","stale render must not overwrite composition")
        _ = (field.target as? NSObject)?.perform(field.action!,with:field)
        Integration.check(!f.events.contains { $0.event == "submit" },"composition confirmation must not submit form")
        editor.insertText("你好世界",replacementRange:NSRange(location:0,length:(editor.string as NSString).length))
        f.renderer.controlTextDidChange(Notification(name:NSControl.textDidChangeNotification,object:field))
        Integration.check(field.stringValue == "你好" && f.events.last(where: { $0.type == "InputChange" })?.value == "你好","committed IME obeys maxLength")
        let inputRevision = f.events.last(where: { $0.type == "InputChange" })!.inputRevision!
        try f.apply([["type":"SetProps","nodeId":1,"props":["testID":"input","value":"stale","inputRevision":inputRevision-1]]])
        Integration.check(field.stringValue == "你好","old input revision must not clobber latest typing")
        try f.apply([["type":"SetProps","nodeId":1,"props":["testID":"input","value":"复制","editable":false,"placeholder":"提示","placeholderTextColor":"#d44c30"]]])
        Integration.check(!field.isEditable && field.isSelectable,"read-only inputs must allow selection and copy")
        let color = field.placeholderAttributedString!.attribute(.foregroundColor,at:0,effectiveRange:nil) as! NSColor
        Integration.check(color.usingColorSpace(.sRGB)!.redComponent > 0.7,"placeholder color")
        try f.create(2,"TextInput",["testID":"other","value":"other"],NSRect(x:10,y:60,width:200,height:40))
        let other = f.widget("other") as! NSTextField
        f.window.makeFirstResponder(other)
        let responder = f.window.firstResponder
        try f.apply([["type":"SetProps","nodeId":1,"props":["testID":"input","value":"复制","secureTextEntry":true]]])
        Integration.check(f.window.firstResponder === responder,"changing another input to secure entry must not steal focus")
    }
    static func pointer() throws {
        let f = Fixture(); defer { f.close() }
        try f.create(1,"View",["testID":"parent"],NSRect(x:20,y:30,width:200,height:150))
        try f.create(2,"View",["testID":"child"],NSRect(x:40,y:50,width:80,height:60),parent:1)
        try f.bind(1,["touchDown","touchMove","touchUp","touchCancel"])
        f.window.makeKeyAndOrderFront(nil)
        f.mouse(.leftMouseDown,NSPoint(x:65,y:87))
        let down = f.events.last { $0.event == "touchDown" }
        Integration.check(down?.targetId == 2 && down?.x == 5 && down?.y == 7,"mouse coordinates must be relative to initial target, not listener ancestor")
        f.mouse(.leftMouseDragged,NSPoint(x:150,y:160))
        Integration.check(f.events.last?.targetId == 2 && f.events.last?.x == 90,"drag retains initial target outside its bounds")
        NotificationCenter.default.post(name:NSWindow.didResignKeyNotification,object:f.window)
        Integration.check(f.events.last?.event == "touchCancel" && f.events.last?.touches?.isEmpty == true,"window focus loss cancels active drag")
        f.mouse(.leftMouseUp,NSPoint(x:150,y:160))
        Integration.check(f.events.last?.event == "touchCancel","cancelled drag must not emit late up")
        f.mouse(.leftMouseDown,NSPoint(x:65,y:87))
        try f.apply([["type":"RemoveNode","nodeId":2]])
        Integration.check(f.events.last?.event == "touchCancel","removing drag target cancels pointer before unmount")
    }
    static func retainedViews() throws {
        let f = Fixture(); defer { f.close() }
        try f.create(1,"Button",["testID":"pause","title":"暂停"],NSRect(x:0,y:0,width:100,height:40))
        try f.create(2,"View",[:],NSRect(x:0,y:50,width:100,height:40))
        f.root.removals = 0
        try f.apply([["type":"MoveChild","nodeId":2,"parentId":0,"index":0],["type":"MoveChild","nodeId":1,"parentId":0,"index":1]])
        Integration.check(f.root.removals == 0,"unchanged MoveChild must preserve native button tracking during video commits")
        try f.apply([["type":"MoveChild","nodeId":1,"parentId":0,"index":0]])
        Integration.check(f.root.removals == 1 && f.root.subviews.first!.subviews.first === f.widget("pause"),"real reordering still moves retained views")
    }
    static func scroll() throws {
        let f = Fixture(); defer { f.close() }
        try f.create(1,"ScrollView",["testID":"scroll"],NSRect(x:0,y:0,width:200,height:100))
        try f.create(2,"View",[:],NSRect(x:0,y:0,width:200,height:500),parent:1)
        try f.bind(1,["scroll","scrollEnd"])
        _ = try f.renderer.invoke(nodeId:1,method:"scrollTo",args:["x":0.0,"y":120.0]) { _ in }
        let scroll = f.widget("scroll") as! NSScrollView
        Integration.check(abs(scroll.contentView.bounds.minY-120) < 1,"scrollTo moves flipped document")
        Integration.wait("scroll end event") { f.events.contains { $0.event == "scrollEnd" } }
        Integration.check(f.events.last?.contentHeight == 500,"scroll events include full content extent")
        try f.create(3,"View",["testID":"pad","touchAction":"pan-y"],NSRect(x:10,y:130,width:170,height:250),parent:2)
        try f.bind(3,["touchDown","touchMove","touchUp","touchCancel"])
        f.mouse(.leftMouseDown,NSPoint(x:50,y:70))
        Integration.check(f.events.last?.event == "touchDown","touch pad begins custom stream")
        f.mouse(.leftMouseDragged,NSPoint(x:50,y:40))
        Integration.check(abs(scroll.contentView.bounds.minY-150) < 1,"pan-y mouse drag scrolls outer document")
        f.mouse(.leftMouseDragged,NSPoint(x:50,y:20))
        f.mouse(.leftMouseUp,NSPoint(x:50,y:20))
        Integration.check(f.events.filter { $0.event == "touchCancel" }.count == 1 && !f.events.contains { $0.event == "touchUp" },"scroll handoff cancels custom stream once without late up")
        Integration.wait("drag scroll end") { f.events.last?.event == "scrollEnd" }
        // Horizontal drag remains custom; axis is locked for the gesture.
        f.events.removeAll()
        f.mouse(.leftMouseDown,NSPoint(x:50,y:70))
        f.mouse(.leftMouseDragged,NSPoint(x:80,y:68))
        f.mouse(.leftMouseDragged,NSPoint(x:80,y:20))
        f.mouse(.leftMouseUp,NSPoint(x:80,y:20))
        Integration.check(scroll.contentView.bounds.minY == 170 && f.events.last?.event == "touchUp","pan-y horizontal drag stays custom even after later vertical movement")
        try f.apply([["type":"SetProps","nodeId":3,"props":["testID":"pad","touchAction":"none"]]])
        f.mouse(.leftMouseDown,NSPoint(x:50,y:70))
        f.mouse(.leftMouseDragged,NSPoint(x:50,y:30))
        f.mouse(.leftMouseUp,NSPoint(x:50,y:30))
        Integration.check(scroll.contentView.bounds.minY == 170 && f.events.last?.event == "touchUp","touchAction none keeps vertical drags custom")
        // Policy is intersected with ancestors and snapshotted on mouse down.
        try f.apply([["type":"SetProps","nodeId":2,"props":["touchAction":"none"]],["type":"SetProps","nodeId":3,"props":["touchAction":"pan-y"]]])
        f.mouse(.leftMouseDown,NSPoint(x:50,y:70))
        try f.apply([["type":"SetProps","nodeId":2,"props":[:]]])
        f.mouse(.leftMouseDragged,NSPoint(x:50,y:30))
        f.mouse(.leftMouseUp,NSPoint(x:50,y:30))
        Integration.check(scroll.contentView.bounds.minY == 170,"ancestor restriction persists for active gesture")
        try f.apply([["type":"SetProps","nodeId":1,"props":["testID":"scroll","scrollEnabled":false]]])
        f.mouse(.leftMouseDown,NSPoint(x:50,y:70))
        f.mouse(.leftMouseDragged,NSPoint(x:50,y:30))
        f.mouse(.leftMouseUp,NSPoint(x:50,y:30))
        Integration.check(scroll.contentView.bounds.minY == 170,"disabled scroll does not pan")
        try f.apply([["type":"SetProps","nodeId":1,"props":["testID":"scroll"]]])
        f.mouse(.leftMouseDown,NSPoint(x:50,y:70))
        f.mouse(.leftMouseDragged,NSPoint(x:50,y:-1000))
        f.mouse(.leftMouseUp,NSPoint(x:50,y:-1000))
        Integration.check(abs(scroll.contentView.bounds.minY-(500-scroll.contentSize.height)) < 1,"drag clamps to document extent")
        f.events.removeAll()
        _ = try f.renderer.invoke(nodeId:1,method:"scrollTo",args:["x":0.0,"y":200.0]) { _ in }
        try f.apply([["type":"RemoveNode","nodeId":1]])
        RunLoop.main.run(until:Date(timeIntervalSinceNow:0.2))
        Integration.check(!f.events.contains { $0.event == "scrollEnd" },"unmounted scroll must cancel pending end callback")
    }
    static func animation() throws {
        let f = Fixture(); defer { f.close() }
        try f.create(1,"View",["testID":"animated"],NSRect(x:20,y:30,width:80,height:40))
        var completed:Bool?
        _ = try f.renderer.invoke(nodeId:1,method:"animate",args:["style":["opacity":0.2,"translateX":60],"options":["duration":150,"easing":"linear"]]) { result in
            if case .success(let value) = result { completed = (value as? [String:Any])?["finished"] as? Bool }
        }
        RunLoop.main.run(until:Date(timeIntervalSinceNow:0.07))
        let animated = f.widget("animated")
        Integration.check(animated.alphaValue > 0.2 && animated.alphaValue < 1,"animation has intermediate frame")
        Integration.wait("animation completion") { completed != nil }
        Integration.check(completed == true && abs(animated.alphaValue-0.2) < 0.01,"animation final state")
        Integration.check(f.root.hitTest(f.root.convert(NSPoint(x:135,y:50),to:f.root.superview)) === animated,"translated views must receive clicks at their visible position")
        completed = nil
        let cancel = try f.renderer.invoke(nodeId:1,method:"animate",args:["style":["opacity":1],"options":["duration":500]]) { result in
            if case .success(let value) = result { completed = (value as? [String:Any])?["finished"] as? Bool }
        }
        cancel?()
        Integration.check(completed == false,"cancel settles animation with finished false")
        let node = AnseronUINodeAnimation(view:animated)
        node.stage(["x":20,"y":30,"width":80,"height":40,"translateX":60,"scaleX":-2,"scaleY":1,"rotate":0])
        node.commit()
        let mirrored = animated.convert(NSPoint(x:0,y:0),to:f.root)
        let opposite = animated.convert(NSPoint(x:80,y:0),to:f.root)
        Integration.check(abs(mirrored.x-200) < 0.01 && abs(opposite.x-40) < 0.01,"negative scale mirrors around center in native coordinates")
        node.stage(["scaleX":1,"rotate":90]); node.commit()
        let center = animated.convert(NSPoint(x:40,y:20),to:f.root)
        Integration.check(abs(center.x-120) < 0.01 && abs(center.y-50) < 0.01,"rotation retains visual center after negative scale")
        node.stage(["rotate":0,"translateX":0]); node.commit()
        let restored = animated.convert(NSPoint.zero,to:f.root)
        Integration.check(abs(restored.x-20) < 0.01 && abs(restored.y-30) < 0.01,"clearing transforms restores original coordinates")
        completed = nil
        _ = try f.renderer.invoke(nodeId:1,method:"animate",args:["style":["opacity":1],"options":["duration":500]]) { result in
            if case .success(let value) = result { completed = (value as? [String:Any])?["finished"] as? Bool }
        }
        try f.apply([["type":"RemoveNode","nodeId":1]])
        Integration.check(completed == false,"unmount settles and stops running animation")
    }
    static func media() throws {
        let f = Fixture(); defer { f.close() }
        let url = URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent("examples/components/assets/showcase.mp4")
        let attributes:[String:Any] = ["testID":"video","src":url.absoluteString,"controls":true]
        try f.create(1,"Video",attributes,NSRect(x:0,y:0,width:240,height:135))
        try f.bind(1,["loadSuccess","loadFailure","playStateDidChanged","firstFrameDidDisplay","playTimeDidChanged"])
        let view = f.widget("video") as! AVPlayerView
        f.window.makeKeyAndOrderFront(nil)
        Integration.wait("local video status",timeout:15) { view.player?.currentItem?.status != .unknown }
        Integration.check(view.player?.currentItem?.status == .readyToPlay,"local video ready")
        let player = view.player!
        player.playImmediately(atRate:1)
        try f.apply([["type":"SetProps","nodeId":1,"props":attributes]])
        Integration.check(player.rate != 0,"unrelated render must not pause native video controls")
        player.pause()
        var controlled = attributes; controlled["playControl"] = "play"
        try f.apply([["type":"SetProps","nodeId":1,"props":controlled]])
        player.pause()
        try f.apply([["type":"SetProps","nodeId":1,"props":controlled]])
        Integration.check(player.rate == 0,"unchanged play prop must not undo native pause")
        player.playImmediately(atRate:1)
        Integration.wait("video first frame",timeout:15) { f.events.contains { $0.event == "firstFrameDidDisplay" } }
        Integration.wait("video time update in milliseconds") { f.events.contains { $0.event == "playTimeDidChanged" && ($0.x ?? 0) >= 1000 && ($0.duration ?? 0) >= 7000 } }
        let duration = player.currentItem!.duration.seconds
        Integration.check(duration.isFinite && duration > 0,"local video duration")
        player.seek(to:CMTime(seconds:max(0,duration-0.1),preferredTimescale:600),toleranceBefore:.zero,toleranceAfter:.zero)
        Integration.wait("video end state",timeout:15) { f.events.contains { $0.state == "ended" } }
        RunLoop.main.run(until:Date(timeIntervalSinceNow:0.1))
        Integration.check(f.events.last(where: { $0.event == "playStateDidChanged" })?.state == "ended","late rate observation must not overwrite ended with paused")
        Integration.check(f.events.filter { $0.event == "firstFrameDidDisplay" }.count == 1,"first frame emits once per source")
        controlled["playControl"] = "stop"
        try f.apply([["type":"SetProps","nodeId":1,"props":controlled]])
        Integration.wait("reset ended player reports paused") { player.currentTime().seconds < 0.05 && f.events.last(where: { $0.event == "playStateDidChanged" })?.state == "paused" }
        var invalid = attributes; invalid["src"] = "invalid://unsupported"
        try f.apply([["type":"SetProps","nodeId":1,"props":invalid]])
        Integration.wait("invalid video emits error") { f.events.contains { $0.event == "loadFailure" } }
        Integration.check(f.events.contains { $0.state == "error" } && view.player == nil,"invalid media must report error and retire old player without destroying page")
    }
}
