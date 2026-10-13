import AppKit

@MainActor enum NativeImages {
  static let symbols = [
    "clipboard-16": "clipboard", "gear-16": "gearshape", "magnifying-glass-16": "magnifyingglass",
    "star-16": "star", "checkmark-16": "checkmark", "xmark-16": "xmark", "calendar-16": "calendar",
    "document-16": "doc", "bolt-16": "bolt", "heart-16": "heart", "terminal-16": "terminal",
    "music-16": "music.note", "person-16": "person", "folder-16": "folder", "globe-16": "globe",
    "tray-16": "tray",
  ]
  static func image(_ value: Any?) async -> NSImage? {
    guard let value else { return nil }
    if let object = value as? [String: Any] {
      if let path = object["fileIcon"] as? String { return NSWorkspace.shared.icon(forFile: path) }
      if let tile = object["tile"] as? [String: Any] { return await image(tile["glyph"]) }
      let source = object["source"] as? [String: String]
      let key =
        NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        ? "dark" : "light"
      if let primary = await image(source?[key] ?? object["source"]) { return primary }
      return await image(object["fallback"])
    }
    guard let source = value as? String else { return nil }
    if let symbol = NSImage(
      systemSymbolName: symbols[source] ?? source, accessibilityDescription: nil)
    {
      symbol.isTemplate = true
      return symbol
    }
    if source.hasPrefix("/") {
      return await Task.detached { NSImage(contentsOfFile: source) }.value
    }
    if let url = URL(string: source), ["https", "http", "file", "data"].contains(url.scheme) {
      if url.isFileURL { return await Task.detached { NSImage(contentsOf: url) }.value }
      if let (data, response) = try? await URLSession.shared.data(from: url),
        response.expectedContentLength < 8 * 1024 * 1024, data.count < 8 * 1024 * 1024
      {
        return NSImage(data: data)
      }
      return nil
    }
    return imageFallback(source)
  }
  private static func imageFallback(_ value: Any?) -> NSImage? {
    guard let string = value as? String else { return nil }
    if let symbol = NSImage(
      systemSymbolName: symbols[string] ?? string, accessibilityDescription: nil)
    {
      symbol.isTemplate = true
      return symbol
    }
    guard string.count <= 2 else { return nil }
    let image = NSImage(size: NSSize(width: 20, height: 20))
    image.lockFocus()
    (string as NSString).draw(
      at: NSPoint(x: 0, y: 0), withAttributes: [.font: NSFont.systemFont(ofSize: 17)])
    image.unlockFocus()
    return image
  }
}
@MainActor final class MenuBarExtras: NSObject, NSMenuDelegate {
  private var items: [String: NSStatusItem] = [:]
  private var menus: [ObjectIdentifier: String] = [:]
  private var generation: [String: Int] = [:]
  private let hub: EventHub
  init(hub: EventHub) { self.hub = hub }
  func set(_ p: [String: Any]) async throws {
    let id = try p.string("id")
    let current = (generation[id] ?? 0) + 1
    generation[id] = current
    guard let definitions = p["items"] as? [[String: Any]] else {
      throw RpcError.invalid("Missing items")
    }
    let menu = try build(definitions, id: id, depth: 0)
    let image = await NativeImages.image(p["icon"])
    guard generation[id] == current else { return }
    let item = items[id] ?? NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    items[id] = item
    item.button?.title = p["title"] as? String ?? ""
    item.button?.toolTip = p["tooltip"] as? String
    if let image {
      image.size = NSSize(width: 18, height: 18)
      item.button?.image = image
    } else {
      item.button?.image = nil
      if item.button?.title.isEmpty == true { item.button?.title = "S" }
    }
    menus = menus.filter { $0.value != id }
    register(menu, id: id)
    item.menu = menu
  }
  private func register(_ menu: NSMenu, id: String) {
    menus[ObjectIdentifier(menu)] = id
    menu.delegate = self
    for item in menu.items { if let submenu = item.submenu { register(submenu, id: id) } }
  }
  private func build(_ definitions: [[String: Any]], id: String, depth: Int) throws -> NSMenu {
    guard depth <= 10 else { throw RpcError.invalid("Menu nesting exceeds 10") }
    let menu = NSMenu()
    menu.autoenablesItems = false
    for definition in definitions {
      let kind = try definition.string("kind")
      let item: NSMenuItem
      if kind == "separator" {
        menu.addItem(.separator())
        continue
      }
      guard ["item", "section", "submenu"].contains(kind) else {
        throw RpcError.invalid("Unknown menu item kind")
      }
      let title = definition["title"] as? String ?? ""
      let subtitle = definition["subtitle"] as? String
      item = NSMenuItem(
        title: subtitle.map { "\(title) — \($0)" } ?? title,
        action: kind == "item" ? #selector(clicked(_:)) : nil, keyEquivalent: "")
      item.target = self
      item.isEnabled = kind != "section" && definition["enabled"] as? Bool != false
      item.toolTip = definition["tooltip"] as? String
      item.representedObject = ["menuId": id, "itemId": try definition.string("id")]
      if kind == "section" {
        item.attributedTitle = NSAttributedString(
          string: title, attributes: [.font: NSFont.boldSystemFont(ofSize: 12)])
      }
      if kind == "submenu" {
        item.submenu = try build(
          definition["children"] as? [[String: Any]] ?? [], id: id, depth: depth + 1)
      }
      if let shortcut = definition["shortcut"] as? [String: Any],
        let key = shortcut["key"] as? String
      {
        item.keyEquivalent =
          [
            "space": " ", "return": "\r", "escape": "\u{1b}", "tab": "\t", "comma": ",",
            "period": ".", "slash": "/", "backslash": "\\", "semicolon": ";", "quote": "'",
            "minus": "-", "equal": "=", "bracketLeft": "[", "bracketRight": "]", "backquote": "`",
            "delete": "\u{8}",
          ][key] ?? key
        let flags = try Hotkeys.flags(shortcut["modifiers"] as? [String] ?? [])
        var modifiers = NSEvent.ModifierFlags()
        if flags.contains(.maskCommand) { modifiers.insert(.command) }
        if flags.contains(.maskAlternate) { modifiers.insert(.option) }
        if flags.contains(.maskControl) { modifiers.insert(.control) }
        if flags.contains(.maskShift) { modifiers.insert(.shift) }
        item.keyEquivalentModifierMask = modifiers
      }
      if let icon = definition["icon"] {
        Task { [weak item] in
          let image = await NativeImages.image(icon)
          image?.size = NSSize(width: 18, height: 18)
          item?.image = image
        }
      }
      menu.addItem(item)
    }
    return menu
  }
  @objc private func clicked(_ sender: NSMenuItem) {
    if let payload = sender.representedObject as? [String: String] {
      hub.emit("menubar.itemClicked", payload)
    }
  }
  func menuWillOpen(_ menu: NSMenu) {
    if let id = menus[ObjectIdentifier(menu)] { hub.emit("menubar.opened", ["menuId": id]) }
  }
  func remove(_ id: String) {
    generation[id] = (generation[id] ?? 0) + 1
    if let item = items.removeValue(forKey: id) { NSStatusBar.system.removeStatusItem(item) }
    menus = menus.filter { $0.value != id }
  }
  func stop() { for id in Array(items.keys) { remove(id) } }
}
