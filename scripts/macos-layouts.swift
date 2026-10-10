// Reads Apple keyboard layouts from macOS (UCKeyTranslate over the system's own
// layout data, the same layouts iOS uses for hardware keyboards) and prints
// `char -> key strokes` per layout as JSON, keyed by USB HID usage.
//
//   swift scripts/macos-layouts.swift [keyboardType] > /tmp/layouts.json
//
// Each stroke is [usage, shift, option] (0/1). A character maps to the
// shortest sequence: one key, or a dead key followed by space or a letter.
// keyboardType defaults to 41 (Apple ISO); the German table read from a real
// simulator matches ISO, where the key left of 1 and the key next to the left
// shift are swapped against ANSI.
import Carbon
import Foundation

/// macOS virtual key code -> USB HID usage (ANSI names; on ISO, 0x0A is the key left of 1
/// and 0x32 the extra key next to the left shift, which iOS reports as 0x64 and 0x35).
let keys: [(UInt16, Int)] = [
  (0x00, 0x04), (0x0B, 0x05), (0x08, 0x06), (0x02, 0x07), (0x0E, 0x08), (0x03, 0x09), (0x05, 0x0A),
  (0x04, 0x0B), (0x22, 0x0C), (0x26, 0x0D), (0x28, 0x0E), (0x25, 0x0F), (0x2E, 0x10), (0x2D, 0x11),
  (0x1F, 0x12), (0x23, 0x13), (0x0C, 0x14), (0x0F, 0x15), (0x01, 0x16), (0x11, 0x17), (0x20, 0x18),
  (0x09, 0x19), (0x0D, 0x1A), (0x07, 0x1B), (0x10, 0x1C), (0x06, 0x1D),
  (0x12, 0x1E), (0x13, 0x1F), (0x14, 0x20), (0x15, 0x21), (0x17, 0x22), (0x16, 0x23), (0x1A, 0x24),
  (0x1C, 0x25), (0x19, 0x26), (0x1D, 0x27),
  (0x1B, 0x2D), (0x18, 0x2E), (0x21, 0x2F), (0x1E, 0x30), (0x2A, 0x31), (0x29, 0x33), (0x27, 0x34),
  (0x2B, 0x36), (0x2F, 0x37), (0x2C, 0x38),
  (0x0A, 0x64), (0x32, 0x35),
]
let space: (UInt16, Int) = (0x31, 0x2C)

let layouts: [(String, String)] = [
  ("de", "com.apple.keylayout.German"),
  ("us", "com.apple.keylayout.US"),
  ("gb", "com.apple.keylayout.British"),
  ("fr", "com.apple.keylayout.French"),
  ("es", "com.apple.keylayout.Spanish-ISO"),
  ("ch", "com.apple.keylayout.SwissGerman"),
  ("it", "com.apple.keylayout.Italian-Pro"),
]

let keyboardType = UInt32(CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1]) ?? 41 : 41)
/// Modifier combinations in the order tried: none, shift, option, shift+option (UCKeyTranslate's (modifiers >> 8) & 0xFF).
let combos: [(UInt32, Int, Int)] = [(0, 0, 0), (UInt32(shiftKey >> 8), 1, 0), (UInt32(optionKey >> 8), 0, 1), (UInt32((shiftKey | optionKey) >> 8), 1, 1)]

func layoutData(_ id: String) -> UnsafePointer<UCKeyboardLayout>? {
  let filter = [kTISPropertyInputSourceID as String: id] as CFDictionary
  guard let list = TISCreateInputSourceList(filter, true)?.takeRetainedValue() as? [TISInputSource], let source = list.first,
        let raw = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData) else { return nil }
  let data = Unmanaged<CFData>.fromOpaque(raw).takeUnretainedValue()
  guard let bytes = CFDataGetBytePtr(data) else { return nil }
  return UnsafeRawPointer(bytes).assumingMemoryBound(to: UCKeyboardLayout.self)
}

/// Text for one key press, continuing from `dead`; the new dead state is written back.
func translate(_ layout: UnsafePointer<UCKeyboardLayout>, _ code: UInt16, _ mods: UInt32, _ dead: inout UInt32) -> String {
  var chars = [UniChar](repeating: 0, count: 8)
  var length = 0
  let status = UCKeyTranslate(layout, code, UInt16(kUCKeyActionDown), mods, keyboardType, 0, &dead, chars.count, &length, &chars)
  return status == noErr ? String(utf16CodeUnits: chars, count: length) : ""
}

/// Curly quotes: iOS text fields turn straight quotes into these on their own, and Option+key gives them on macOS only.
let typographic: Set<String> = ["\u{2018}", "\u{2019}", "\u{201C}", "\u{201D}"]

var result: [String: [String: [[Int]]]] = [:]
for (name, id) in layouts {
  guard let layout = layoutData(id) else {
    FileHandle.standardError.write("missing layout \(id)\n".data(using: .utf8)!)
    continue
  }
  var table: [String: [[Int]]] = [:]
  var deadKeys: [(UInt16, UInt32, [Int])] = []
  for (_, mods, shift, option) in combos.map({ ($0, $0.0, $0.1, $0.2) }) {
    for (code, usage) in keys {
      var dead: UInt32 = 0
      let text = translate(layout, code, mods, &dead)
      let stroke = [usage, shift, option]
      if dead != 0 {
        deadKeys.append((code, mods, stroke))
      } else if text.count == 1, let scalar = text.unicodeScalars.first, scalar.value >= 0x20, table[text] == nil, !typographic.contains(text) {
        table[text] = [stroke]
      }
    }
  }
  // Dead keys: alone (followed by space) and composed with every letter and the space key.
  for (code, mods, deadStroke) in deadKeys {
    var dead: UInt32 = 0
    _ = translate(layout, code, mods, &dead)
    var state = dead
    let alone = translate(layout, space.0, 0, &state)
    if alone.count == 1, table[alone] == nil { table[alone] = [deadStroke, [space.1, 0, 0]] }
    for (_, mods2, shift2, option2) in combos.prefix(2).map({ ($0, $0.0, $0.1, $0.2) }) {
      for (code2, usage2) in keys where (0x04...0x1D).contains(usage2) {
        var next = dead
        let composed = translate(layout, code2, mods2, &next)
        // After composing, the dead state holds a marker rather than 0; one character out is the composition.
        if composed.count == 1, composed != " ", table[composed] == nil { table[composed] = [deadStroke, [usage2, shift2, option2]] }
      }
    }
  }
  result[name] = table
}
let json = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
FileHandle.standardOutput.write(json)
