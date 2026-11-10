import Foundation
import AppKit
import AVFoundation

public struct RenderFrame: Decodable, Sendable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
}

public struct RenderProps: Decodable, Sendable {
    public let text: String?
    public let spans: String?
    public let title: String?
    public let inputRevision: UInt32?
    public let value: String?
    public let placeholder: String?
    public let disabled: Bool?
    public let backgroundColor: String?
    public let color: String?
    public let animation: String?
    public let translateX: Double?
    public let translateY: Double?
    public let scaleX: Double?
    public let scaleY: Double?
    public let rotate: Double?
    public let opacity: Double?
    public let fontSize: Double?
    public let fontWeight: String?
    public let fontStyle: String?
    public let textAlign: String?
    public let borderColor: String?
    public let borderWidth: Double?
    public let borderRadius: Double?
    public let overflow: String?
    public let visibility: String?
    public let numberOfLines: Int?
    public let ellipsizeMode: String?
    public let editable: Bool?
    public let secureTextEntry: Bool?
    public let maxLength: Int?
    public let keyboardType: String?
    public let returnKeyType: String?
    public let autoCapitalize: String?
    public let autoCorrect: Bool?
    public let placeholderTextColor: String?
    public let accessibilityLabel: String?
    public let textDecorationLine: String?
    public let scrollEnabled: Bool?
    public let showsVerticalScrollIndicator: Bool?
    public let testID: String?
    public let src: String?
    public let placeholderSrc: String?
    public let resizeMode: String?
    public let controls: Bool?
    public let autoplay: Bool?
    public let loop: Bool?
    public let muted: Bool?
    public let rate: Double?
    public let playControl: String?
    public let touchAction: String?
    public let nativeProps: String?
}

public struct RenderCommand: Decodable, Sendable {
    public let type: String
    public let nodeId: UInt32
    public let kind: String?
    public let nativeName: String?
    public let parentId: UInt32?
    public let index: Int?
    public let props: RenderProps?
    public let frame: RenderFrame?
    public let event: String?
    public let enabled: Bool?
}

public struct RenderCommit: Decodable, Sendable {
    public let type: String
    public let revision: UInt32
    public let commands: [RenderCommand]
}

public struct RendererEvent {
    public let type: String
    public let nodeId: UInt32
    public let revision: UInt32
    public let value: String?
    public let inputRevision: UInt32?
    public let event: String?
    public let x: Double?
    public let y: Double?
    public let contentWidth: Double?
    public let contentHeight: Double?
    public let source: String?
    public let state: String?
    public let duration: Double?
    public let errorCode: Double?
    public let pageX: Double?
    public let pageY: Double?
    public let pointerId: UInt32?
    public let touches: [[String: Double]]?
    public let targetId: UInt32?

    public init(type: String, nodeId: UInt32, revision: UInt32, value: String? = nil, inputRevision: UInt32? = nil,
                event: String? = nil, x: Double? = nil, y: Double? = nil, contentWidth: Double? = nil, contentHeight: Double? = nil,
                source: String? = nil, state: String? = nil, duration: Double? = nil, errorCode: Double? = nil,
                pageX: Double? = nil, pageY: Double? = nil, pointerId: UInt32? = nil, touches: [[String: Double]]? = nil, targetId: UInt32? = nil) {
        self.type = type; self.nodeId = nodeId; self.revision = revision
        self.value = value; self.inputRevision = inputRevision; self.event = event
        self.x = x; self.y = y; self.contentWidth = contentWidth; self.contentHeight = contentHeight
        self.source = source; self.state = state; self.duration = duration; self.errorCode = errorCode
        self.pageX = pageX; self.pageY = pageY; self.pointerId = pointerId; self.touches = touches
        self.targetId = targetId
    }
}

public enum RenderError: Error {
    case wrongThread, invalidRevision, invalidCommit, invalidCommand
}

