import AppKit
import ApplicationServices

/// Remap a held physical modifier before Carbon sees command hotkeys.
@MainActor final class HyperKey {
  private var tap: CFMachPort?
  private var source: CFRunLoopSource?
  private var configuration = ""
  private var key: CGKeyCode = 57
  private var shift = true
  func configure(_ settings: [String: Any]) throws {
    let signature = "\(settings["keyboard.hyperKey"] ?? "none"):\(settings["keyboard.hyperKeyIncludeShift"] ?? true)"
    if signature == configuration { return }
    stop()
    let mapping = settings["keyboard.hyperKey"] as? String ?? "none"
    guard mapping != "none" else { configuration = signature; return }
    key = ["caps-lock": 57, "right-cmd": 54, "right-opt": 61][mapping] ?? 57
    shift = settings["keyboard.hyperKeyIncludeShift"] as? Bool ?? true
    try Permissions.requireAX()
    let mask: CGEventMask = (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue)
    guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap, eventsOfInterest: mask, callback: { _, type, event, info in
      guard let info else { return Unmanaged.passUnretained(event) }
      let service = Unmanaged<HyperKey>.fromOpaque(info).takeUnretainedValue()
      return MainActor.assumeIsolated { service.event(type, event) }
    }, userInfo: Unmanaged.passUnretained(self).toOpaque()) else { throw RpcError.missing("accessibility") }
    configuration = signature
    self.tap = tap
    source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
  }
  private func event(_ type: CGEventType, _ event: CGEvent) -> Unmanaged<CGEvent>? {
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
      if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
      return Unmanaged.passUnretained(event)
    }
    if event.getIntegerValueField(.eventSourceUserData) == Input.injected { return Unmanaged.passUnretained(event) }
    let held = CGEventSource.keyState(.hidSystemState, key: key)
    if key == 57 { event.flags.remove(.maskAlphaShift) }
    if held {
      event.flags.formUnion([.maskCommand, .maskControl, .maskAlternate])
      if shift { event.flags.insert(.maskShift) }
    }
    return Unmanaged.passUnretained(event)
  }
  func stop() {
    configuration = ""
    if let source { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
    if let tap { CGEvent.tapEnable(tap: tap, enable: false); CFMachPortInvalidate(tap) }
    source = nil; tap = nil
  }
}
