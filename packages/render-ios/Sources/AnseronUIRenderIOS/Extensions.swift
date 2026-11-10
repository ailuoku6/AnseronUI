import Foundation
import UIKit

public enum NativeExtensionError: Error { case unsupportedModule(String), unsupportedMethod(String), nodeUnmounted, invalidArguments, resultTooLarge }
public typealias NativeEventSource = (_ emit: @escaping NativeCompletion) throws -> (() -> Void)?
public typealias NativeCompletion = (Result<Any, Error>) -> Void
/// Invoked on the main thread. Dispatch expensive work elsewhere and return cancellation if needed.
public typealias NativeModuleHandler = (_ method: String, _ args: Any, _ completion: @escaping NativeCompletion) throws -> (() -> Void)?
@MainActor public protocol IOSNativeComponent: AnyObject {
    var view: UIView { get }
    var contentView: UIView? { get }
    func setProps(_ props: [String: Any]) throws
    func invoke(_ method: String, args: Any, completion: @escaping NativeCompletion) throws -> (() -> Void)?
    func dispose()
}
public extension IOSNativeComponent {
    var contentView: UIView? { nil }
    func invoke(_ method: String, args: Any, completion: @escaping NativeCompletion) throws -> (() -> Void)? { throw NativeExtensionError.unsupportedMethod(method) }
    func dispose() {}
}
@MainActor public final class IOSPlatformExtensions {
    public typealias ComponentFactory = (_ emit: @escaping (String, Any) -> Void) throws -> IOSNativeComponent
    public var modules: [String: NativeModuleHandler]
    public var subscriptions: [String: NativeEventSource]
    public var components: [String: ComponentFactory]
    public init(modules: [String: NativeModuleHandler] = [:], components: [String: ComponentFactory] = [:], subscriptions: [String: NativeEventSource] = [:]) {
        self.modules = modules; self.components = components; self.subscriptions = subscriptions
    }
}

func decodeNativeJSON(_ value: String) throws -> Any {
    try JSONSerialization.jsonObject(with: Data(value.utf8), options: [.fragmentsAllowed])
}
func encodeNativeJSON(_ value: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys])
    guard data.count <= 65_536, let string = String(data: data, encoding: .utf8) else { throw NativeExtensionError.resultTooLarge }
    return string
}
