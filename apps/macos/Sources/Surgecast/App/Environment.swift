import AppKit

struct Environment {
  static let version =
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
  static let major = ProcessInfo.processInfo.operatingSystemVersion.majorVersion
  static let env = ProcessInfo.processInfo.environment
  static let dataDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(
    "Library/Application Support/Surgecast")
  static let logDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(
    "Library/Logs/Surgecast")
  static let resources =
    env["SURGECAST_RESOURCES"].map { URL(fileURLWithPath: $0).standardizedFileURL } ?? Bundle.main
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
