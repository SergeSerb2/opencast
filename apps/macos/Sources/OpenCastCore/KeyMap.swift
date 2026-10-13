import Foundation

public enum KeyMap {
  public static let codes: [String: UInt16] = [
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11,
    "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
    "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "equal": 24, "9": 25, "7": 26,
    "minus": 27, "8": 28, "0": 29, "bracketright": 30, "o": 31, "u": 32, "bracketleft": 33, "i": 34,
    "p": 35,
    "return": 36, "l": 37, "j": 38, "quote": 39, "k": 40, "semicolon": 41, "backslash": 42,
    "comma": 43, "slash": 44, "n": 45, "m": 46, "period": 47, "tab": 48, "space": 49,
    "backquote": 50, "delete": 51, "escape": 53,
    "f17": 64, "f5": 96, "f6": 97, "f7": 98, "f3": 99, "f8": 100, "f9": 101, "f11": 103, "f13": 105,
    "f16": 106, "f14": 107, "f10": 109, "f12": 111, "f15": 113, "f4": 118, "f2": 120, "f1": 122,
    "arrowleft": 123, "arrowright": 124, "arrowdown": 125, "arrowup": 126,
    "home": 115, "end": 119, "pageup": 116, "pagedown": 121, "forwarddelete": 117,
  ]
  public static func code(_ key: String) -> UInt16? { codes[key.lowercased()] }
  public static func name(_ code: UInt16) -> String {
    let raw = codes.first { $0.value == code }?.key ?? "key\(code)"
    return [
      "arrowup": "arrowUp", "arrowdown": "arrowDown", "arrowleft": "arrowLeft",
      "arrowright": "arrowRight", "bracketleft": "bracketLeft", "bracketright": "bracketRight",
      "backquote": "backquote",
    ][raw] ?? raw
  }
}
