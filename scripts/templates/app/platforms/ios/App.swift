import UIKit

@main final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = AppController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class AppController: UIViewController {
    private var statusBarStyle: UIStatusBarStyle = .darkContent
    override var preferredStatusBarStyle: UIStatusBarStyle { statusBarStyle }
    private let content = AnseronUIRenderView(
        baseURL: URL(string: "http://127.0.0.1:5175"),
        extensions: AnseronUIPlugins.makeExtensions(),
        createCore: { try NativeCore(bundleBuildId: "__BUILD_ID__") }
    )

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        content.onPageBackgroundColor = { [weak self] color in
            guard let self else { return }
            let resolved = color.resolvedColor(with: self.traitCollection)
            var r: CGFloat = 1, g: CGFloat = 1, b: CGFloat = 1, alpha: CGFloat = 0
            resolved.getRed(&r, green: &g, blue: &b, alpha: &alpha)
            // Composite transparent page backgrounds over the host's white fallback.
            r = r * alpha + 1 - alpha
            g = g * alpha + 1 - alpha
            b = b * alpha + 1 - alpha
            let background = UIColor(red: r, green: g, blue: b, alpha: 1)
            self.view.backgroundColor = background
            self.view.window?.backgroundColor = background
            self.statusBarStyle = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? .darkContent : .lightContent
            self.setNeedsStatusBarAppearanceUpdate()
        }
        content.onFailure = { error in NSLog("__APP_NAME__: %@", String(describing: error)) }
        content.onDiagnostic = { code, message in NSLog("__APP_NAME__: %@ %@", code, message) }
        content.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            content.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            content.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
        ])
        content.load(page: initialPage())
    }

    private func initialPage() -> String {
        guard let url = Bundle.main.url(forResource: "core.manifest", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let pages = object["pages"] as? [[String: Any]],
              let name = pages.first?["name"] as? String, !name.isEmpty else { return "home" }
        return name
    }
}

