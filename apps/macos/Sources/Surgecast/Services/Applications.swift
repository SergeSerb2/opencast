import AppKit
import CoreServices

@MainActor final class Applications {
  private var directories: [String] = []
  private var recursive = false
  private var cache: [[String: Any]] = []
  private var stream: FSEventStreamRef?
  private var observer: NSObjectProtocol?
  private var refreshTask: Task<Void, Never>?
  let hub: EventHub
  static var roots: [String] {
    [
      "/Applications", "/Applications/Utilities", "/System/Applications",
      "/System/Applications/Utilities",
      FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications").path,
      "/Applications/Setapp",
      FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications/Setapp")
        .path,
    ]
  }
  init(hub: EventHub) {
    self.hub = hub
    observer = NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
    ) { [weak self] _ in
      Task { @MainActor in
        self?.hub.emit(
          "frontmost.changed", Self.running(NSWorkspace.shared.frontmostApplication) ?? NSNull())
      }
    }
    startWatching()
  }
  private func startWatching() {
    var context = FSEventStreamContext(
      version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil,
      copyDescription: nil)
    stream = FSEventStreamCreate(
      nil,
      { _, info, _, _, _, _ in
        guard let info else { return }
        let service = Unmanaged<Applications>.fromOpaque(info).takeUnretainedValue()
        DispatchQueue.main.async { service.changed() }
      }, &context, (Self.roots + directories + ["/System/Library/CoreServices"]) as CFArray,
      FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 1,
      FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents))
    if let stream {
      FSEventStreamSetDispatchQueue(stream, DispatchQueue.main)
      FSEventStreamStart(stream)
    }
  }
  func stop() {
    refreshTask?.cancel()
    if let stream {
      FSEventStreamStop(stream)
      FSEventStreamInvalidate(stream)
      FSEventStreamRelease(stream)
    }
    stream = nil
    if let observer { NSWorkspace.shared.notificationCenter.removeObserver(observer) }
  }
  private func changed() {
    refreshTask?.cancel()
    refreshTask = Task {
      try? await Task.sleep(nanoseconds: 500_000_000)
      guard !Task.isCancelled else { return }
      let old = Set(cache.compactMap { $0["path"] as? String })
      let new = await list(refresh: true)
      let paths = Set(new.compactMap { $0["path"] as? String })
      hub.emit(
        "apps.changed",
        [
          "reason": !paths.subtracting(old).isEmpty
            ? "installed" : !old.subtracting(paths).isEmpty ? "removed" : "updated"
        ])
    }
  }
  nonisolated static func info(_ url: URL) -> [String: Any] {
    let b = Bundle(url: url)
    var result: [String: Any] = [
      "name": b?.localizedInfoDictionary?["CFBundleDisplayName"] ?? b?.localizedInfoDictionary?[
        "CFBundleName"] ?? b?.object(forInfoDictionaryKey: "CFBundleDisplayName") ?? b?.object(
          forInfoDictionaryKey: "CFBundleName") ?? url.deletingPathExtension().lastPathComponent,
      "path": url.path, "isSystem": url.path.hasPrefix("/System/"),
    ]
    result["bundleId"] = b?.bundleIdentifier
    result["version"] = b?.object(forInfoDictionaryKey: "CFBundleShortVersionString")
    return result
  }
  static func running(_ app: NSRunningApplication?) -> [String: Any]? {
    guard let app, let url = app.bundleURL else { return nil }
    var o = info(url)
    o["name"] = app.localizedName ?? o["name"]
    o["pid"] = app.processIdentifier
    o["isActive"] = app.isActive
    o["isHidden"] = app.isHidden
    return o
  }
  func list(refresh: Bool = false) async -> [[String: Any]] {
    if !refresh && !cache.isEmpty { return cache }
    let roots = Self.roots + directories
    let depth = recursive ? 32 : 1
    let result = await Task.detached { () -> [[String: Any]] in
      var paths = Set<String>()
      func scan(_ root: URL, depth: Int) {
        guard
          let items = try? FileManager.default.contentsOfDirectory(
            at: root, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])
        else { return }
        for item in items {
          if item.pathExtension == "app" {
            paths.insert(item.resolvingSymlinksInPath().path)
          } else if depth > 0,
            (try? item.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
          {
            scan(item, depth: depth - 1)
          }
        }
      }
      for root in roots { scan(URL(fileURLWithPath: root), depth: depth) }
      let finder = "/System/Library/CoreServices/Finder.app"
      if FileManager.default.fileExists(atPath: finder) { paths.insert(finder) }
      return paths.map { Self.info(URL(fileURLWithPath: $0)) }.sorted {
        ($0["name"] as? String ?? "").localizedCaseInsensitiveCompare($1["name"] as? String ?? "")
          == .orderedAscending
      }
    }.value
    cache = result
    return result
  }
  static func resolve(_ id: String) -> URL? {
    id.hasPrefix("/")
      ? URL(fileURLWithPath: id) : NSWorkspace.shared.urlForApplication(withBundleIdentifier: id)
  }
  static func findRunning(_ id: String) -> NSRunningApplication? {
    NSWorkspace.shared.runningApplications.first {
      $0.bundleIdentifier == id || $0.bundleURL?.path == id
    }
  }
  func call(_ method: String, _ p: [String: Any], previous: NSRunningApplication?) async throws
    -> Any
  {
    switch method {
    case "apps.list":
      let paths = (p["directories"] as? [String] ?? directories).map { ($0 as NSString).expandingTildeInPath }
      let recurse = p["recursive"] as? Bool ?? recursive
      let changed = paths != directories || recurse != recursive
      directories = paths; recursive = recurse
      if changed {
        if let stream { FSEventStreamStop(stream); FSEventStreamInvalidate(stream); FSEventStreamRelease(stream) }
        stream = nil
        startWatching()
      }
      return await list(refresh: changed || p.bool("refresh"))
    case "apps.running": return NSWorkspace.shared.runningApplications.compactMap(Self.running)
    case "apps.frontmost": return Self.running(NSWorkspace.shared.frontmostApplication) ?? NSNull()
    case "apps.previous": return Self.running(previous) ?? NSNull()
    case "apps.defaultForPath":
      let url = URL(fileURLWithPath: try p.string("path"))
      return NSWorkspace.shared.urlForApplication(toOpen: url).map(Self.info) ?? (NSNull() as Any)
    case "apps.forUrl":
      guard let url = URL(string: try p.string("url")) else {
        throw RpcError.invalid("Invalid URL")
      }
      return NSWorkspace.shared.urlsForApplications(toOpen: url).map(Self.info)
    case "apps.activate":
      let id = try p.string("bundleIdOrPath")
      if let app = Self.findRunning(id) {
        guard app.activate() else { throw RpcError.failure("Cannot activate application") }
      } else {
        guard let url = Self.resolve(id) else {
          throw RpcError(code: -32004, message: "Application not found")
        }
        _ = try await NSWorkspace.shared.openApplication(
          at: url, configuration: NSWorkspace.OpenConfiguration())
      }
      return NSNull()
    case "apps.hide", "apps.quit":
      guard let app = Self.findRunning(try p.string("bundleIdOrPath")) else {
        throw RpcError(code: -32004, message: "Application is not running")
      }
      let ok =
        method == "apps.hide"
        ? app.hide() : p.bool("force") ? app.forceTerminate() : app.terminate()
      guard ok else { throw RpcError.failure("Application rejected request") }
      return NSNull()
    default: throw RpcError.unsupported("Unknown applications method")
    }
  }
}
