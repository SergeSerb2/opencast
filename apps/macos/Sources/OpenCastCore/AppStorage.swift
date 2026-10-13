import Foundation

public enum AppStorage {
  // Reuse an existing install in place, including its clipboard and extension files.
  public static func directory(home: URL, parent: String) -> URL {
    let root = home.appendingPathComponent(parent)
    let current = root.appendingPathComponent("OpenCast")
    let legacy = root.appendingPathComponent("Surgecast")
    if !FileManager.default.fileExists(atPath: current.path),
      FileManager.default.fileExists(atPath: legacy.path) { return legacy }
    return current
  }
}
