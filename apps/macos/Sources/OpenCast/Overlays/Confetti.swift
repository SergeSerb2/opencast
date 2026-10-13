import AppKit
import QuartzCore

@MainActor final class Confetti {
  private var windows: [NSWindow] = []
  private var generation = 0
  func show() {
    stop()
    generation += 1
    let current = generation
    for screen in NSScreen.screens {
      let w = NSWindow(
        contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
      w.isReleasedWhenClosed = false
      w.isOpaque = false
      w.backgroundColor = .clear
      w.ignoresMouseEvents = true
      w.level = .statusBar
      w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
      let view = NSView(frame: NSRect(origin: .zero, size: screen.frame.size))
      view.wantsLayer = true
      w.contentView = view
      for left in [true, false] {
        let emitter = CAEmitterLayer()
        emitter.emitterPosition = CGPoint(x: left ? 0 : screen.frame.width, y: 0)
        emitter.emitterShape = .point
        emitter.birthRate = 1
        emitter.emitterCells = [
          NSColor.systemOrange, .systemPink, .systemBlue, .systemYellow, .systemGreen,
        ].map { color in
          let cell = CAEmitterCell()
          cell.birthRate = 45
          cell.lifetime = 3
          cell.velocity = 650
          cell.velocityRange = 180
          cell.yAcceleration = -600
          cell.emissionLongitude = left ? .pi / 3 : 2 * .pi / 3
          cell.emissionRange = .pi / 5
          cell.spin = 3
          cell.spinRange = 5
          cell.scale = 0.6
          cell.scaleRange = 0.3
          let image = NSImage(size: NSSize(width: 12, height: 7))
          image.lockFocus()
          color.setFill()
          NSBezierPath(rect: NSRect(x: 0, y: 0, width: 12, height: 7)).fill()
          image.unlockFocus()
          cell.contents = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
          return cell
        }
        view.layer?.addSublayer(emitter)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { emitter.birthRate = 0 }
      }
      w.orderFrontRegardless()
      windows.append(w)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.4) { [weak self] in
      guard let self, self.generation == current else { return }
      self.stop()
    }
  }
  func stop() {
    generation += 1
    for w in windows { w.orderOut(nil) }
    windows.removeAll()
  }
}
