import AppKit
import ApplicationServices

@MainActor final class SnippetExpander {
  private var tap: CFMachPort?
  private var source: CFRunLoopSource?
  private var observer: NSObjectProtocol?
  private var configuration: NSDictionary?
  private var keywords: [(id: String, keyword: String)] = []
  private var expandWithinWords = true
  private var mode = "immediately"
  private var injectionDelay: UInt64 = 0
  private var responseDelay: UInt64 = 50_000_000
  private var sound = ""
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
    let next = p as NSDictionary
    if configuration?.isEqual(to: p) == true && (tap != nil || (p["enabled"] as? Bool) == false) { return }
    configuration = nil
    stopTap()
    keywords = []
    buffer = ""
    revision += 1
    expandWithinWords = p["expandWithinWords"] as? Bool ?? true
    mode = p["expansionMode"] as? String ?? "immediately"
    injectionDelay = ["none": 0, "short": 100_000_000, "regular": 250_000_000, "long": 500_000_000, "extra-long": 1_000_000_000][p["injectionDelay"] as? String ?? "none"] ?? 0
    responseDelay = ["instant": 0, "quick": 20_000_000, "default": 50_000_000, "delayed": 150_000_000, "extended": 300_000_000][p["responseTime"] as? String ?? "default"] ?? 50_000_000
    sound = p["completionSound"] as? String ?? ""
    ignored = Set(p["ignoredBundleIds"] as? [String] ?? [])
    guard try p.boolean("enabled") else { configuration = next; return }
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
    configuration = next
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
      !ignored.contains(app.bundleIdentifier ?? ""), !ignored.contains(app.bundleURL?.path ?? ""),
      app.processIdentifier != ProcessInfo.processInfo.processIdentifier
    else {
      buffer = ""
      return
    }
    let key = event.getIntegerValueField(.keyboardEventKeycode)
    if [53, 115, 116, 117, 119, 121, 123, 124, 125, 126].contains(key)
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
    let inputText = key == 36 ? "\n" : key == 48 ? "\t" : String(utf16CodeUnits: units, count: length)
    buffer += inputText
    buffer = String(buffer.suffix(512))
    let delimiter = inputText
    let afterDelimiter = mode != "immediately"
    if afterDelimiter && (delimiter.isEmpty || !delimiter.allSatisfy({ $0.isWhitespace || $0.isPunctuation })) { return }
    let candidate = afterDelimiter ? String(buffer.dropLast(delimiter.count)) : buffer
    guard let match = keywords.first(where: {
      guard candidate.hasSuffix($0.keyword) else { return false }
      if expandWithinWords { return true }
      let prefix = candidate.dropLast($0.keyword.count)
      return prefix.last.map { !$0.isLetter && !$0.isNumber && $0 != "_" } ?? true
    }), let resolve else { return }
    let suffix = afterDelimiter ? delimiter : ""
    let keepSuffix = mode == "after-delimiter-keeping"
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
        if injectionDelay > 0 { try await Task.sleep(nanoseconds: injectionDelay) }
        guard revision == expansionRevision else { return }
        let result = try await resolve(match.id, match.keyword)
        guard let p = result as? [String: Any], let text = p["text"] as? String,
          NSWorkspace.shared.frontmostApplication?.processIdentifier == pid, buffer == typed,
          revision == expansionRevision
        else { return }
        if responseDelay > 0 { try await Task.sleep(nanoseconds: responseDelay) }
        try await input.expandSnippet(
          keyword: match.keyword + suffix, text: text + (keepSuffix ? suffix : ""),
          cursorOffset: (p["cursorOffset"] as? Int ?? 0) + (keepSuffix && (p["cursorOffset"] as? Int ?? 0) > 0 ? suffix.count : 0)
        ) {
          self.revision == expansionRevision
            && NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
        }
        if !sound.isEmpty { NSSound(named: NSSound.Name(sound))?.play() }
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
