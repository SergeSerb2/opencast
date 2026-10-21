import AppKit
import ApplicationServices
import OpenCastCore

@MainActor final class Input {
  static let injected: Int64 = 0x5343_4748
  let board: Pasteboard
  let windows: HostWindows
  private var busy = false
  private var waiters: [CheckedContinuation<Void, Never>] = []
  init(board: Pasteboard, windows: HostWindows) {
    self.board = board
    self.windows = windows
  }
  static func press(_ code: UInt16, flags: CGEventFlags = []) throws {
    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true),
      let up = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false)
    else { throw RpcError.failure("Cannot create key event") }
    down.flags = flags
    up.flags = flags
    down.setIntegerValueField(.eventSourceUserData, value: injected)
    up.setIntegerValueField(.eventSourceUserData, value: injected)
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
  }
  func focusTarget() async throws {
    let front = NSWorkspace.shared.frontmostApplication
    let restoreFocus = windows.launcher.isVisible
      || front?.processIdentifier == ProcessInfo.processInfo.processIdentifier
    guard let target = restoreFocus ? windows.launcher.previous : front else {
      throw RpcError(code: -32005, message: "No input target application")
    }
    if restoreFocus {
      windows.launcher.hide(restoreFocus: true)
      target.activate()
    }
    try await Task.sleep(nanoseconds: 60_000_000)
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == target.processIdentifier else {
      throw RpcError(code: -32005, message: "Input target changed before key injection")
    }
  }
  func paste(_ content: [String: Any], restore: Bool, stillValid: (() -> Bool)? = nil) async throws
  {
    await acquire()
    defer { release() }
    try await pasteLocked(content, restore: restore, stillValid: stillValid)
  }
  private func acquire() async {
    if !busy {
      busy = true
      return
    }
    await withCheckedContinuation { waiters.append($0) }
  }
  private func release() {
    if waiters.isEmpty { busy = false } else { waiters.removeFirst().resume() }
  }
  private func pasteLocked(_ content: [String: Any], restore: Bool, stillValid: (() -> Bool)? = nil)
    async throws
  {
    try Permissions.requireAX()
    let saved = board.saved()
    try board.write(content, transient: restore)
    let count = NSPasteboard.general.changeCount
    do {
      try await focusTarget()
      if stillValid?() == false || NSPasteboard.general.changeCount != count {
        throw RpcError(code: -32005, message: "Input target changed before paste")
      }
      try Self.press(9, flags: .maskCommand)
    } catch {
      board.restore(saved, ifCount: count)
      throw error
    }
    if restore {
      try? await Task.sleep(nanoseconds: 400_000_000)
      board.restore(saved, ifCount: count)
    }
  }
  func expandSnippet(
    keyword: String, text: String, cursorOffset: Int, stillValid: @escaping () -> Bool
  ) async throws {
    await acquire()
    defer { release() }
    try Permissions.requireAX()
    guard stillValid() else { return }
    for _ in keyword { try Self.press(51) }
    try await Task.sleep(nanoseconds: 30_000_000)
    guard stillValid() else { return }
    try await pasteLocked(["kind": "text", "text": text], restore: true, stillValid: stillValid)
    guard stillValid() else { return }
    for _ in 0..<min(max(cursorOffset, 0), text.count) { try Self.press(123) }
  }
  func call(_ method: String, _ p: [String: Any]) async throws -> Any {
    if method == "input.paste" {
      guard let content = p["content"] as? [String: Any] else {
        throw RpcError.invalid("Missing content")
      }
      try await paste(content, restore: p.bool("restoreClipboard"))
      return NSNull()
    }
    await acquire()
    defer { release() }
    switch method {
    case "input.typeText":
      try Permissions.requireAX()
      let text = try p.string("text", allowEmpty: true)
      try await focusTarget()
      var chunks: [[UInt16]] = []
      var chunk: [UInt16] = []
      for scalar in text.unicodeScalars {
        let units = Array(String(scalar).utf16)
        if chunk.count + units.count > 20 {
          chunks.append(chunk)
          chunk = []
        }
        chunk += units
      }
      if !chunk.isEmpty { chunks.append(chunk) }
      for chunk in chunks {
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
          let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false)
        else { throw RpcError.failure("Cannot create text event") }
        chunk.withUnsafeBufferPointer {
          down.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: $0.baseAddress!)
          up.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: $0.baseAddress!)
        }
        down.setIntegerValueField(.eventSourceUserData, value: Self.injected)
        up.setIntegerValueField(.eventSourceUserData, value: Self.injected)
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
      }
    case "input.pressKeys":
      try Permissions.requireAX()
      let key = try p.string("key")
      guard let code = KeyMap.code(key) else { throw RpcError.invalid("Unknown key: \(key)") }
      let flags = try Hotkeys.flags(p["modifiers"] as? [String] ?? [])
      try await focusTarget()
      try Self.press(code, flags: flags)
    case "input.selectedText":
      try Permissions.requireAX()
      let app = NSWorkspace.shared.frontmostApplication
      let target =
        app?.processIdentifier == ProcessInfo.processInfo.processIdentifier
        ? windows.launcher.previous : app
      guard let target else { return NSNull() }
      let pid = target.processIdentifier
      if let selected = await Task.detached(operation: { () -> String? in
        let root = AXUIElementCreateApplication(pid)
        guard let focused = AX.element(AX.value(root, kAXFocusedUIElementAttribute)) else {
          return nil
        }
        return AX.value(focused, kAXSelectedTextAttribute) as? String
      }).value {
        return selected
      }
      let saved = board.saved()
      try await focusTarget()
      let count = NSPasteboard.general.changeCount
      try Self.press(8, flags: .maskCommand)
      var changed = false
      for _ in 0..<10 {
        try? await Task.sleep(nanoseconds: 30_000_000)
        if NSPasteboard.general.changeCount != count {
          changed = true
          break
        }
      }
      guard changed else { return NSNull() }
      let text = NSPasteboard.general.string(forType: .string)
      board.restore(saved, ifCount: NSPasteboard.general.changeCount)
      return text ?? (NSNull() as Any)
    case "input.selectedFinderItems":
      let output = try await ProcessRunner.checked(
        "/usr/bin/osascript",
        [
          "-e",
          """
          tell application "Finder"
            set resultText to ""
            repeat with selectedItem in (get selection)
              set resultText to resultText & (POSIX path of (selectedItem as alias)) & (ASCII character 0)
            end repeat
            return resultText
          end tell
          """,
        ])
      if output.isEmpty { return [String]() }
      return output.components(separatedBy: "\0").filter { !$0.isEmpty }
    default: throw RpcError.unsupported("Unknown input method")
    }
    return NSNull()
  }
}
