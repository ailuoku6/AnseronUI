import Foundation

func testWindowDetails() {
    let editor = LjumpDetailInput(id: 1, pid: 2, bounds: .zero, title: "", app: "Cursor", bundleID: "com.todesktop.230313mzl4w4u92")
    let project = LjumpWindowDetails.presentation(editor, title: "editors.tsx — TSNative — Cursor", document: "file:///tmp/TSNative/editors.tsx")
    precondition(project.title == "editors.tsx — TSNative" && project.context == "项目 · TSNative")
    precondition(project.document == "/tmp/TSNative/editors.tsx")
    let unknown = LjumpWindowDetails.presentation(editor, title: "Cursor", document: "")
    precondition(unknown.context.isEmpty && unknown.title == "Cursor", "Do not invent a project when the application does not expose it")
    let browser = LjumpDetailInput(id: 3, pid: 4, bounds: .zero, title: "Apple - Google Chrome", app: "Google Chrome", bundleID: "com.google.Chrome")
    let tab = LjumpWindowDetails.read([browser], accessibility: false)[0]
    precondition(tab.title == "Apple" && tab.context == "当前标签页" && tab.document.isEmpty)
    let changed = LjumpWindowDetails.presentation(browser, title: "AnseronUI - Google Chrome", document: "https://example.com/private")
    precondition(changed.title == "AnseronUI" && changed != tab && changed.document.isEmpty, "Current tab follows the current window title; do not expose a browser URL as a document path")
    print("PASS: editor project, document path, current browser tab, title changes and unavailable metadata fallback")
}
