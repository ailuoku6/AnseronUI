import UIKit

struct TSAnimationOptions {
    var duration: Double = 300, delay: Double = 0
    var easing = "easeInOut", iterations = 1
    var autoreverse = false
    init(_ value: [String: Any]) throws {
        guard Set(value.keys).isSubset(of: ["duration", "delay", "easing", "iterations", "autoreverse"]) else { throw NativeExtensionError.invalidArguments }
        for key in ["duration", "delay"] {
            if let raw = value[key] {
                guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite, n.doubleValue >= 0, n.doubleValue <= 600000 else { throw NativeExtensionError.invalidArguments }
                if key == "duration" { duration = n.doubleValue } else { delay = n.doubleValue }
            }
        }
        if let raw = value["iterations"] {
            guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue == Double(n.intValue), n.intValue == -1 || (1...10000).contains(n.intValue) else { throw NativeExtensionError.invalidArguments }
            iterations = n.intValue
        }
        if let raw = value["easing"] { guard let s = raw as? String, ["linear", "easeIn", "easeOut", "easeInOut", "spring"].contains(s) else { throw NativeExtensionError.invalidArguments }; easing = s }
        if let raw = value["autoreverse"] { guard let n = raw as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { throw NativeExtensionError.invalidArguments }; autoreverse = n.boolValue }
        guard duration != 0 || iterations != -1 else { throw NativeExtensionError.invalidArguments }
    }
}

/// One display-link timeline per node. Layout model values remain separate from presentation.
final class AnseronUINodeAnimation: NSObject {
    static let defaults: [String: Double] = ["opacity":1,"translateX":0,"translateY":0,"scaleX":1,"scaleY":1,"rotate":0,"borderRadius":0,"r":0,"g":0,"b":0,"a":0]
    var current = defaults
    var declared: [String: Double] = [:]
    private var target = defaults, staged: [String: Double] = [:], from: [String: Double] = [:]
    private weak var view: UIView?
    private var mounted = false
    var options: TSAnimationOptions?
    private var running: TSAnimationOptions?
    private var link: CADisplayLink?
    private var start: Double = 0
    private var completion: ((Bool) -> Void)?
    init(view: UIView) { self.view = view }
    func stage(_ values: [String: Double]) {
        for (key, value) in values where declared[key] != value { declared[key] = value; staged[key] = value }
    }
    func commit() {
        if !staged.isEmpty {
            let next = target.merging(staged) { _, new in new }; staged.removeAll()
            if mounted, let options { begin(next, options) }
            else { cancel(); target = next; current = next; paint() }
        } else { paint() }
        mounted = true
    }
    func animate(_ args: Any, completion: @escaping (Bool) -> Void) throws {
        guard let args = args as? [String: Any], let style = args["style"] as? [String: Any], !style.isEmpty,
              let config = (args["options"] ?? [:]) as? [String: Any] else { throw NativeExtensionError.invalidArguments }
        let options = try TSAnimationOptions(config)
        var next = target
        for (key, raw) in style {
            if key == "backgroundColor" {
                guard let color = raw as? String, color.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil, let hex = UInt32(color.dropFirst(), radix:16) else { throw NativeExtensionError.invalidArguments }
                next["r"] = Double((hex >> 16) & 255); next["g"] = Double((hex >> 8) & 255); next["b"] = Double(hex & 255); next["a"] = 1
            } else {
                guard ["opacity","translateX","translateY","scaleX","scaleY","rotate","borderRadius"].contains(key), let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite else { throw NativeExtensionError.invalidArguments }
                let value = n.doubleValue
                guard !(key == "opacity" && (value < 0 || value > 1)), !(key == "borderRadius" && value < 0) else { throw NativeExtensionError.invalidArguments }
                next[key] = value
            }
        }
        begin(next, options, completion)
    }
    func cancel() {
        link?.invalidate(); link = nil; running = nil
        target = current
        let callback = completion; completion = nil; callback?(false)
    }
    private func begin(_ next: [String: Double], _ options: TSAnimationOptions, _ complete: ((Bool) -> Void)? = nil) {
        cancel(); target = next; from = current; running = options; completion = complete
        start = CACurrentMediaTime() + options.delay / 1000
        let timer = CADisplayLink(target:self, selector:#selector(tick(_:)))
        link = timer; timer.add(to:.main, forMode:.common)
    }
    @objc private func tick(_ timer: CADisplayLink) {
        guard let options = running else { return }
        let elapsed = (CACurrentMediaTime() - start) * 1000
        if elapsed < 0 { return }
        let legs = options.autoreverse ? 2 : 1
        let done = options.duration == 0 || (options.iterations != -1 && elapsed >= options.duration * Double(legs * options.iterations))
        let progress = options.duration == 0 ? 1 : elapsed / options.duration
        let leg = floor(progress)
        var t = done ? (options.autoreverse ? 0.0 : 1.0) : progress - leg
        if !done && options.autoreverse && Int(leg) % 2 == 1 { t = 1-t }
        let amount: Double
        switch options.easing {
        case "linear": amount = t
        case "easeIn": amount = t*t*t
        case "easeOut": amount = 1-pow(1-t,3)
        case "spring": amount = t == 1 ? 1 : (1-exp(-6*t)*cos(10*t))/(1-exp(-6)*cos(10))
        default: amount = t*t*(3-2*t)
        }
        for (key, value) in target { let initial = from[key] ?? value; current[key] = initial+(value-initial)*amount }
        paint()
        if done { link?.invalidate(); link = nil; running = nil; target = current; let callback = completion; completion = nil; callback?(true) }
    }
    private func paint() {
        guard let view else { cancel(); return }
        let v = current
        // Bounds/center are defined even while a transform is applied; UIView.frame is not.
        if let x = v["x"], let y = v["y"], let width = v["width"], let height = v["height"] {
            view.bounds.size = CGSize(width:max(0,width), height:max(0,height))
            view.center = CGPoint(x:x+max(0,width)/2, y:y+max(0,height)/2)
        }
        view.transform = CGAffineTransform(translationX:v["translateX"]!, y:v["translateY"]!).rotated(by:v["rotate"]! * .pi / 180).scaledBy(x:v["scaleX"]!, y:v["scaleY"]!)
        view.alpha = max(0,min(1,v["opacity"]!)); view.layer.cornerRadius = max(0,v["borderRadius"]!)
        view.layer.shadowPath = UIBezierPath(roundedRect:view.bounds,cornerRadius:view.layer.cornerRadius).cgPath
        view.backgroundColor = UIColor(red:max(0,min(255,v["r"]!))/255, green:max(0,min(255,v["g"]!))/255, blue:max(0,min(255,v["b"]!))/255, alpha:max(0,min(1,v["a"]!)))
        view.isOpaque = v["a"]! >= 1
    }
}
