import AppKit

struct Result: Codable {
    let bold: Bool
    let italic: Bool
    let link: Bool
    let table: Bool
    let html: String
    let text: String
}

let html = FileHandle.standardInput.readDataToEndOfFile()
let board = NSPasteboard(name: NSPasteboard.Name(rawValue: UUID().uuidString))
board.clearContents()
defer { board.releaseGlobally() }
board.setData(html, forType: .html)
guard let copied = board.data(forType: .html) else { fatalError("未读取到 HTML 剪贴板") }
let received = try NSAttributedString(
    data: copied, options: [.documentType: NSAttributedString.DocumentType.html],
    documentAttributes: nil
)

func attribute(_ key: NSAttributedString.Key, at text: String) -> Any? {
    let range = (received.string as NSString).range(of: text)
    guard range.location != NSNotFound else { return nil }
    return received.attribute(key, at: range.location, effectiveRange: nil)
}

func hasTrait(_ trait: NSFontTraitMask, at text: String) -> Bool {
    guard let font = attribute(.font, at: text) as? NSFont else { return false }
    return NSFontManager.shared.traits(of: font).contains(trait)
}

let text = "NativeBold 与 NativeItalic 及 NativeLink"
let authored = NSMutableAttributedString(string: text)
let normal = NSFont.systemFont(ofSize: 13)
let traits: [(String, NSFontTraitMask)] = [("NativeBold", .boldFontMask), ("NativeItalic", .italicFontMask)]
for (label, trait) in traits {
    let range = (text as NSString).range(of: label)
    authored.addAttribute(.font, value: NSFontManager.shared.convert(normal, toHaveTrait: trait), range: range)
}
authored.addAttribute(.link, value: "https://example.com/native-clipboard", range: (text as NSString).range(of: "NativeLink"))
let nativeHtml = try authored.data(
    from: NSRange(location: 0, length: authored.length),
    documentAttributes: [.documentType: NSAttributedString.DocumentType.html]
)
board.clearContents()
board.setData(nativeHtml, forType: .html)
let table = (attribute(.paragraphStyle, at: "OffscreenTableValue") as? NSParagraphStyle)?.textBlocks.contains {
    $0 is NSTextTableBlock
} ?? false
let result = Result(
    bold: hasTrait(.boldFontMask, at: "OffscreenBold"),
    italic: hasTrait(.italicFontMask, at: "OffscreenItalic"),
    link: attribute(.link, at: "OffscreenLink") != nil,
    table: table,
    html: String(decoding: board.data(forType: .html) ?? Data(), as: UTF8.self),
    text: text
)
FileHandle.standardOutput.write(try JSONEncoder().encode(result))
