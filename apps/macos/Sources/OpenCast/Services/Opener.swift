import AppKit

@MainActor enum Opener {
  private static func activateTab(_ url: URL, app: String?) async -> Bool {
    guard ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return false }
    let appURL = app.flatMap(Applications.resolve) ?? NSWorkspace.shared.urlForApplication(toOpen: url)
    guard let appURL, let id = Bundle(url: appURL)?.bundleIdentifier,
      ["com.apple.Safari", "com.google.Chrome", "com.brave.Browser", "com.microsoft.edgemac", "com.google.Chrome.canary", "company.thebrowser.Browser", "org.chromium.Chromium"].contains(id)
    else { return false }
    let script = """
      const app = Application(\(json(id)));
      const target = \(json(url.absoluteString));
      let found = false;
      if (app.running()) {
        const windows = app.windows();
        for (const window of windows) {
          const tabs = window.tabs();
          for (let i = 0; i < tabs.length; i++) {
            if (tabs[i].url() === target) {
              if (\(json(id)) === "com.apple.Safari") window.currentTab = tabs[i];
              else window.activeTabIndex = i + 1;
              window.index = 1;
              app.activate();
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }
      found;
      """
    return (try? await SystemActions.appleScript(script, language: "JavaScript")) == "true"
  }
  static func call(_ method: String, _ p: [String: Any]) async throws -> Any {
    switch method {
    case "open.url", "open.path":
      let url: URL
      if method == "open.path" {
        url = URL(fileURLWithPath: try p.string("path"))
      } else {
        guard let value = URL(string: try p.string("url")), value.scheme != nil else {
          throw RpcError.invalid("Invalid URL")
        }
        url = value
      }
      if method == "open.url", p.bool("preferExistingTabs"), await activateTab(url, app: p["app"] as? String) { return NSNull() }
      let config = NSWorkspace.OpenConfiguration()
      config.activates = !p.bool("background")
      if let app = p["app"] as? String {
        guard let appURL = Applications.resolve(app) else {
          throw RpcError(code: -32004, message: "Application not found")
        }
        _ = try await NSWorkspace.shared.open(
          [url], withApplicationAt: appURL, configuration: config)
      } else if p.bool("background"), let appURL = NSWorkspace.shared.urlForApplication(toOpen: url)
      {
        _ = try await NSWorkspace.shared.open(
          [url], withApplicationAt: appURL, configuration: config)
      } else {
        guard NSWorkspace.shared.open(url) else {
          throw RpcError.failure("Cannot open URL or file")
        }
      }
    case "open.showInFinder":
      NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: try p.string("path"))])
    case "open.trash":
      let paths = try p.strings("paths")
      try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
        NSWorkspace.shared.recycle(paths.map { URL(fileURLWithPath: $0) }) { _, error in
          if let error { c.resume(throwing: error) } else { c.resume() }
        }
      }
    case "open.quickLook":
      let path = try p.string("path")
      Task { _ = try? await ProcessRunner.run("/usr/bin/qlmanage", ["-p", path], timeout: 3600) }
    default: throw RpcError.unsupported("Unknown open method")
    }
    return NSNull()
  }
}
