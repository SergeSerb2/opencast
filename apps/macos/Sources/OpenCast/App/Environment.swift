import AppKit
import OpenCastCore

struct Environment {
  static let version =
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
  static let major = ProcessInfo.processInfo.operatingSystemVersion.majorVersion
  static let env: [String: String] = {
    var values = ProcessInfo.processInfo.environment
    // Keep development overrides from older installs usable.
    for (key, value) in ProcessInfo.processInfo.environment where key.hasPrefix("SURGECAST_") {
      let renamed = key.replacingOccurrences(of: "SURGECAST_", with: "OPENCAST_")
      if values[renamed] == nil { values[renamed] = value }
    }
    return values
  }()
  static let dataDir = env["OPENCAST_DATA_DIR"].map { URL(fileURLWithPath: $0).standardizedFileURL } ?? AppStorage.directory(
    home: FileManager.default.homeDirectoryForCurrentUser, parent: "Library/Application Support")
  static let logDir = env["OPENCAST_LOG_DIR"].map { URL(fileURLWithPath: $0).standardizedFileURL } ?? AppStorage.directory(
    home: FileManager.default.homeDirectoryForCurrentUser, parent: "Library/Logs")
  static let resources =
    env["OPENCAST_RESOURCES"].map { URL(fileURLWithPath: $0).standardizedFileURL } ?? Bundle.main
    .resourceURL!
  static func prepare() throws {
    for dir in [
      dataDir, logDir, dataDir.appendingPathComponent("clipboard"),
      dataDir.appendingPathComponent("icon-cache"),
    ] { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
  }
  static func log(_ text: String) {
    let line =
      "[\(ISO8601DateFormatter().string(from: Date()))] [pid \(ProcessInfo.processInfo.processIdentifier)] \(text)\n"
    let url = logDir.appendingPathComponent("native.log")
    if !FileManager.default.fileExists(atPath: url.path) {
      FileManager.default.createFile(atPath: url.path, contents: nil)
    }
    if let h = try? FileHandle(forWritingTo: url) {
      _ = try? h.seekToEnd()
      try? h.write(contentsOf: Data(line.utf8))
      try? h.close()
    }
  }
}
@MainActor final class EventHub {
  var backend: ((String, Any) -> Void)?
  var web: ((String, Any) -> Void)?
  func emit(_ topic: String, _ payload: Any = [String: Any]()) {
    backend?(topic, payload)
    web?(topic, payload)
  }
}
