import Foundation
import AppKit
import AVFoundation

public struct RenderFrame: Codable, Sendable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
}

public struct RenderProps: Codable, Sendable {
    public let text: String?
    public var spans: String?
    public let inputRevision: UInt32?
    public let value: String?
    public let placeholder: String?
    public let disabled: Bool?
    public let dmBackgroundColor: String?
    public let dmColor: String?
    public let dmBorderColor: String?
    public let dmPlaceholderTextColor: String?
    public var shadowColor: String?
    public let dmShadowColor: String?
    public let shadowOpacity: Double?
    public let shadowRadius: Double?
    public let shadowOffsetX: Double?
    public let shadowOffsetY: Double?
    public let glassEffect: Bool?
    public let glassEffectStyle: String?
    public let glassEffectTintColor: String?
    public let glassEffectInteractive: Bool?
    public let glassEffectContainer: Bool?
    public let glassEffectSpacing: Double?
    public var backgroundColor: String?
    public var color: String?
    public let animation: String?
    public let translateX: Double?
    public let translateY: Double?
    public let scaleX: Double?
    public let scaleY: Double?
    public let rotate: Double?
    public var opacity: Double?
    public var backgroundBlurRadius: Double?
    public let lineHeight: Double?
    public let fontSize: Double?
    public let fontWeight: String?
    public let fontStyle: String?
    public let textAlign: String?
    public var borderColor: String?
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
    public var placeholderTextColor: String?
    public let accessibilityLabel: String?
    public let accessibilityRole: String?
    public let accessibilityHint: String?
    public let accessibilityValue: String?
    public let accessible: Bool?
    public let accessibilityHidden: Bool?
    public let accessibilityChecked: Bool?
    public let accessibilitySelected: Bool?
    public let accessibilityClickable: Bool?
    public let accessibilityLongClickable: Bool?
    public let textDecorationLine: String?
    public let scrollEnabled: Bool?
    public let scrollAnchorOffset: Double?
    public let showsVerticalScrollIndicator: Bool?
    public let testID: String?
    public var src: String?
    public let dmSrc: String?
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

    func glassFallback(_ dark: Bool, nativeGlass: Bool) -> RenderProps {
        var p = self
        if !nativeGlass, glassEffect == true, glassEffectContainer != true {
            p.backgroundColor = backgroundColor ?? (dark ? "#20242bcc" : "#f2f5facc")
            p.opacity = opacity ?? 0.88
            p.backgroundBlurRadius = backgroundBlurRadius ?? (glassEffectStyle == "clear" ? 12 : 20)
        }
        return p
    }

    func themed(_ dark: Bool) -> RenderProps {
        guard dark else { return self }
        var p = self
        p.src = dmSrc ?? src
        p.backgroundColor = dmBackgroundColor ?? backgroundColor
        p.color = dmColor ?? color
        p.borderColor = dmBorderColor ?? borderColor
        p.placeholderTextColor = dmPlaceholderTextColor ?? placeholderTextColor
        p.shadowColor = dmShadowColor ?? shadowColor
        if let spans, let data = spans.data(using: .utf8), var items = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] {
            for index in items.indices { if let color = items[index]["dmColor"] as? String { items[index]["color"] = color } }
            if let data = try? JSONSerialization.data(withJSONObject: items) { p.spans = String(data: data, encoding: .utf8) }
        }
        return p
    }
}

extension RenderProps {
    func patched(_ set: RenderProps, _ unset: [String]) throws -> RenderProps {
        guard (set.value != nil) == (set.inputRevision != nil), unset.contains("value") == unset.contains("inputRevision"), Set(unset).count == unset.count else { throw RenderError.invalidCommand }
        let encoder = JSONEncoder()
        var values = try JSONSerialization.jsonObject(with: encoder.encode(self)) as! [String: Any]
        let additions = try JSONSerialization.jsonObject(with: encoder.encode(set)) as! [String: Any]
        for key in unset { guard additions[key] == nil else { throw RenderError.invalidCommand }; values.removeValue(forKey: key) }
        for (key, value) in additions { values[key] = value }
        return try JSONDecoder().decode(RenderProps.self, from: JSONSerialization.data(withJSONObject: values))
    }
    static func empty() throws -> RenderProps { try JSONDecoder().decode(RenderProps.self, from: Data("{}".utf8)) }
}

public struct RenderCommand: Codable, Sendable {
    public let type: String
    public let nodeId: UInt32
    public let kind: String?
    public let nativeName: String?
    public let parentId: UInt32?
    public let index: Int?
    public let props: RenderProps?
    public let set: RenderProps?
    public let unset: [String]?
    var changedFields: Set<String> {
        let fields = set.flatMap { try? JSONSerialization.jsonObject(with: JSONEncoder().encode($0)) as? [String: Any] } ?? [:]
        return Set(fields.keys).union(unset ?? [])
    }
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


/// Owns at most one complete, bounded transaction. Chunk JSON is kept verbatim
/// until End so UTF-8 accounting is independent of Foundation number formatting.
final class RenderCommitBuffer {
    private var header: [String: Any]?
    private var chunks: [Int: String] = [:]
    private var bytes = 0
    private var count = 0
    private var through: UInt32 = 0
    private var last: [String: Any]?
    func reset(_ rejected: UInt32) { header = nil; chunks.removeAll(); bytes = 0; count = 0; through = max(through, rejected); last = nil }
    func accept(_ payload: [String: Any]) throws -> [String: Any]? {
        switch payload["type"] as? String {
        case "CommitBegin":
            guard let id = payload["transactionId"] as? UInt32, id > through,
                  let n = payload["chunkCount"] as? Int, n > 0, n <= 65536,
                  let size = payload["totalBytes"] as? Int, size > 0, size <= 16777216,
                  let commands = payload["commandCount"] as? Int, commands >= 0, commands <= 65536 else { throw RenderError.invalidCommit }
            if let header { guard NSDictionary(dictionary: header).isEqual(to: payload) else { throw RenderError.invalidCommit }; return nil }
            header = payload; chunks.removeAll(); bytes = 0; count = 0; return nil
        case "CommitChunk":
            guard let header, let id = payload["transactionId"] as? UInt32, id == header["transactionId"] as? UInt32,
                  let index = payload["index"] as? Int, index >= 0, index < (header["chunkCount"] as! Int),
                  let text = payload["data"] as? String, text.utf8.count <= 1048576,
                  let commands = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [[String: Any]], commands.count <= 4096 else { throw RenderError.invalidCommit }
            if let old = chunks[index] { guard old == text else { throw RenderError.invalidCommit }; return nil }
            bytes += text.utf8.count - 2 + (commands.isEmpty ? 0 : 1); count += commands.count
            guard bytes <= (header["totalBytes"] as! Int), count <= (header["commandCount"] as! Int) else { throw RenderError.invalidCommit }
            chunks[index] = text; return nil
        case "CommitEnd":
            if header == nil, payload["transactionId"] as? UInt32 == last?["revision"] as? UInt32 { return last }
            guard let header, payload["transactionId"] as? UInt32 == header["transactionId"] as? UInt32,
                  chunks.count == header["chunkCount"] as? Int, count == header["commandCount"] as? Int,
                  bytes + 1 == header["totalBytes"] as? Int else { throw RenderError.invalidCommit }
            let text = "[" + (0..<chunks.count).map { String(chunks[$0]!.dropFirst().dropLast()) }.joined(separator: ",") + "]"
            let commands = try JSONSerialization.jsonObject(with: Data(text.utf8))
            let result: [String: Any] = ["type": "Commit", "revision": header["revision"]!, "commands": commands]
            self.header = nil; chunks.removeAll(); last = result; return result
        default: return payload
        }
    }
}

/// Incremental preflight: retain committed topology and stage only this batch's
/// records/lists. No platform objects are touched until the whole batch passes.
final class RenderTopology {
    struct Entry { var kind: String; var parent: UInt32?; var children: [UInt32]; var props: RenderProps? }
    private var records: [UInt32: Entry] = [:]
    private var roots: [UInt32] = []
    func clear() { records.removeAll(); roots.removeAll() }
    var rootIds: [UInt32] { roots }
    func children(_ id: UInt32) -> [UInt32] { records[id]?.children ?? [] }
    func ancestors(_ id: UInt32) -> [UInt32] {
        var result: [UInt32] = [], next = id
        while next > 0, let record = records[next] { result.append(next); next = record.parent ?? 0 }
        return result
    }
    func descendants(_ id: UInt32) -> [UInt32] { [id] + children(id).flatMap { descendants($0) } }

    func prepare(_ commands: [RenderCommand]) throws -> () -> Void {
        var edits: [UInt32: Entry] = [:], removed = Set<UInt32>(), nextRoots = roots
        func get(_ id: UInt32) throws -> Entry {
            guard !removed.contains(id), let entry = edits[id] ?? records[id] else { throw RenderError.invalidCommand }; return entry
        }
        func list(_ id: UInt32) throws -> [UInt32] { id == 0 ? nextRoots : try get(id).children }
        func setList(_ id: UInt32, _ children: [UInt32]) throws {
            if id == 0 { nextRoots = children } else { var entry = try get(id); entry.children = children; edits[id] = entry }
        }
        func detach(_ id: UInt32) throws {
            var entry = try get(id)
            if let parent = entry.parent { try setList(parent, list(parent).filter { $0 != id }) }
            entry.parent = nil; edits[id] = entry
        }
        func remove(_ id: UInt32) throws { for child in try get(id).children { try remove(child) }; removed.insert(id); edits.removeValue(forKey:id) }
        let kinds = Set(["View","Text","RichText","TextInput","ScrollView","Image","Video","Native"])
        let events = Set(["tap","changeText","longPress","backPress","focus","blur","submit","scroll","scrollEnd","layout","touchDown","touchMove","touchUp","touchCancel","spanClick","loadSuccess","loadFailure","playStateDidChanged","playTimeDidChanged","firstFrameDidDisplay","nativeComponent"])
        for c in commands {
            guard c.nodeId > 0 else { throw RenderError.invalidCommand }
            if c.type == "CreateNode" {
                guard records[c.nodeId] == nil, edits[c.nodeId] == nil, !removed.contains(c.nodeId), let kind = c.kind, kinds.contains(kind) else { throw RenderError.invalidCommand }
                edits[c.nodeId] = Entry(kind:kind, parent:nil, children:[], props:nil); continue
            }
            var entry = try get(c.nodeId)
            switch c.type {
            case "InsertChild", "MoveChild":
                guard let parent = c.parentId, let index = c.index, index >= 0 else { throw RenderError.invalidCommand }
                if parent > 0 { guard ["View","ScrollView","Native"].contains(try get(parent).kind) else { throw RenderError.invalidCommand } }
                var ancestor = parent
                while ancestor > 0 { guard ancestor != c.nodeId else { throw RenderError.invalidCommand }; ancestor = try get(ancestor).parent ?? 0 }
                try detach(c.nodeId); var children = try list(parent)
                guard index <= children.count else { throw RenderError.invalidCommand }
                children.insert(c.nodeId,at:index); try setList(parent,children)
                entry = try get(c.nodeId); entry.parent = parent; edits[c.nodeId] = entry
            case "DetachChild": try detach(c.nodeId)
            case "RemoveNode": try detach(c.nodeId); try remove(c.nodeId)
            case "PatchProps":
                guard let set = c.set, let unset = c.unset else { throw RenderError.invalidCommand }
                let base = try entry.props ?? RenderProps.empty(); entry.props = try base.patched(set,unset); edits[c.nodeId] = entry
            case "SetProps": guard let props = c.props else { throw RenderError.invalidCommand }; entry.props = props; edits[c.nodeId] = entry
            case "SetFrame": guard let f = c.frame, [f.x,f.y,f.width,f.height].allSatisfy({$0.isFinite}), f.width >= 0, f.height >= 0 else { throw RenderError.invalidCommand }
            case "BindEvent": guard let event = c.event, events.contains(event), c.enabled != nil else { throw RenderError.invalidCommand }
            default: throw RenderError.invalidCommand
            }
        }
        return { [self] in for id in removed { records.removeValue(forKey:id) }; for (id,entry) in edits { records[id] = entry }; roots = nextRoots }
    }
}
