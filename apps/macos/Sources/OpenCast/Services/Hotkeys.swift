import AppKit
import Carbon
import OpenCastCore

@MainActor final class Hotkeys {
  var hyperEnabled = false
  var hyperIncludeShift = true {
    didSet {
      if oldValue != hyperIncludeShift {
        for (id, hotkey) in hyperBindings { _ = try? register(id, hotkey: hotkey) }
      }
    }
  }
  private var hyperBindings: [String: [String: Any]] = [:]
  private var refs: [String: EventHotKeyRef] = [:]
  private var ids: [UInt32: String] = [:]
  private var bindings: [String: (key: UInt16, modifiers: UInt32)] = [:]
  private var next: UInt32 = 1
  private var handler: EventHandlerRef?
  private var recorder: Any?
  private var recording: CheckedContinuation<Any, Never>?
  let hub: EventHub
  var toggle: (() -> Void)?
  init(hub: EventHub) {
    self.hub = hub
    var type = EventTypeSpec(
      eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(
      GetApplicationEventTarget(),
      { _, event, context in
        guard let event, let context else { return OSStatus(eventNotHandledErr) }
        var id = EventHotKeyID()
        GetEventParameter(
          event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil,
          MemoryLayout<EventHotKeyID>.size, nil, &id)
        let service = Unmanaged<Hotkeys>.fromOpaque(context).takeUnretainedValue()
        MainActor.assumeIsolated { service.pressed(id.id) }
        return noErr
      }, 1, &type, Unmanaged.passUnretained(self).toOpaque(), &handler)
  }
  static func flags(_ modifiers: [String]) throws -> CGEventFlags {
    var flags = CGEventFlags()
    for modifier in modifiers {
      switch modifier {
      case "cmd", "windows": flags.insert(.maskCommand)
      case "ctrl": flags.insert(.maskControl)
      case "opt", "alt": flags.insert(.maskAlternate)
      case "shift": flags.insert(.maskShift)
      default: throw RpcError.invalid("Unknown modifier: \(modifier)")
      }
    }
    return flags
  }
  static func code(_ hotkey: [String: Any]) throws -> UInt16 {
    if let n = hotkey["keyCode"] as? Int, (0...127).contains(n) { return UInt16(n) }
    guard let key = hotkey["key"] as? String, let code = KeyMap.code(key) else {
      throw RpcError.invalid("Unknown key")
    }
    return code
  }
  func register(_ id: String, hotkey: [String: Any]) throws -> [String: Any] {
    let key = try Self.code(hotkey)
    var modifiers = hotkey["modifiers"] as? [String] ?? []
    if hotkey.bool("hyper") { modifiers = ["cmd", "ctrl", "opt"] + (hyperIncludeShift ? ["shift"] : []) }
    let flags = try Self.flags(modifiers)
    var carbon: UInt32 = 0
    if flags.contains(.maskCommand) { carbon |= UInt32(cmdKey) }
    if flags.contains(.maskControl) { carbon |= UInt32(controlKey) }
    if flags.contains(.maskAlternate) { carbon |= UInt32(optionKey) }
    if flags.contains(.maskShift) { carbon |= UInt32(shiftKey) }
    if let old = bindings[id], old.key == key, old.modifiers == carbon {
      if hotkey.bool("hyper") { hyperBindings[id] = hotkey } else { hyperBindings.removeValue(forKey: id) }
      return ["ok": true]
    }
    // Register first, so an unrelated conflict does not discard the user's existing binding.
    let number = next
    next += 1
    var ref: EventHotKeyRef?
    let status = RegisterEventHotKey(
      UInt32(key), carbon, EventHotKeyID(signature: 0x5343_4748, id: number),
      GetApplicationEventTarget(), 0, &ref)
    if status != noErr {
      return [
        "ok": false,
        "conflict": "Hotkey registration failed (\(status)); the shortcut may already be in use",
      ]
    }
    unregister(id)
    refs[id] = ref
    ids[number] = id
    bindings[id] = (key, carbon)
    if hotkey.bool("hyper") { hyperBindings[id] = hotkey } else { hyperBindings.removeValue(forKey: id) }
    return ["ok": true]
  }
  func unregister(_ id: String) {
    if let ref = refs.removeValue(forKey: id) { UnregisterEventHotKey(ref) }
    ids = ids.filter { $0.value != id }
    bindings.removeValue(forKey: id)
    hyperBindings.removeValue(forKey: id)
  }
  func unregisterAll() {
    for ref in refs.values { UnregisterEventHotKey(ref) }
    refs.removeAll()
    ids.removeAll()
    bindings.removeAll()
    hyperBindings.removeAll()
  }
  private func pressed(_ number: UInt32) {
    guard let id = ids[number] else { return }
    if id == "opencast.toggle" { toggle?() } else { hub.emit("hotkey.pressed", ["id": id]) }
  }
  func record() async -> Any {
    cancelRecording()
    return await withCheckedContinuation { continuation in
      recording = continuation
      recorder = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
        guard let self else { return event }
        let result: Any
        if event.keyCode == 53 {
          result = NSNull()
        } else {
          let f = event.modifierFlags
          var modifiers: [String] = []
          if f.contains(.command) { modifiers.append("cmd") }
          if f.contains(.control) { modifiers.append("ctrl") }
          if f.contains(.option) { modifiers.append("opt") }
          if f.contains(.shift) { modifiers.append("shift") }
          var recorded: [String: Any] = [
            "key": KeyMap.name(event.keyCode), "keyCode": Int(event.keyCode),
            "modifiers": modifiers,
          ]
          if self.hyperEnabled && f.contains([.command, .control, .option])
            && f.contains(.shift) == self.hyperIncludeShift { recorded["hyper"] = true }
          result = recorded
        }
        self.finishRecording(result)
        return nil
      }
    }
  }
  private func finishRecording(_ result: Any) {
    if let recorder { NSEvent.removeMonitor(recorder) }
    recorder = nil
    let c = recording
    recording = nil
    c?.resume(returning: result)
  }
  func cancelRecording() { finishRecording(NSNull()) }
  func stop() {
    cancelRecording()
    unregisterAll()
    if let handler { RemoveEventHandler(handler) }
  }
}
