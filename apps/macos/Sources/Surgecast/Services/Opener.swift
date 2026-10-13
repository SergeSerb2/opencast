import AppKit

@MainActor enum Opener {
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
