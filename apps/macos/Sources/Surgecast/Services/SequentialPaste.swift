import AppKit
import ApplicationServices
import SurgecastCore

/// "Paste Sequentially": the backend queues clipboard items; each physical ⌘V in any
/// app pastes the current item, then the next one is placed on the pasteboard.
@MainActor final class SequentialPaste {
  private var tap: CFMachPort?
  private var source: CFRunLoopSource?
  private var sequence = PasteSequence<[String: Any]>()
  private var generation = 0
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
    sequence = PasteSequence(contents)
    let mask: CGEventMask = (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue)
    tap = CGEvent.tapCreate(
      tap: .cgSessionEventTap, place: .tailAppendEventTap, options: .defaultTap,
      eventsOfInterest: mask,
      callback: { _, type, event, context in
        guard let context else { return Unmanaged.passUnretained(event) }
        let service = Unmanaged<SequentialPaste>.fromOpaque(context).takeUnretainedValue()
        let consumed = MainActor.assumeIsolated { service.event(type, event) }
        return consumed ? nil : Unmanaged.passUnretained(event)
      }, userInfo: Unmanaged.passUnretained(self).toOpaque())
    guard let tap else {
      stop()
      throw RpcError.missing("inputMonitoring")
    }
    source = CFMachPortCreateRunLoopSource(nil, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
  }

  private func event(_ type: CGEventType, _ event: CGEvent) -> Bool {
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
      if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
      return false
    }
    let isPaste =
      (type == .keyDown || type == .keyUp) && event.getIntegerValueField(.keyboardEventKeycode) == 9
      && event.flags.contains(.maskCommand)
      && event.flags.intersection([.maskControl, .maskAlternate]).isEmpty
    guard isPaste, event.getIntegerValueField(.eventSourceUserData) != Input.injected else { return false }
    if type == .keyDown, let item = sequence.request() { paste(item) }
    return true
  }

  private func paste(_ item: [String: Any]) {
    let current = generation
    do {
      try board.write(item, transient: true)
      try Input.press(9, flags: .maskCommand)
    } catch {
      Environment.log("Sequential paste failed: \(error.localizedDescription)")
      stop()
      return
    }
    // Only one injected paste owns this delay. Rapid physical presses wait in sequence.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
      guard let self, self.generation == current else { return }
      if let item = self.sequence.complete() {
        self.paste(item)
      } else if let next = self.sequence.next {
        do { try self.board.write(next, transient: true) } catch { self.stop() }
      } else {
        self.stop()
        try? self.hud.show(["text": "Pasted all items"])
      }
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
    generation += 1
    sequence = PasteSequence()
  }
}
