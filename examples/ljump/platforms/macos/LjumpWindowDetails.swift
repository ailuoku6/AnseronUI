import AppKit
import ApplicationServices

struct LjumpDetailInput: Sendable {
    let id: UInt32
    let pid: Int32
    let bounds: CGRect
    let title: String
    let app: String
    let bundleID: String
}

struct LjumpWindowDetail: Sendable, Equatable {
    let id: UInt32
    let pid: Int32
    let title: String
    let context: String
    let document: String

    var json: [String: Any] {
        ["id": Int(id), "pid": Int(pid), "title": title, "context": context, "document": document]
    }
}

/// Reads only window-level AX attributes, on a worker. Never retains an application's AX tree.
enum LjumpWindowDetails {
    static func presentation(_ input: LjumpDetailInput, title: String, document: String) -> LjumpWindowDetail {
        var title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if title.isEmpty { title = input.app }
        let editor = ["com.todesktop.230313mzl4w4u92", "com.microsoft.VSCode", "com.microsoft.VSCodeInsiders"].contains(input.bundleID)
        let browser = ["com.google.Chrome", "com.google.Chrome.canary", "com.apple.Safari", "com.microsoft.edgemac", "company.thebrowser.Browser", "org.mozilla.firefox"].contains(input.bundleID)
        for suffix in [" — " + input.app, " – " + input.app, " - " + input.app] {
            if title.hasSuffix(suffix) { title = String(title.dropLast(suffix.count)); break }
        }
        var context = ""
        if editor {
            let parts = title.components(separatedBy: " — ").flatMap { $0.components(separatedBy: " – ") }
            if parts.count >= 2, let project = parts.last, !project.isEmpty {
                context = "项目 · " + project
            }
        } else if browser, title != input.app {
            context = "当前标签页"
        }
        var path = ""
        if let url = URL(string: document), url.isFileURL { path = (url.path as NSString).abbreviatingWithTildeInPath }
        return LjumpWindowDetail(id: input.id, pid: input.pid, title: title, context: context, document: path)
    }

    static func read(_ inputs: [LjumpDetailInput], accessibility: Bool) -> [LjumpWindowDetail] {
        var candidates: [Int32: [AXUIElement]] = [:]
        var output: [LjumpWindowDetail] = []
        for input in inputs {
            if Task.isCancelled { break }
            var title = input.title, document = ""
            if accessibility {
                if candidates[input.pid] == nil {
                    let application = AXUIElementCreateApplication(input.pid)
                    AXUIElementSetMessagingTimeout(application, 0.15)
                    candidates[input.pid] = attribute(application, kAXWindowsAttribute) as? [AXUIElement] ?? []
                }
                let windows = candidates[input.pid] ?? []
                let geometry = windows.filter { window in
                    AXUIElementSetMessagingTimeout(window, 0.15)
                    guard let p = attribute(window, kAXPositionAttribute), CFGetTypeID(p) == AXValueGetTypeID(),
                          let s = attribute(window, kAXSizeAttribute), CFGetTypeID(s) == AXValueGetTypeID() else { return false }
                    var position = CGPoint.zero, size = CGSize.zero
                    return AXValueGetValue(p as! AXValue, .cgPoint, &position)
                        && AXValueGetValue(s as! AXValue, .cgSize, &size)
                        && abs(position.x - input.bounds.minX) + abs(position.y - input.bounds.minY) < 5
                        && abs(size.width - input.bounds.width) + abs(size.height - input.bounds.height) < 8
                }
                // Ambiguous geometry must not substitute another window's project or tab.
                let titles = geometry.count == 1 ? geometry : windows.filter {
                    !input.title.isEmpty && attribute($0, kAXTitleAttribute) as? String == input.title
                }
                if titles.count == 1, let window = titles.first {
                    title = attribute(window, kAXTitleAttribute) as? String ?? title
                    document = attribute(window, kAXDocumentAttribute) as? String ?? ""
                }
            }
            output.append(presentation(input, title: title, document: document))
        }
        return output
    }

    private static func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value
    }
}
