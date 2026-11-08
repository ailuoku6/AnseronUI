import UIKit

@main final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = DemoController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class DemoController: UIViewController {
    private let selector = UISegmentedControl()
    private let content = AnseronUIRenderView(baseURL: URL(string: "http://127.0.0.1:5174"), extensions: demoExtensions())
    private let status = UILabel()
    private var pages: [String] = []
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        content.onFailure = { [weak self] error in self?.status.text = "Error: \(error)"; NSLog("AnseronUI: %@", String(describing: error)) }
        content.onDiagnostic = { [weak self] code, message in self?.status.text = "\(code): \(message)"; NSLog("AnseronUI: %@ %@", code, message) }
        pages = readPages()
        for page in pages { selector.insertSegment(withTitle: pageTitle(page), at: selector.numberOfSegments, animated: false) }
        selector.selectedSegmentIndex = min(selector.numberOfSegments - 1, 0)
        selector.addTarget(self, action: #selector(selectPage), for: .valueChanged)
        selector.accessibilityIdentifier = "page-selector"
        status.font = .systemFont(ofSize: 12)
        status.text = "AnseronUI · shared TSX → AOT Core → UIKit"
        for child in [selector, status, content] { child.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(child) }
        NSLayoutConstraint.activate([
            selector.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            selector.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            selector.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            status.topAnchor.constraint(equalTo: selector.bottomAnchor, constant: 10),
            status.leadingAnchor.constraint(equalTo: selector.leadingAnchor),
            content.topAnchor.constraint(equalTo: status.bottomAnchor, constant: 12),
            content.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            content.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
        ])
        selectPage()
    }
    @objc private func selectPage() {
        guard selector.selectedSegmentIndex >= 0, selector.selectedSegmentIndex < pages.count else { return }
        content.load(page: pages[selector.selectedSegmentIndex])
    }
    private func readPages() -> [String] {
        guard let url = Bundle.main.url(forResource: "core.manifest", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let values = object["pages"] as? [[String: Any]] else { return ["counter", "async-form", "components", "extensions"] }
        let result = values.compactMap { $0["name"] as? String }.filter { !$0.isEmpty }
        return result.isEmpty ? ["counter", "async-form", "components", "extensions"] : result
    }
    private func pageTitle(_ page: String) -> String { ["counter": "Counter", "async-form": "Async form", "components": "组件", "extensions": "扩展"][page] ?? page }
}

@MainActor private func demoExtensions() -> IOSPlatformExtensions {
    IOSPlatformExtensions(modules: ["device": { method, args, completion in
        guard method == "info" else { throw NativeExtensionError.unsupportedMethod(method) }
        completion(.success(["platform": "iOS", "version": UIDevice.current.systemVersion])); return nil
    }], components: ["DemoSwitch": { emit in DemoSwitch(emit: emit) }])
}
@MainActor private final class DemoSwitch: NSObject, IOSNativeComponent {
    private let control = UISwitch()
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 100, height: 44))
    private let emit: (String, Any) -> Void
    var view: UIView { container }
    init(emit: @escaping (String, Any) -> Void) {
        self.emit = emit; super.init()
        // UISwitch enforces its intrinsic bounds; expose a layout-sized wrapper.
        control.sizeToFit()
        control.center = CGPoint(x: container.bounds.midX, y: container.bounds.midY)
        control.autoresizingMask = [.flexibleLeftMargin, .flexibleRightMargin, .flexibleTopMargin, .flexibleBottomMargin]
        control.accessibilityIdentifier = "demo-switch-control"
        container.addSubview(control)
        control.addTarget(self, action: #selector(changed), for: .valueChanged)
    }
    func setProps(_ props: [String: Any]) throws { control.setOn(props["value"] as? Bool ?? false, animated: false) }
    @objc private func changed() { emit("change", ["value": control.isOn]) }
    func invoke(_ method: String, args: Any, completion: @escaping NativeCompletion) throws -> (() -> Void)? {
        guard method == "toggle" else { throw NativeExtensionError.unsupportedMethod(method) }
        control.setOn(!control.isOn, animated: false)
        completion(.success(["value": control.isOn])); return nil
    }
    func dispose() { control.removeTarget(self, action: nil, for: .allEvents) }
}
