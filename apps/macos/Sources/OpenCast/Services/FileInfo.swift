import AppKit
import CoreServices

@MainActor enum FileInfo {
  static func call(_ method: String, _ p: [String: Any]) async throws -> Any {
    let path = try p.string("path")
    guard FileManager.default.fileExists(atPath: path) else {
      throw RpcError(code: -32004, message: "File not found")
    }
    if method == "files.icon" {
      let size = try p.number("size")
      guard (1...1024).contains(size) else { throw RpcError.invalid("Icon size must be 1...1024") }
      return [
        "pngBase64": try SchemeHandlers.png(path, size: Int(size))
          .base64EncodedString()
      ]
    }
    return try await Task.detached { () -> [String: Any] in
      let attrs = try FileManager.default.attributesOfItem(atPath: path)
      var o: [String: Any] = [:]
      let f = ISO8601DateFormatter()
      o["size"] = attrs[.size]
      o["created"] = (attrs[.creationDate] as? Date).map(f.string)
      o["modified"] = (attrs[.modificationDate] as? Date).map(f.string)
      if let item = MDItemCreate(nil, path as CFString) {
        o["kind"] = MDItemCopyAttribute(item, kMDItemKind)
        o["uti"] = MDItemCopyAttribute(item, kMDItemContentType)
        o["lastOpened"] = (MDItemCopyAttribute(item, kMDItemLastUsedDate) as? Date).map(f.string)
        if let whereFrom = MDItemCopyAttribute(item, kMDItemWhereFroms) as? [String] {
          o["where"] = whereFrom.joined(separator: ", ")
        }
      }
      return o
    }.value
  }
}
