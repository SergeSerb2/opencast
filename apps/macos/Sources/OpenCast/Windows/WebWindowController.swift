import AppKit
import WebKit

@MainActor final class WebWindowController: NSWindowController, NSWindowDelegate {
  let kind: String
  let hub: EventHub
  init(kind: String, web: WKWebView, hub: EventHub) {
    self.kind = kind
    self.hub = hub
    let size =
      kind == "notes"
      ? NSSize(width: 420, height: 520)
      : kind == "ai-chat" ? NSSize(width: 900, height: 640) : NSSize(width: 860, height: 620)
    let mask: NSWindow.StyleMask = [
      .titled, .closable, .miniaturizable, .resizable, .fullSizeContentView,
    ]
    let window =
      kind == "notes"
      ? NSPanel(
        contentRect: NSRect(origin: .zero, size: size), styleMask: mask, backing: .buffered,
        defer: false)
      : NSWindow(
        contentRect: NSRect(origin: .zero, size: size), styleMask: mask, backing: .buffered,
        defer: false)
    window.title =
      [
        "ai-chat": "AI Chat", "notes": "Notes", "settings": "Settings", "welcome": "Welcome",
        "theme-studio": "Theme Studio",
      ][kind] ?? "OpenCast"
    window.titlebarAppearsTransparent = true
    window.titleVisibility = .hidden
    window.isReleasedWhenClosed = false
    if kind == "ai-chat" { window.minSize = NSSize(width: 640, height: 420) }
    window.contentView = web
    window.center()
    window.setFrameAutosaveName("OpenCast.\(kind)")
    super.init(window: window)
    window.delegate = self
  }
  required init?(coder: NSCoder) { nil }
  func show() {
    let visible = window?.isVisible ?? false
    NSApp.activate(ignoringOtherApps: true)
    window?.makeKeyAndOrderFront(nil)
    if !visible { hub.emit("window.didShow", ["kind": kind]) }
  }
  func hide() {
    if window?.isVisible == true {
      window?.orderOut(nil)
      hub.emit("window.didHide", ["kind": kind])
    }
  }
  func windowWillClose(_ notification: Notification) { hub.emit("window.didHide", ["kind": kind]) }
  func windowDidBecomeKey(_ notification: Notification) {
    hub.emit("window.didBecomeKey", ["kind": kind])
  }
  func windowDidResignKey(_ notification: Notification) {
    hub.emit("window.didResignKey", ["kind": kind])
  }
}
@MainActor final class HostWindows {
  let launcher: LauncherPanel
  private var others: [String: WebWindowController] = [:]
  private let factory: WebViewFactory
  private let hub: EventHub
  init(factory: WebViewFactory, hub: EventHub) {
    self.factory = factory
    self.hub = hub
    launcher = LauncherPanel(web: factory.create("main"), hub: hub)
  }
  private func window(_ kind: String) throws -> NSWindow {
    guard ["main", "ai-chat", "notes", "settings", "welcome", "theme-studio"].contains(kind) else {
      throw RpcError.invalid("Unknown window kind: \(kind)")
    }
    if kind == "main" { return launcher }
    if others[kind] == nil {
      others[kind] = WebWindowController(kind: kind, web: factory.create(kind), hub: hub)
    }
    return others[kind]!.window!
  }
  func toggleLauncher() {
    if launcher.isVisible { launcher.hide(restoreFocus: true) } else { launcher.show() }
  }
  func show(_ kind: String) { _ = try? perform("window.show", ["kind": kind]) }
  func perform(_ method: String, _ p: [String: Any]) throws -> Any {
    let kind = try p.string("kind")
    let w = try window(kind)
    switch method {
    case "window.show", "window.toggle":
      if method == "window.toggle", w.isVisible {
        if kind == "main" { launcher.hide(restoreFocus: true) } else { others[kind]?.hide() }
        return NSNull()
      }
      if kind == "main" { launcher.show() } else { others[kind]?.show() }
      if p["route"] != nil || p["payload"] != nil {
        var route: [String: Any] = ["kind": kind]
        route["route"] = p["route"]
        route["payload"] = p["payload"]
        factory.route(kind, route)
      }
    case "window.hide", "window.close":
      if kind == "main" {
        launcher.hide(restoreFocus: p.bool("restoreFocus"))
      } else if method == "window.close" {
        w.close()
      } else {
        others[kind]?.hide()
        if p.bool("restoreFocus") { launcher.previous?.activate() }
      }
    case "window.setContentHeight":
      guard kind == "main" else { throw RpcError.invalid("Content height applies only to main") }
      let h = try p.number("height")
      guard h >= 100 && h <= 4000 else { throw RpcError.invalid("Height must be 100...4000") }
      launcher.height(h, animate: p.bool("animate"))
    case "window.setSize":
      let width = try p.number("width")
      let height = try p.number("height")
      guard width >= 100 && height >= 100 && width <= 8000 && height <= 8000 else {
        throw RpcError.invalid("Invalid window size")
      }
      if kind == "main" {
        var f = w.frame
        f.origin.y += f.height - height
        f.size = NSSize(width: width, height: height)
        w.setFrame(f, display: true)
      } else {
        w.setContentSize(NSSize(width: width, height: height))
      }
    case "window.setFloating": w.level = try p.boolean("floating") ? .floating : .normal
    case "window.isVisible": return w.isVisible
    case "window.startDrag":
      guard let event = NSApp.currentEvent else {
        throw RpcError.failure("Window drag requires a mouse event")
      }
      w.performDrag(with: event)
    default: throw RpcError.unsupported("Unknown window method: \(method)")
    }
    return NSNull()
  }
}
