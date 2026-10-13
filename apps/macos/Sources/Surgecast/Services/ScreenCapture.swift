import AppKit

@MainActor enum ScreenCapture {
  static func capture(_ p: [String: Any]) async throws -> Any {
    guard CGPreflightScreenCaptureAccess() else { throw RpcError.missing("screenRecording") }
    let mode = try p.string("mode")
    guard ["interactive", "window", "screen"].contains(mode) else {
      throw RpcError.invalid("Invalid capture mode")
    }
    let url: URL
    if p["path"] != nil {
      url = URL(fileURLWithPath: try p.string("path"))
    } else {
      url = FileManager.default.temporaryDirectory.appendingPathComponent(
        "surgecast-\(UUID().uuidString).png")
    }
    var args = ["-x", "-t", "png"]
    if mode == "interactive" { args += ["-i"] }
    if mode == "window" { args += ["-i", "-w"] }
    args.append(url.path)
    let result = try await ProcessRunner.run("/usr/sbin/screencapture", args, timeout: 120)
    if result.status != 0 || !FileManager.default.fileExists(atPath: url.path) {
      if mode != "screen" { return NSNull() }
      throw RpcError.failure(result.error.isEmpty ? "Screen capture failed" : result.error)
    }
    return ["path": url.path]
  }
}
