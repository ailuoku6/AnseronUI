import AppKit

/// Measurement, drawing and hit testing must use the same text container. An
/// NSTextFieldCell adds its own insets and line metrics to an otherwise exact
/// Core frame, clipping mixed-size spans and moving their click targets.
@MainActor final class DesktopTextLayout {
    let storage: NSTextStorage
    let manager = NSLayoutManager()
    let container: NSTextContainer

    init(_ text: NSAttributedString, size: NSSize, lines: Int, lineBreak: NSLineBreakMode) {
        storage = NSTextStorage(attributedString: text)
        container = NSTextContainer(containerSize: size)
        container.lineFragmentPadding = 0
        container.maximumNumberOfLines = lines
        container.lineBreakMode = lineBreak
        manager.addTextContainer(container)
        storage.addLayoutManager(manager)
        manager.ensureLayout(for: container)
    }

    var usedRect: NSRect { manager.usedRect(for: container) }

    func draw() {
        let range = manager.glyphRange(for: container)
        manager.drawBackground(forGlyphRange: range, at: .zero)
        manager.drawGlyphs(forGlyphRange: range, at: .zero)
    }

    func character(at point: NSPoint) -> Int? {
        guard point.x >= 0, point.y >= 0, point.x < container.size.width, point.y < container.size.height else { return nil }
        let glyph = manager.glyphIndex(for: point, in: container)
        guard glyph < manager.numberOfGlyphs,
              NSLocationInRange(glyph, manager.glyphRange(for: container)),
              manager.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: container).contains(point) else { return nil }
        let truncated = manager.truncatedGlyphRange(inLineFragmentForGlyphAt: glyph)
        guard truncated.location == NSNotFound || !NSLocationInRange(glyph, truncated) else { return nil }
        let character = manager.characterIndexForGlyph(at: glyph)
        guard character < storage.length,
              ![UInt16(10), 13, 0x85, 0x2028, 0x2029].contains((storage.string as NSString).character(at: character)) else { return nil }
        return character
    }
}

/// Retains NSTextField's accessibility semantics without its cell's second
/// layout pass. Core supplies the frame; TextKit draws from its top-left corner.
@MainActor final class DesktopTextField: NSTextField {
    override var isFlipped: Bool { true }

    override init(frame: NSRect) {
        super.init(frame: frame)
        isEditable = false; isSelectable = false; isBezeled = false
        isBordered = false; drawsBackground = false
        maximumNumberOfLines = 0
    }
    required init?(coder: NSCoder) { super.init(coder: coder) }

    func textLayout() -> DesktopTextLayout {
        DesktopTextLayout(attributedStringValue, size: bounds.size, lines: maximumNumberOfLines, lineBreak: lineBreakMode)
    }

    override func draw(_ dirtyRect: NSRect) {
        NSGraphicsContext.saveGraphicsState()
        bounds.clip()
        textLayout().draw()
        NSGraphicsContext.restoreGraphicsState()
    }
}
