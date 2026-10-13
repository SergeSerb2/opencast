import AppKit

@MainActor enum Alert {
  static func show(_ p: [String: Any], window: NSWindow?) async throws -> [String: Int] {
    let alert = NSAlert()
    alert.messageText = try p.string("title")
    alert.informativeText = p["message"] as? String ?? ""
    let buttons = try p.strings("buttons")
    guard !buttons.isEmpty else { throw RpcError.invalid("At least one button is required") }
    for title in buttons { alert.addButton(withTitle: title) }
    switch p["style"] as? String ?? "informational" {
    case "warning": alert.alertStyle = .warning
    case "critical": alert.alertStyle = .critical
    case "informational": alert.alertStyle = .informational
    default: throw RpcError.invalid("Invalid alert style")
    }
    let response: NSApplication.ModalResponse
    if let window, window.isVisible {
      response = await withCheckedContinuation { c in
        alert.beginSheetModal(for: window) { c.resume(returning: $0) }
      }
    } else {
      NSApp.activate(ignoringOtherApps: true)
      response = alert.runModal()
    }
    return [
      "index": response.rawValue - NSApplication.ModalResponse.alertFirstButtonReturn.rawValue
    ]
  }
}
