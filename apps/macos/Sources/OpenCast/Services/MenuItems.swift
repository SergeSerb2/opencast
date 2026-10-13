import AppKit

@MainActor enum MenuItems {
  static func call(_ method: String, _ p: [String: Any], previous: NSRunningApplication?)
    async throws -> Any
  {
    try Permissions.requireAX()
    let app: NSRunningApplication?
    if let id = p["bundleId"] as? String {
      app = Applications.findRunning(id)
    } else {
      let front = NSWorkspace.shared.frontmostApplication
      app = front?.processIdentifier == ProcessInfo.processInfo.processIdentifier ? previous : front
    }
    guard let app else { throw RpcError(code: -32004, message: "Application not running") }
    let pid = app.processIdentifier
    return try await Task.detached {
      guard let bar = AX.element(AX.value(AXUIElementCreateApplication(pid), kAXMenuBarAttribute))
      else { throw RpcError(code: -32004, message: "Application has no accessible menu bar") }
      if method == "menus.press" {
        let path = try p.strings("path")
        guard !path.isEmpty else { throw RpcError.invalid("Empty menu path") }
        var parent = bar
        for (index, title) in path.enumerated() {
          var children = AX.children(parent)
          if AX.value(parent, kAXRoleAttribute) as? String == kAXMenuBarItemRole
            || AX.value(parent, kAXRoleAttribute) as? String == kAXMenuItemRole
          {
            children = children.flatMap {
              AX.value($0, kAXRoleAttribute) as? String == kAXMenuRole ? AX.children($0) : [$0]
            }
          }
          guard
            let item = children.first(where: { AX.value($0, kAXTitleAttribute) as? String == title }
            )
          else { throw RpcError(code: -32004, message: "Menu item not found: \(title)") }
          guard AX.value(item, kAXEnabledAttribute) as? Bool != false else {
            throw RpcError.failure("Menu item disabled: \(title)")
          }
          if index == path.count - 1 {
            try AX.press(item)
          } else {
            try? AX.press(item)
            parent = item
          }
        }
        return NSNull() as Any
      }
      var items: [[String: Any]] = []
      var visited = 0
      func walk(_ element: AXUIElement, _ path: [String], _ depth: Int) {
        guard depth <= 12, visited < 5000 else { return }
        visited += 1
        let title = AX.value(element, kAXTitleAttribute) as? String ?? ""
        let next = title.isEmpty ? path : path + [title]
        if !title.isEmpty, AX.value(element, kAXRoleAttribute) as? String == kAXMenuItemRole {
          var o: [String: Any] = [
            "path": next, "title": title,
            "enabled": AX.value(element, kAXEnabledAttribute) as? Bool ?? true,
            "checked": !(AX.value(element, kAXMenuItemMarkCharAttribute) as? String ?? "").isEmpty,
          ]
          if let key = AX.value(element, kAXMenuItemCmdCharAttribute) as? String, !key.isEmpty {
            let modifiers = AX.value(element, kAXMenuItemCmdModifiersAttribute) as? Int ?? 0
            var shortcut = ""
            if modifiers & 4 != 0 { shortcut += "⌃" }
            if modifiers & 2 != 0 { shortcut += "⌥" }
            if modifiers & 1 != 0 { shortcut += "⇧" }
            if modifiers & 8 == 0 { shortcut += "⌘" }
            o["shortcut"] = shortcut + key.uppercased()
          }
          items.append(o)
        }
        for child in AX.children(element) { walk(child, next, depth + 1) }
      }
      walk(bar, [], 0)
      return items as Any
    }.value
  }
}
