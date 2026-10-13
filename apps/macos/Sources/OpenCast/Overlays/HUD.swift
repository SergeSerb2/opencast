import AppKit

@MainActor final class HUD {
  private var window: NSWindow?
  private var generation = 0
  func show(_ p: [String: Any]) throws {
    let text = try p.string("text")
    let duration = p["durationMs"] as? Double ?? 2000
    guard duration >= 0 && duration <= 60000 else {
      throw RpcError.invalid("HUD duration must be 0...60000ms")
    }
    generation += 1
    let current = generation
    window?.orderOut(nil)
    let label = NSTextField(labelWithString: text)
    label.font = .systemFont(ofSize: 15, weight: .medium)
    label.textColor = .white
    let stack = NSStackView()
    stack.orientation = .horizontal
    stack.spacing = 10
    stack.edgeInsets = NSEdgeInsets(top: 14, left: 20, bottom: 14, right: 20)
    if let icon = p["icon"] as? String {
      if let image = NSImage(systemSymbolName: icon, accessibilityDescription: nil) {
        let view = NSImageView(image: image)
        view.contentTintColor = .white
        stack.addArrangedSubview(view)
      } else {
        let emoji = NSTextField(labelWithString: icon)
        emoji.font = .systemFont(ofSize: 20)
        stack.addArrangedSubview(emoji)
      }
    }
    stack.addArrangedSubview(label)
    let width = min(650, max(120, label.intrinsicContentSize.width + 80))
    let frame = NSRect(x: 0, y: 0, width: width, height: 54)
    let w = NSWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
    w.isReleasedWhenClosed = false
    w.isOpaque = false
    w.backgroundColor = .clear
    w.ignoresMouseEvents = true
    w.level = .statusBar
    w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    w.hasShadow = true
    let background = NSView(frame: frame)
    background.wantsLayer = true
    background.layer?.backgroundColor = NSColor(white: 0.1, alpha: 0.94).cgColor
    background.layer?.cornerRadius = 27
    stack.frame = background.bounds
    stack.autoresizingMask = [.width, .height]
    background.addSubview(stack)
    w.contentView = background
    if let screen = NSScreen.screens.first(where: { $0.frame.contains(NSEvent.mouseLocation) })
      ?? NSScreen.main
    {
      w.setFrameOrigin(
        NSPoint(x: screen.visibleFrame.midX - width / 2, y: screen.visibleFrame.minY + 90))
    }
    window = w
    w.alphaValue = 0
    w.orderFrontRegardless()
    NSAnimationContext.runAnimationGroup {
      $0.duration = 0.15
      w.animator().alphaValue = 1
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + duration / 1000) { [weak self, weak w] in
      guard let self, current == self.generation, let w else { return }
      NSAnimationContext.runAnimationGroup(
        {
          $0.duration = 0.2
          w.animator().alphaValue = 0
        }, completionHandler: { w.orderOut(nil) })
    }
  }
  func stop() {
    generation += 1
    window?.orderOut(nil)
    window = nil
  }
}
