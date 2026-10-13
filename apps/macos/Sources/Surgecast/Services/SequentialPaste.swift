import AppKit
import ApplicationServices

/// "Paste Sequentially": the backend queues clipboard items; each physical ⌘V in any
/// app pastes the current item, then the next one is placed on the pasteboard.
@MainActor final class SequentialPaste {
  private var tap: CFMachPort?
  private var source: CFRunLoopSource?
  private var queue: [[String: Any]] = []
  private let board: Pasteboard
  private let hud: HUD

  init(board: Pasteboard, hud: HUD) {
    self.board = board
    self.hud = hud
  }

  func set(_ p: [String: Any]) throws {
    stop()
    guard let contents = p["contents"] as? [[String: Any]], let first = contents.first else { return }
    try Permissions.requireAX()
    try board.write(first, transient: true)
    queue = Array(contents.dropFirst())
    let mask: CGEventMask = 1 << CGEventType.keyDown.rawValue
    tap = CGEvent.tapCreate(
      tap: .cgSessionEventTap, place: .tailAppendEventTap, options: .listenOnly,
      eventsOfInterest: mask,
      callback: { _, type, event, context in
        guard let context else { return Unmanaged.passUnretained(event) }
        let service = Unmanaged<SequentialPaste>.fromOpaque(context).takeUnretainedValue()
        MainActor.assumeIsolated { service.event(type, event) }
        return Unmanaged.passUnretained(event)
      }, userInfo: Unmanaged.passUnretained(self).toOpaque())
    guard let tap else { throw RpcError.missing("inputMonitoring") }
    source = CFMachPortCreateRunLoopSource(nil, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
  }

  private func event(_ type: CGEventType, _ event: CGEvent) {
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
      if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
      return
    }
    let isPaste =
      type == .keyDown && event.getIntegerValueField(.keyboardEventKeycode) == 9
      && event.flags.contains(.maskCommand)
      && event.flags.intersection([.maskControl, .maskAlternate]).isEmpty
    guard isPaste, event.getIntegerValueField(.eventSourceUserData) != Input.injected else { return }
    // Give the target app time to read the pasteboard before replacing it.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in self?.advance() }
  }

  private func advance() {
    guard !queue.isEmpty else {
      stop()
      try? hud.show(["text": "Pasted all items"])
      return
    }
    let next = queue.removeFirst()
    do { try board.write(next, transient: true) } catch {
      Environment.log("Sequential paste failed: \(error.localizedDescription)")
      stop()
    }
  }

  func stop() {
    if let source { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
    if let tap {
      CGEvent.tapEnable(tap: tap, enable: false)
      CFMachPortInvalidate(tap)
    }
    source = nil
    tap = nil
    queue = []
  }
}
