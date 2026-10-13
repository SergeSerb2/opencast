import AppKit
import WebKit

@MainActor final class LauncherPanel: NSPanel, NSWindowDelegate {
  let hub: EventHub
  var previous: NSRunningApplication?
  var presentationMode = "mouse-screen"
  var activationBehavior = "move-to-active-space"
  var keepVisible = false
  var hidden: (() -> Void)?
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { false }
  init(web: WKWebView, hub: EventHub) {
    self.hub = hub
    super.init(
      contentRect: NSRect(x: 0, y: 0, width: 750, height: 475),
      styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    isReleasedWhenClosed = false
    isOpaque = false
    backgroundColor = .clear
    hasShadow = true
    level = .floating
    collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
    hidesOnDeactivate = false
    delegate = self
    let radius: CGFloat = Environment.major >= 27 ? 20 : Environment.major >= 26 ? 26 : 12
    var glassContainer: NSView?
    // NSGlassEffectView needs the macOS 26 SDK (Swift 6.2+); older toolchains use the fallback.
    #if compiler(>=6.2)
      if #available(macOS 26, *) {
        let glass = NSGlassEffectView()
        glass.cornerRadius = radius
        glass.contentView = web
        glassContainer = glass
      }
    #endif
    let container: NSView
    if let glassContainer {
      container = glassContainer
    } else {
      let effect = NSVisualEffectView()
      effect.material = .hudWindow
      effect.blendingMode = .behindWindow
      effect.state = .active
      container = effect
      effect.addSubview(web)
      web.frame = effect.bounds
      web.autoresizingMask = [.width, .height]
    }
    container.wantsLayer = true
    container.layer?.cornerRadius = radius
    container.layer?.masksToBounds = true
    contentView = container
  }
  func show() {
    guard !isVisible else {
      makeKeyAndOrderFront(nil)
      return
    }
    if let app = NSWorkspace.shared.frontmostApplication,
      app.processIdentifier != ProcessInfo.processInfo.processIdentifier
    {
      previous = app
    }
    collectionBehavior = activationBehavior == "switch-space"
      ? [.fullScreenAuxiliary, .ignoresCycle] : [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
    let screen: NSScreen?
    if presentationMode == "primary-screen" { screen = NSScreen.screens.first }
    else if presentationMode == "active-window-screen", let pid = previous?.processIdentifier,
      let window = try? AX.focused(pid), let rect = try? AX.rect(window) {
      let top = NSScreen.screens.first?.frame.maxY ?? 0
      let center = NSPoint(x: rect.midX, y: top - rect.midY)
      screen = NSScreen.screens.first(where: { $0.frame.contains(center) }) ?? NSScreen.main
    } else { screen = NSScreen.screens.first(where: { $0.frame.contains(NSEvent.mouseLocation) }) ?? NSScreen.main }
    if let screen {
      let v = screen.visibleFrame
      setFrameOrigin(
        NSPoint(x: v.midX - frame.width / 2, y: v.maxY - v.height * 0.22 - frame.height))
    }
    makeKeyAndOrderFront(nil)
    hub.emit("window.didShow", ["kind": "main"])
  }
  func hide(restoreFocus: Bool = false) {
    guard isVisible else {
      if restoreFocus { previous?.activate() }
      return
    }
    orderOut(nil)
    hub.emit("window.didHide", ["kind": "main"])
    hidden?()
    if restoreFocus { previous?.activate() }
  }
  func height(_ height: CGFloat, animate: Bool) {
    var f = frame
    f.origin.y += f.height - height
    f.size.height = height
    setFrame(f, display: true, animate: animate)
  }
  func windowDidBecomeKey(_ notification: Notification) {
    hub.emit("window.didBecomeKey", ["kind": "main"])
  }
  func windowDidResignKey(_ notification: Notification) {
    hub.emit("window.didResignKey", ["kind": "main"])
    if !keepVisible && Environment.env["SURGECAST_KEEP_OPEN"] != "1" { hide() }
  }
}
