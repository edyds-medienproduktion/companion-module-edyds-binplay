// Erzeugt die Tastenbilder „Freeze all“ und „Loop all“ für das Companion-Modul (icons.js).
// Die Symbole sind dieselben wie im Programm: Freeze = Pfeil auf Balken (FreezeIcon), Loop = Systemsymbol „repeat“.
// Aufruf: swift Tools/make-icons.swift > icons.js
import AppKit

let S = 144   // 2 × 72 px, damit es auf den Tasten scharf bleibt

func render(color: NSColor, icon: (CGFloat, CGFloat, NSColor) -> Void, iconSize: NSSize) -> String {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: S, pixelsHigh: S, bitsPerSample: 8, samplesPerPixel: 4,
                               hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let text = NSAttributedString(string: "all", attributes: [.font: NSFont.systemFont(ofSize: 46, weight: .semibold), .foregroundColor: color])
    let ts = text.size(), gap: CGFloat = 14
    let total = iconSize.width + gap + ts.width
    let x0 = (CGFloat(S) - total) / 2
    icon(x0, (CGFloat(S) - iconSize.height) / 2, color)
    text.draw(at: NSPoint(x: x0 + iconSize.width + gap, y: (CGFloat(S) - ts.height) / 2))
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!.base64EncodedString()
}

// Pfeil nach rechts auf einen senkrechten Balken, Maße wie FreezeIcon (15 × 12)
let fz = NSSize(width: 52, height: 41.6)
func freeze(_ x: CGFloat, _ y: CGFloat, _ c: NSColor) {
    let w = fz.width, h = fz.height, m = h / 2
    let p = NSBezierPath()
    func pt(_ px: CGFloat, _ py: CGFloat) -> NSPoint { NSPoint(x: x + px, y: y + py) }
    p.move(to: pt(0, m)); p.line(to: pt(w * 0.70, m))
    p.move(to: pt(w * 0.46, m - h * 0.26)); p.line(to: pt(w * 0.70, m)); p.line(to: pt(w * 0.46, m + h * 0.26))
    p.move(to: pt(w * 0.94, m - h * 0.26)); p.line(to: pt(w * 0.94, m + h * 0.26))
    p.lineWidth = 5.5; p.lineCapStyle = .butt; p.lineJoinStyle = .miter
    c.setStroke(); p.stroke()
}

let rp = NSSize(width: 50, height: 44)
func loop(_ x: CGFloat, _ y: CGFloat, _ c: NSColor) {
    let cfg = NSImage.SymbolConfiguration(pointSize: 44, weight: .semibold).applying(.init(paletteColors: [c]))
    guard let img = NSImage(systemSymbolName: "repeat", accessibilityDescription: nil)?.withSymbolConfiguration(cfg) else { fatalError("Symbol fehlt") }
    let s = img.size, k = min(rp.width / s.width, rp.height / s.height)
    img.draw(in: NSRect(x: x + (rp.width - s.width * k) / 2, y: y + (rp.height - s.height * k) / 2, width: s.width * k, height: s.height * k))
}

print("// Automatisch erzeugt mit Tools/make-icons.swift – nicht von Hand ändern.")
print("module.exports = {")
for (name, color) in [("White", NSColor.white), ("Black", NSColor.black)] {
    print("\tfreeze\(name): '\(render(color: color, icon: freeze, iconSize: fz))',")
    print("\tloop\(name): '\(render(color: color, icon: loop, iconSize: rp))',")
}
print("}")
