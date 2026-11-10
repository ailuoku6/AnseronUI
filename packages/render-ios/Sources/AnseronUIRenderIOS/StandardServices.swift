// Shared Apple implementation; keep the macOS copy identical.
import Foundation
import Security
import Network
import CoreLocation
import AVFoundation
import Photos
import UserNotifications
#if os(iOS)
import UIKit
import PhotosUI
import UniformTypeIdentifiers
#else
import AppKit
import UniformTypeIdentifiers
#endif

private struct ServiceFailure: LocalizedError {
    let code: String
    var errorDescription: String? { code }
}
/// App owners forward incoming URLs here, including launch URLs before creating a page.
public enum AnseronUILinks {
    public static var initialURL: String?
    public static func receive(_ url: URL) {
        if initialURL == nil { initialURL = url.absoluteString }
        NotificationCenter.default.post(name: .init("AnseronUIOpenURL"), object: url.absoluteString)
    }
}
private final class ServiceStream {
    let module: String
    var last: String?
    var queue: [Any] = []
    var value: Any?
    var error: Error?
    var waiting: NativeCompletion?
    var stops: [() -> Void] = []
    init(_ module: String) { self.module = module }
    func dispose() { stops.forEach { $0() }; stops.removeAll(); waiting = nil }
}
@MainActor final class StandardServices: NSObject, CLLocationManagerDelegate {
    #if os(iOS)
    private weak var root: UIView?
    init(root: UIView, baseURL: URL?, sources: [String: NativeEventSource] = [:]) { self.sources = sources; self.root = root; self.baseURL = baseURL; super.init() }
    private var presenter: UIViewController? {
        var responder: UIResponder? = root
        while let current = responder { if let controller = current as? UIViewController { return controller.presentedViewController ?? controller }; responder = current.next }
        return root?.window?.rootViewController
    }
    #else
    private weak var root: NSView?
    init(root: NSView, baseURL: URL?, sources: [String: NativeEventSource] = [:]) { self.sources = sources; self.root = root; self.baseURL = baseURL; super.init() }
    #endif
    private let application = ApplicationServices()
    private let radio = RadioServices()
    private let sources: [String: NativeEventSource]
    private let baseURL: URL?
    private var streams: [String: ServiceStream] = [:]
    private var files: [String: URL] = [:]
    private var tasks: [String: URLSessionTask] = [:]
    private var observations: [String: NSKeyValueObservation] = [:]
    private var locationManager: CLLocationManager?
    private var locationRequests: [UUID: NativeCompletion] = [:]
    private var locationPermission: NativeCompletion?
    private var uiCancellations: [UUID: () -> Void] = [:]
    private var networkValue: [String: Any] = ["connected": false, "type": "unknown"]
    private var networkReady = false
    private var networkRequests: [UUID: NativeCompletion] = [:]
    private var networkMonitor: NWPathMonitor?
    private var disposed = false
    #if os(iOS)
    private var pickers: [UUID: ApplePicker] = [:]
    #endif
    private func failure(_ code: String) -> Error { ServiceFailure(code: code) }
    private func string(_ args: [String: Any], _ key: String) throws -> String {
        guard let value = args[key] as? String else { throw failure("INVALID_ARGUMENT: " + key) }; return value
    }
    private func methods(_ module: String) -> [String] {
        let extra = application.methods(module) + radio.methods(module)
        if !extra.isEmpty { return extra }
        switch module {
        case "http": return ["request", "getText"]
        case "storage", "secureStorage": return ["get", "set", "remove", "keys", "clear"]
        case "app", "device", "locale": return ["getInfo"]
        case "clipboard": return ["readText", "writeText"]
        case "dialogs": return ["alert", "confirm", "actionSheet"]
        case "linking": return ["openURL", "canOpenURL", "openSettings", "getInitialURL", "subscribe"]
        case "share": return ["text", "file"]
        case "appState", "appearance": return ["get", "subscribe"]
        case "network": return ["getStatus", "subscribe"]
        case "window": return ["getMetrics", "subscribe"]
        case "permissions": return ["check", "request"]
        case "location": return ["getCurrentPosition", "watchPosition", "subscribe"]
        case "media": return ["pickPhoto"]
        case "files": return ["pickDocument", "release"]
        case "transfers": return ["download", "upload", "cancel", "subscribe"]
        case "capabilities": return ["has"]
        #if os(iOS)
        case "haptics": return ["impact", "notification", "selection"]
        case "keyboard": return ["dismiss", "subscribe"]
        #else
        case "haptics": return ["impact", "notification", "selection"]
        case "keyboard": return ["dismiss"]
        #endif
        default: return sources[module] == nil ? [] : ["subscribe"]
        }
    }
    func handles(_ module: String, _ method: String) -> Bool { module == "events" || methods(module).contains(method) }
    private func metrics() -> [String: Any] {
        #if os(iOS)
        let inset = root?.safeAreaInsets ?? .zero
        let scale = root?.window?.screen.scale ?? UIScreen.main.scale
        #else
        let inset = root?.safeAreaInsets ?? NSEdgeInsetsZero
        let scale = root?.window?.backingScaleFactor ?? 1
        #endif
        return ["width": root?.bounds.width ?? 0, "height": root?.bounds.height ?? 0, "scale": scale, "safeArea": ["top": inset.top, "right": inset.right, "bottom": inset.bottom, "left": inset.left]]
    }
    private func appState() -> String {
        #if os(iOS)
        return UIApplication.shared.applicationState == .active ? "active" : "background"
        #else
        return NSApp.isActive ? "active" : "background"
        #endif
    }
    private func appearance() -> String {
        #if os(iOS)
        return root?.traitCollection.userInterfaceStyle == .dark ? "dark" : "light"
        #else
        return root?.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? "dark" : "light"
        #endif
    }
    func changed() { emit("window", metrics()); emit("appearance", appearance()) }
    private func emit(_ module: String, _ value: Any) {
        guard !disposed else { return }
        for stream in streams.values where stream.module == module { deliver(stream, value) }
    }
    private func deliver(_ stream: ServiceStream, _ value: Any) {
        if stream.module == "bluetooth" {
            if let waiting = stream.waiting { stream.waiting = nil; waiting(.success(value)) }
            else if stream.queue.count < 64 { stream.queue.append(value) }
            else { stream.error = ServiceFailure(code: "IO_ERROR: Bluetooth event queue overflow") }
            return
        }
        let encoded = try? encodeNativeJSON(value); if stream.last == encoded { return }; stream.last = encoded
        if let waiting = stream.waiting { stream.waiting = nil; waiting(.success(value)) } else { stream.value = value }
    }
    private func close(_ id: String) { streams.removeValue(forKey: id)?.dispose(); stopLocationIfUnused() }
    private func observe(_ stream: ServiceStream, _ name: Notification.Name, _ action: @escaping (Notification) -> Void) {
        let token = NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main, using: action)
        stream.stops.append { NotificationCenter.default.removeObserver(token) }
    }
    private func startNetwork() {
        guard networkMonitor == nil else { return }
        let monitor = NWPathMonitor(); networkMonitor = monitor
        monitor.pathUpdateHandler = { [weak self] path in DispatchQueue.main.async {
            guard let self else { return }
            self.networkValue = ["connected": path.status == .satisfied, "type": path.usesInterfaceType(.wifi) ? "wifi" : path.usesInterfaceType(.cellular) ? "cellular" : path.usesInterfaceType(.wiredEthernet) ? "ethernet" : "unknown"]
            self.networkReady = true
            let pending = self.networkRequests; self.networkRequests.removeAll(); pending.values.forEach { $0(.success(self.networkValue)) }
            self.emit("network", self.networkValue)
        } }; monitor.start(queue: DispatchQueue(label: "AnseronUINetwork"))
    }
    private func next(_ args: [String: Any], _ completion: @escaping NativeCompletion) throws -> (() -> Void)? {
        let id = try string(args, "id"), module = try string(args, "module")
        guard methods(module).contains("subscribe") else { throw failure("UNSUPPORTED: " + module + ".subscribe") }
        let stream: ServiceStream
        if let existing = streams[id] { guard existing.module == module, existing.waiting == nil else { throw failure("INVALID_ARGUMENT: subscription") }; stream = existing }
        else {
            stream = ServiceStream(module); streams[id] = stream
            if let source = sources[module] {
                do {
                    let stop = try source { [weak self, weak stream] result in DispatchQueue.main.async {
                        guard let self, let stream, self.streams[id] === stream else { return }
                        switch result {
                        case .success(let value):
                            if let waiting = stream.waiting { stream.waiting = nil; waiting(.success(value)) } else { stream.value = value }
                        case .failure(let error):
                            if let waiting = stream.waiting { stream.waiting = nil; waiting(.failure(error)); self.close(id) }
                            else { stream.error = error }
                        }
                    } }
                    if let stop { stream.stops.append(stop) }
                } catch { close(id); throw error }
            }
            if module == "bluetooth" { stream.stops.append(radio.listen { [weak self, weak stream] value in if let stream { self?.deliver(stream, value) } }) }
            switch module {
            case "appState":
                stream.value = appState()
                #if os(iOS)
                let names = [UIApplication.didBecomeActiveNotification, UIApplication.didEnterBackgroundNotification]
                #else
                let names = [NSApplication.didBecomeActiveNotification, NSApplication.didResignActiveNotification]
                #endif
                for name in names { observe(stream, name) { [weak self] _ in if let self { self.emit(module, self.appState()) } } }
            case "network": startNetwork(); if networkReady { stream.value = networkValue }
            case "window": stream.value = metrics()
            case "appearance": stream.value = appearance()
            case "linking": observe(stream, .init("AnseronUIOpenURL")) { [weak self] note in if let url = note.object as? String { self?.emit(module, url) } }
            case "location":
                guard permission("location") == "granted" else { close(id); throw failure("PERMISSION_DENIED") }
                manager().startUpdatingLocation()
            #if os(iOS)
            case "keyboard":
                stream.value = ["visible": false, "height": 0]
                observe(stream, UIResponder.keyboardWillChangeFrameNotification) { [weak self] note in
                    guard let self, let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect, let root = self.root else { return }
                    let local = root.convert(frame, from: nil); let height = max(0, root.bounds.intersection(local).height)
                    self.emit(module, ["visible": height > 0, "height": height])
                }
                observe(stream, UIResponder.keyboardWillHideNotification) { [weak self] _ in self?.emit(module, ["visible": false, "height": 0]) }
            #endif
            default: break
            }
        }
        if let error = stream.error { close(id); completion(.failure(error)) }
        else if !stream.queue.isEmpty { completion(.success(stream.queue.removeFirst())) }
        else if let value = stream.value { stream.value = nil; stream.last = try? encodeNativeJSON(value); completion(.success(value)) } else { stream.waiting = completion }
        return { [weak self] in self?.close(id) }
    }
    func invoke(_ module: String, _ method: String, _ raw: Any, _ completion: @escaping NativeCompletion) throws -> (() -> Void)? {
        guard !disposed else { throw failure("CANCELLED") }
        let args = raw as? [String: Any] ?? [:]
        if module == "events" {
            if method == "next" { return try next(args, completion) }
            if method == "close" { close(try string(args, "id")); completion(.success(NSNull())); return nil }
            throw failure("UNSUPPORTED")
        }
        if module == "capabilities" {
            let list = methods(try string(args, "module")); completion(.success((args["method"] as? String).map { list.contains($0) } ?? !list.isEmpty)); return nil
        }
        guard methods(module).contains(method) else { throw failure("UNSUPPORTED: " + module + "." + method) }
        if !application.methods(module).isEmpty { return try application.invoke(module, method, args, completion) }
        if !radio.methods(module).isEmpty { return try radio.invoke(module, method, args, completion) }
        switch module {
        case "storage":
            let prefix = "anseronui." + Data((args["namespace"] as? String ?? "default").utf8).base64EncodedString() + "."
            let store = UserDefaults.standard
            let keys = store.dictionaryRepresentation().keys.filter { $0.hasPrefix(prefix) }
            let key = prefix + (args["key"] as? String ?? "")
            if method == "get" { completion(.success(store.string(forKey: key) as Any? ?? NSNull())) }
            else if method == "set" { store.set(try string(args, "value"), forKey: prefix + (try string(args, "key"))); completion(.success(NSNull())) }
            else if method == "remove" { store.removeObject(forKey: key); completion(.success(NSNull())) }
            else if method == "keys" { completion(.success(keys.map { String($0.dropFirst(prefix.count)) }.sorted())) }
            else { keys.forEach { store.removeObject(forKey: $0) }; completion(.success(NSNull())) }
        case "secureStorage": completion(.success(try secure(method, args)))
        case "app": let info = Bundle.main.infoDictionary ?? [:]; completion(.success(["name": info["CFBundleDisplayName"] ?? info["CFBundleName"] ?? "", "version": info["CFBundleShortVersionString"] ?? "", "build": info["CFBundleVersion"] ?? "", "applicationId": Bundle.main.bundleIdentifier ?? ""]))
        case "device":
            #if os(iOS)
            completion(.success(["platform": "iOS", "version": UIDevice.current.systemVersion, "model": UIDevice.current.model]))
            #else
            completion(.success(["platform": "macOS", "version": ProcessInfo.processInfo.operatingSystemVersionString, "model": "Mac"]))
            #endif
        case "locale": completion(.success(["language": Locale.preferredLanguages.first ?? "", "timezone": TimeZone.current.identifier]))
        case "clipboard":
            #if os(iOS)
            if method == "readText" { completion(.success(UIPasteboard.general.string ?? "")) } else { UIPasteboard.general.string = try string(args, "text"); completion(.success(NSNull())) }
            #else
            if method == "readText" { completion(.success(NSPasteboard.general.string(forType: .string) ?? "")) } else { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(try string(args, "text"), forType: .string); completion(.success(NSNull())) }
            #endif
        case "dialogs": return try dialog(method, args, completion)
        case "linking":
            if method == "getInitialURL" { completion(.success(AnseronUILinks.initialURL as Any? ?? NSNull())); return nil }
            #if os(iOS)
            let value = method == "openSettings" ? UIApplication.openSettingsURLString : try string(args, "url")
            guard let url = URL(string: value), let scheme = url.scheme, !["javascript", "data", "file"].contains(scheme.lowercased()) else { throw failure("INVALID_ARGUMENT: URL") }
            if method == "canOpenURL" { completion(.success(UIApplication.shared.canOpenURL(url))) } else { UIApplication.shared.open(url) { ok in completion(ok ? .success(NSNull()) : .failure(ServiceFailure(code: "UNSUPPORTED: URL"))) } }
            #else
            let value = method == "openSettings" ? "x-apple.systempreferences:" : try string(args, "url")
            guard let url = URL(string: value), let scheme = url.scheme, !["javascript", "data", "file"].contains(scheme.lowercased()) else { throw failure("INVALID_ARGUMENT: URL") }
            if method == "canOpenURL" { completion(.success(NSWorkspace.shared.urlForApplication(toOpen: url) != nil)) } else { guard NSWorkspace.shared.open(url) else { throw failure("UNSUPPORTED: URL") }; completion(.success(NSNull())) }
            #endif
        case "share": return try share(method, args, completion)
        case "haptics":
            #if os(iOS)
            if method == "selection" { UISelectionFeedbackGenerator().selectionChanged() }
            else if method == "notification" { UINotificationFeedbackGenerator().notificationOccurred(args["type"] as? String == "error" ? .error : args["type"] as? String == "warning" ? .warning : .success) }
            else { UIImpactFeedbackGenerator(style: args["style"] as? String == "heavy" ? .heavy : args["style"] as? String == "light" ? .light : .medium).impactOccurred() }
            #else
            NSHapticFeedbackManager.defaultPerformer.perform(.generic, performanceTime: .now)
            #endif
            completion(.success(NSNull()))
        case "appState": completion(.success(appState()))
        case "appearance": completion(.success(appearance()))
        case "window": completion(.success(metrics()))
        case "network":
            startNetwork()
            if networkReady { completion(.success(networkValue)) }
            else { let id = UUID(); networkRequests[id] = completion; return { [weak self] in self?.networkRequests.removeValue(forKey: id) } }
        case "keyboard":
            #if os(iOS)
            root?.endEditing(true)
            #else
            root?.window?.makeFirstResponder(nil)
            #endif
            completion(.success(NSNull()))
        case "permissions": return try permissionCall(method, args, completion)
        case "location":
            guard permission("location") == "granted" else { throw failure("PERMISSION_DENIED") }
            let id = UUID(); locationRequests[id] = completion; manager().requestLocation()
            let timer = DispatchWorkItem { [weak self] in self?.locationRequests.removeValue(forKey: id)?(.failure(ServiceFailure(code: "TIMEOUT"))); self?.stopLocationIfUnused() }
            DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: timer)
            return { [weak self] in timer.cancel(); self?.locationRequests.removeValue(forKey: id); self?.stopLocationIfUnused() }
        case "media", "files":
            if method == "release" { if let id = (args["file"] as? [String: Any])?["id"] as? String, let url = files.removeValue(forKey: id) { try? FileManager.default.removeItem(at: url) }; completion(.success(NSNull())) }
            else { return try pick(module == "media", completion) }
        case "http", "transfers": return try transfer(module, method, args, completion)
        default: throw failure("UNSUPPORTED")
        }
        return nil
    }
    private func secure(_ method: String, _ args: [String: Any]) throws -> Any {
        let service = (Bundle.main.bundleIdentifier ?? "AnseronUI") + ".anseronui." + (args["namespace"] as? String ?? "default")
        var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service]
        if method == "get" || method == "set" || method == "remove" { query[kSecAttrAccount as String] = try string(args, "key") }
        if method == "remove" || method == "clear" { let status = SecItemDelete(query as CFDictionary); guard status == errSecSuccess || status == errSecItemNotFound else { throw failure("IO_ERROR: keychain \(status)") }; return NSNull() }
        if method == "set" {
            let data = Data(try string(args, "value").utf8)
            let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
            if status == errSecItemNotFound { query[kSecValueData as String] = data; query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly; let added = SecItemAdd(query as CFDictionary, nil); guard added == errSecSuccess else { throw failure("IO_ERROR: keychain add \(added)") } }
            else if status != errSecSuccess { throw failure("IO_ERROR: keychain update \(status)") }; return NSNull()
        }
        query[kSecReturnAttributes as String] = method == "keys"; query[kSecReturnData as String] = method == "get"
        query[kSecMatchLimit as String] = method == "keys" ? kSecMatchLimitAll : kSecMatchLimitOne
        var result: CFTypeRef?; let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return method == "keys" ? [] : NSNull() }
        guard status == errSecSuccess else { throw failure("IO_ERROR: keychain \(status)") }
        if method == "keys" { return (result as? [[String: Any]] ?? []).compactMap { $0[kSecAttrAccount as String] as? String }.sorted() }
        return (result as? Data).flatMap { String(data: $0, encoding: .utf8) } as Any? ?? NSNull()
    }
    private func manager() -> CLLocationManager { if let manager = locationManager { return manager }; let manager = CLLocationManager(); manager.delegate = self; locationManager = manager; return manager }
    private func stopLocationIfUnused() { if locationRequests.isEmpty && !streams.values.contains(where: { $0.module == "location" }) { locationManager?.stopUpdatingLocation() } }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let value: [String: Any] = ["latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude, "accuracy": location.horizontalAccuracy, "timestamp": location.timestamp.timeIntervalSince1970 * 1000]
        let requests = locationRequests; locationRequests.removeAll(); requests.values.forEach { $0(.success(value)) }; emit("location", value); stopLocationIfUnused()
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let failure = self.failure((error as? CLError)?.code == .denied ? "PERMISSION_DENIED" : "IO_ERROR: location")
        let requests = locationRequests; locationRequests.removeAll(); requests.values.forEach { $0(.failure(failure)) }
        for (id, stream) in streams where stream.module == "location" { stream.waiting?(.failure(failure)); close(id) }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) { if manager.authorizationStatus != .notDetermined { locationPermission?(.success(permission("location"))); locationPermission = nil } }
    private func permission(_ name: String) -> String {
        if name == "location" { switch manager().authorizationStatus { case .authorizedAlways, .authorizedWhenInUse: return "granted"; case .denied: return "denied"; case .restricted: return "restricted"; default: return "prompt" } }
        if name == "camera" || name == "microphone" { switch AVCaptureDevice.authorizationStatus(for: name == "camera" ? .video : .audio) { case .authorized: return "granted"; case .denied: return "denied"; case .restricted: return "restricted"; default: return "prompt" } }
        if name == "photos" { switch PHPhotoLibrary.authorizationStatus(for: .readWrite) { case .authorized: return "granted"; case .limited: return "limited"; case .denied: return "denied"; case .restricted: return "restricted"; default: return "prompt" } }
        return "unsupported"
    }
    private func permissionCall(_ method: String, _ args: [String: Any], _ completion: @escaping NativeCompletion) throws -> (() -> Void)? {
        let name = try string(args, "permission")
        if name == "notifications" {
            if method == "check" { UNUserNotificationCenter.current().getNotificationSettings { settings in completion(.success(settings.authorizationStatus == .notDetermined ? "prompt" : settings.authorizationStatus == .denied ? "denied" : "granted")) } }
            else { UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { ok, error in completion(error.map { .failure($0) } ?? .success(ok ? "granted" : "denied")) } }; return nil
        }
        let state = permission(name)
        if method == "check" || state != "prompt" { completion(.success(state)); return nil }
        let usage = name == "location" ? "NSLocationWhenInUseUsageDescription" : name == "camera" ? "NSCameraUsageDescription" : name == "microphone" ? "NSMicrophoneUsageDescription" : "NSPhotoLibraryUsageDescription"
        guard Bundle.main.object(forInfoDictionaryKey: usage) is String else { throw failure("INVALID_ARGUMENT: missing " + usage) }
        if name == "location" { guard locationPermission == nil else { throw failure("INVALID_ARGUMENT: permission request pending") }; locationPermission = completion; manager().requestWhenInUseAuthorization(); return { [weak self] in self?.locationPermission = nil } }
        if name == "camera" || name == "microphone" { AVCaptureDevice.requestAccess(for: name == "camera" ? .video : .audio) { granted in completion(.success(granted ? "granted" : "denied")) } }
        if name == "photos" { PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in completion(.success(status == .authorized ? "granted" : status == .limited ? "limited" : "denied")) } }
        return nil
    }
    private func remember(_ url: URL, name: String? = nil) throws -> [String: Any] {
        guard !disposed else { throw failure("CANCELLED") }
        let id = UUID().uuidString; let target = FileManager.default.temporaryDirectory.appendingPathComponent("anseronui-" + id)
        let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
        try FileManager.default.copyItem(at: url, to: target); files[id] = target
        let size = (try? target.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        let filename = name ?? url.lastPathComponent
        return ["id": id, "name": filename, "size": size, "mimeType": UTType(filenameExtension: (filename as NSString).pathExtension)?.preferredMIMEType ?? "application/octet-stream"]
    }
    private func file(_ args: [String: Any]) throws -> URL { guard let ref = args["file"] as? [String: Any], let id = ref["id"] as? String, let url = files[id] else { throw failure("INVALID_ARGUMENT: file") }; return url }
    private func transfer(_ module: String, _ method: String, _ args: [String: Any], _ completion: @escaping NativeCompletion) throws -> (() -> Void)? {
        if method == "cancel" { tasks[try string(args, "taskId")]?.cancel(); completion(.success(NSNull())); return nil }
        guard let url = URL(string: try string(args, "url"), relativeTo: baseURL)?.absoluteURL, ["http", "https"].contains(url.scheme ?? "") else { throw failure("INVALID_ARGUMENT: URL") }
        let id = module == "transfers" ? try string(args, "taskId") : UUID().uuidString
        guard !id.isEmpty, tasks[id] == nil else { throw failure("INVALID_ARGUMENT: duplicate taskId") }
        let timeout = (args["timeout"] as? Double ?? 30000) / 1000
        guard timeout.isFinite, timeout > 0 else { throw failure("INVALID_ARGUMENT: timeout") }
        var request = URLRequest(url: url, timeoutInterval: timeout); request.httpMethod = method == "upload" ? "POST" : args["method"] as? String ?? "GET"; request.allHTTPHeaderFields = args["headers"] as? [String: String]
        request.httpBody = (args["body"] as? String)?.data(using: .utf8)
        let task: URLSessionTask
        let finish: (Any?, Error?) -> Void = { [weak self] result, error in DispatchQueue.main.async {
            guard let self, self.tasks.removeValue(forKey: id) != nil else { return }; self.observations.removeValue(forKey: id)
            if let error { let code = (error as NSError).code; completion(.failure(ServiceFailure(code: code == NSURLErrorCancelled ? "CANCELLED" : code == NSURLErrorTimedOut ? "TIMEOUT" : "IO_ERROR: " + error.localizedDescription))) }
            else { completion(.success(result ?? NSNull())) }
        } }
        if method == "download" {
            task = URLSession.shared.downloadTask(with: request) { [weak self] location, response, error in
                guard let location, let response = response as? HTTPURLResponse, (200...299).contains(response.statusCode), error == nil else { finish(nil, error ?? ServiceFailure(code: "IO_ERROR: download")); return }
                // URLSession removes its temporary file when this callback returns.
                let retained = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
                do { try FileManager.default.moveItem(at: location, to: retained) } catch { finish(nil, error); return }
                DispatchQueue.main.async { defer { try? FileManager.default.removeItem(at: retained) }; do { finish(try self?.remember(retained, name: response.suggestedFilename), nil) } catch { finish(nil, error) } }
            }
        } else {
            let handler: (Data?, URLResponse?, Error?) -> Void = { data, response, error in
                if let error { finish(nil, error); return }
                guard let data, data.count <= 48000, let body = String(data: data, encoding: .utf8), let response = response as? HTTPURLResponse else { finish(nil, ServiceFailure(code: "IO_ERROR: RESPONSE_TOO_LARGE_OR_INVALID")); return }
                var headers: [String: String] = [:]; response.allHeaderFields.forEach { headers[String(describing: $0.key)] = String(describing: $0.value) }
                finish(["status": response.statusCode, "headers": headers, "body": body], nil)
            }
            if method == "upload" { task = URLSession.shared.uploadTask(with: request, fromFile: try file(args), completionHandler: handler) }
            else { task = URLSession.shared.downloadTask(with: request) { location, response, error in
                guard let location, error == nil else { handler(nil, response, error); return }
                do {
                    let size = try location.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                    guard size <= 48000 else { throw ServiceFailure(code: "IO_ERROR: RESPONSE_TOO_LARGE") }
                    handler(try Data(contentsOf: location), response, nil)
                } catch { handler(nil, response, error) }
            } }
        }
        tasks[id] = task
        if module == "transfers" { observations[id] = task.progress.observe(\.fractionCompleted, options: [.new]) { [weak self] progress, _ in DispatchQueue.main.async { self?.emit("transfers", ["taskId": id, "transferred": progress.completedUnitCount, "total": max(0, progress.totalUnitCount)]) } } }
        task.resume(); return { task.cancel() }
    }
    private func dialog(_ method: String, _ args: [String: Any], _ completion: @escaping NativeCompletion) throws -> (() -> Void)? {
        let title = args["title"] as? String ?? "", message = args["message"] as? String ?? ""
        let id = UUID()
        #if os(iOS)
        guard let presenter, presenter.presentedViewController == nil else { throw failure("IO_ERROR: presentation unavailable") }
        let alert = UIAlertController(title: title, message: message, preferredStyle: method == "actionSheet" ? .actionSheet : .alert)
        let done: (Any) -> Void = { [weak self] value in self?.uiCancellations.removeValue(forKey: id); completion(.success(value)) }
        if method == "actionSheet" { for (index, label) in (args["options"] as? [String] ?? []).enumerated() { alert.addAction(UIAlertAction(title: label, style: .default) { _ in done(index) }) } }
        else { alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in done(method == "confirm" ? true as Any : NSNull()) }) }
        if method != "alert" { alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in done(method == "confirm" ? false as Any : NSNull()) }) }
        if let popover = alert.popoverPresentationController { popover.sourceView = root; popover.sourceRect = root?.bounds ?? .zero }
        let cancel = { [weak self, weak alert] in alert?.dismiss(animated: false); self?.uiCancellations.removeValue(forKey: id) }
        uiCancellations[id] = cancel; presenter.present(alert, animated: true); return cancel
        #else
        guard let window = root?.window else { throw failure("IO_ERROR: no window") }
        let alert = NSAlert(); alert.messageText = title; alert.informativeText = message
        let options = method == "actionSheet" ? args["options"] as? [String] ?? [] : ["确定"]
        options.forEach { alert.addButton(withTitle: $0) }; if method != "alert" { alert.addButton(withTitle: "取消") }
        let cancel = { [weak self, weak alert] in if let alert { window.endSheet(alert.window, returnCode: .cancel) }; self?.uiCancellations.removeValue(forKey: id) }
        uiCancellations[id] = cancel
        alert.beginSheetModal(for: window) { [weak self] response in
            guard self?.uiCancellations.removeValue(forKey: id) != nil else { return }
            let index = response.rawValue - NSApplication.ModalResponse.alertFirstButtonReturn.rawValue
            let result: Any = method == "confirm" ? (index == 0) as Any : method == "actionSheet" && index >= 0 && index < options.count ? index as Any : NSNull()
            completion(.success(result))
        }; return cancel
        #endif
    }
    private func share(_ method: String, _ args: [String: Any], _ completion: @escaping NativeCompletion) throws -> (() -> Void)? {
        let item: Any = method == "file" ? try file(args) : try string(args, "text")
        #if os(iOS)
        guard let presenter else { throw failure("IO_ERROR: no presenter") }
        let controller = UIActivityViewController(activityItems: [item], applicationActivities: nil); let id = UUID()
        controller.completionWithItemsHandler = { [weak self] _, completed, _, error in self?.uiCancellations.removeValue(forKey: id); completion(error.map { .failure($0) } ?? .success(["status": completed ? "completed" : "cancelled"])) }
        if let popover = controller.popoverPresentationController { popover.sourceView = root; popover.sourceRect = root?.bounds ?? .zero }
        let cancel = { [weak self, weak controller] in controller?.dismiss(animated: false); self?.uiCancellations.removeValue(forKey: id) }; uiCancellations[id] = cancel; presenter.present(controller, animated: true); return cancel
        #else
        guard let root else { throw failure("IO_ERROR: no view") }; NSSharingServicePicker(items: [item]).show(relativeTo: root.bounds, of: root, preferredEdge: .minY); completion(.success(["status": "unknown"])); return nil
        #endif
    }
    private func pick(_ photo: Bool, _ completion: @escaping NativeCompletion) throws -> (() -> Void)? {
        #if os(iOS)
        guard let presenter else { throw failure("IO_ERROR: no presenter") }
        let id = UUID(); let picker = ApplePicker(photo: photo) { [weak self] result in
            guard let self, self.pickers.removeValue(forKey: id) != nil else { return }
            do { if let url = try result.get() { completion(.success(try self.remember(url))) } else { completion(.success(NSNull())) } } catch { completion(.failure(error)) }
        }; pickers[id] = picker; presenter.present(picker.controller, animated: true)
        return { [weak self] in self?.pickers.removeValue(forKey: id)?.controller.dismiss(animated: false) }
        #else
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = false; panel.canChooseDirectories = false; if photo { panel.allowedContentTypes = [.image] }
        let id = UUID(); let cancel = { [weak self, weak panel] in panel?.cancel(nil); self?.uiCancellations.removeValue(forKey: id) }; uiCancellations[id] = cancel
        panel.begin { [weak self] response in guard let self, self.uiCancellations.removeValue(forKey: id) != nil else { return }; do { completion(.success(response == .OK ? try self.remember(panel.url!) : NSNull())) } catch { completion(.failure(error)) } }; return cancel
        #endif
    }
    func dispose() {
        guard !disposed else { return }; disposed = true
        radio.dispose()
        streams.values.forEach { $0.dispose() }; streams.removeAll(); networkRequests.removeAll(); networkMonitor?.cancel(); networkMonitor = nil
        locationRequests.removeAll(); locationPermission = nil; locationManager?.stopUpdatingLocation(); locationManager?.delegate = nil
        let cancels = uiCancellations.values; uiCancellations.removeAll(); cancels.forEach { $0() }
        #if os(iOS)
        pickers.values.forEach { $0.controller.dismiss(animated: false) }; pickers.removeAll()
        #endif
        tasks.values.forEach { $0.cancel() }; tasks.removeAll(); observations.removeAll()
        files.values.forEach { try? FileManager.default.removeItem(at: $0) }; files.removeAll()
    }
}
#if os(iOS)
private final class ApplePicker: NSObject, UIDocumentPickerDelegate, PHPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
    let controller: UIViewController
    private var completion: ((Result<URL?, Error>) -> Void)?
    init(photo: Bool, completion: @escaping (Result<URL?, Error>) -> Void) {
        self.completion = completion
        if photo { var config = PHPickerConfiguration(); config.filter = .images; config.selectionLimit = 1; controller = PHPickerViewController(configuration: config) }
        else { controller = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true) }
        super.init(); (controller as? PHPickerViewController)?.delegate = self; (controller as? UIDocumentPickerViewController)?.delegate = self; controller.presentationController?.delegate = self
    }
    private func finish(_ result: Result<URL?, Error>) { let callback = completion; completion = nil; controller.dismiss(animated: true); callback?(result) }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { finish(.success(urls.first)) }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish(.success(nil)) }
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finish(.success(nil)) }
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        guard let provider = results.first?.itemProvider else { finish(.success(nil)); return }
        provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] url, error in
            if let error { DispatchQueue.main.async { self?.finish(.failure(error)) }; return }
            guard let url else { DispatchQueue.main.async { self?.finish(.success(nil)) }; return }
            let target = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "." + url.pathExtension)
            do { try FileManager.default.copyItem(at: url, to: target); DispatchQueue.main.async { defer { try? FileManager.default.removeItem(at: target) }; self?.finish(.success(target)) } }
            catch { DispatchQueue.main.async { self?.finish(.failure(error)) } }
        }
    }
}
#endif
