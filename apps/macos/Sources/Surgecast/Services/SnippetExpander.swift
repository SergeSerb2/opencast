import AppKit
import ApplicationServices

@MainActor final class SnippetExpander {
  private var tap: CFMachPort?
  private var source: CFRunLoopSource?
  private var observer: NSObjectProtocol?
  private var keywords: [(id: String, keyword: String)] = []
  private var ignored = Set<String>()
  private var buffer = ""
  private var expanding = false
  private var revision = 0
  let input: Input
  var resolve: ((String, String) async throws -> Any)?
  init(input: Input) {
    self.input = input
    observer = NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated {
        self?.buffer = ""
        self?.revision += 1
      }
    }
  }
  func set(_ p: [String: Any]) throws {
    stopTap()
    keywords = []
    buffer = ""
    revision += 1
    ignored = Set(p["ignoredBundleIds"] as? [String] ?? [])
    guard try p.boolean("enabled") else { return }
    try Permissions.requireAX()
    guard let items = p["keywords"] as? [[String: Any]] else {
      throw RpcError.invalid("Missing keywords")
    }
    for item in items {
      let keyword = try item.string("keyword")
      guard keyword.count <= 256 else { throw RpcError.invalid("Keyword too long") }
      keywords.append((try item.string("id"), keyword))
    }
    keywords.sort { $0.keyword.count > $1.keyword.count }
    let mask: CGEventMask =
      (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.leftMouseDown.rawValue)
      | (1 << CGEventType.rightMouseDown.rawValue)
    tap = CGEvent.tapCreate(
      tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
      eventsOfInterest: mask,
      callback: { _, type, event, context in
        guard let context else { return Unmanaged.passUnretained(event) }
        let service = Unmanaged<SnippetExpander>.fromOpaque(context).takeUnretainedValue()
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
      buffer = ""
      return
    }
    guard event.getIntegerValueField(.eventSourceUserData) != Input.injected else { return }
    revision += 1
    // A user keystroke or mouse click during a backend round-trip invalidates
    // the suffix. Never erase unrelated text if placeholder resolution is slow.
    guard !expanding else {
      buffer = ""
      return
    }
    guard type == .keyDown, let app = NSWorkspace.shared.frontmostApplication,
      !ignored.contains(app.bundleIdentifier ?? ""),
      app.processIdentifier != ProcessInfo.processInfo.processIdentifier
    else {
      buffer = ""
      return
    }
    let key = event.getIntegerValueField(.keyboardEventKeycode)
    if [36, 48, 53, 115, 116, 117, 119, 121, 123, 124, 125, 126].contains(key)
      || !event.flags.intersection([.maskCommand, .maskControl, .maskAlternate]).isEmpty
    {
      buffer = ""
      return
    }
    if key == 51 {
      if !buffer.isEmpty { buffer.removeLast() }
      return
    }
    var units = [UniChar](repeating: 0, count: 64)
    var length = 0
    event.keyboardGetUnicodeString(
      maxStringLength: 64, actualStringLength: &length, unicodeString: &units)
    buffer += String(utf16CodeUnits: units, count: length)
    buffer = String(buffer.suffix(512))
    guard let match = keywords.first(where: { buffer.hasSuffix($0.keyword) }), let resolve else {
      return
    }
    let typed = buffer
    let pid = app.processIdentifier
    let expansionRevision = revision
    expanding = true
    Task {
      defer {
        buffer = ""
        expanding = false
      }
      do {
        let result = try await resolve(match.id, match.keyword)
        guard let p = result as? [String: Any], let text = p["text"] as? String,
          NSWorkspace.shared.frontmostApplication?.processIdentifier == pid, buffer == typed,
          revision == expansionRevision
        else { return }
        try await input.expandSnippet(
          keyword: match.keyword, text: text,
          cursorOffset: p["cursorOffset"] as? Int ?? 0
        ) {
          self.revision == expansionRevision
            && NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
        }
      } catch { Environment.log("Snippet expansion failed: \(error.localizedDescription)") }
    }
  }
  private func stopTap() {
    if let source { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
    if let tap {
      CGEvent.tapEnable(tap: tap, enable: false)
      CFMachPortInvalidate(tap)
    }
    source = nil
    tap = nil
  }
  func stop() {
    stopTap()
    if let observer { NSWorkspace.shared.notificationCenter.removeObserver(observer) }
  }
}
