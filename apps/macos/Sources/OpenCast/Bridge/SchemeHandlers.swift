import AppKit
import CryptoKit
import OpenCastCore
import WebKit

@MainActor final class SchemeHandlers: NSObject, WKURLSchemeHandler {
  private var active = Set<ObjectIdentifier>()
  private let icons = NSCache<NSString, NSData>()
  static func allowed(_ url: URL) -> Bool {
    let home = FileManager.default.homeDirectoryForCurrentUser
    let roots =
      [
        Environment.dataDir, Environment.dataDir.appendingPathComponent("extensions"),
        home,
      ]
      + ["/Applications", "/System/Applications", "/System/Library/CoreServices"].map {
        URL(fileURLWithPath: $0)
      }
    return FileAccessPolicy.allows(
      url, roots: roots,
      forbidden: [home.appendingPathComponent("Library/Keychains")])
  }
  static func png(_ path: String, size: Int) throws -> Data {
    guard (1...1024).contains(size) else { throw RpcError.invalid("Icon size must be 1...1024") }
    let image = NSWorkspace.shared.icon(forFile: path)
    guard
      let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
        samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
        bytesPerRow: 0, bitsPerPixel: 0), let context = NSGraphicsContext(bitmapImageRep: rep)
    else { throw RpcError.failure("Cannot create icon bitmap") }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
    NSGraphicsContext.restoreGraphicsState()
    guard let data = rep.representation(using: .png, properties: [:]) else {
      throw RpcError.failure("Cannot encode icon")
    }
    return data
  }
  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    let id = ObjectIdentifier(task)
    active.insert(id)
    Task {
      do {
        guard let url = task.request.url else { throw RpcError.invalid("Missing URL") }
        var mime = "application/octet-stream"
        let data: Data
        switch url.scheme {
        case "opencast-app":
          guard url.host == "app" else { throw RpcError.invalid("Invalid app host") }
          let root = Environment.resources.appendingPathComponent("frontend")
            .resolvingSymlinksInPath()
          let path =
            url.path.isEmpty || url.path == "/" ? "main.html" : String(url.path.dropFirst())
          let file = root.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
          guard file.path.hasPrefix(root.path + "/") else {
            throw RpcError(code: -32006, message: "Path outside frontend")
          }
          mime = Self.mime(file.pathExtension)
          data = try await Task.detached { try Data(contentsOf: file) }.value
        case "opencast-icon", "surgecast-icon":
          let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
          guard let path = query.first(where: { $0.name == "path" })?.value else {
            throw RpcError.invalid("Missing icon path")
          }
          guard Self.allowed(URL(fileURLWithPath: path)) else {
            throw RpcError(code: -32006, message: "File access denied")
          }
          let size = Int(query.first(where: { $0.name == "size" })?.value ?? "64") ?? 64
          let modified =
            (try? FileManager.default.attributesOfItem(atPath: path)[.modificationDate] as? Date)?
            .timeIntervalSince1970 ?? 0
          let key = SHA256.hash(data: Data("\(path)|\(size)|\(modified)".utf8)).map {
            String(format: "%02x", $0)
          }.joined()
          let cache = Environment.dataDir.appendingPathComponent("icon-cache/\(key).png")
          if let cached = icons.object(forKey: key as NSString) {
            data = cached as Data
          } else if let cached = try? await Task.detached(operation: { try Data(contentsOf: cache) }
          ).value {
            data = cached
            icons.setObject(cached as NSData, forKey: key as NSString)
          } else {
            data = try Self.png(path, size: size)
            icons.setObject(data as NSData, forKey: key as NSString)
            let copy = data
            Task.detached { try? copy.write(to: cache, options: .atomic) }
          }
          mime = "image/png"
        case "opencast-file", "surgecast-file":
          let raw =
            url.absoluteString.dropFirst((url.scheme! + "://").count).split(
              separator: "?", maxSplits: 1
            ).first.map(String.init) ?? ""
          guard let path = raw.removingPercentEncoding, path.hasPrefix("/") else {
            throw RpcError.invalid("Expected absolute file path")
          }
          let file = URL(fileURLWithPath: path).resolvingSymlinksInPath()
          guard Self.allowed(file) else {
            throw RpcError(code: -32006, message: "File access denied")
          }
          mime = Self.mime(file.pathExtension)
          data = try await Task.detached { try Data(contentsOf: file) }.value
        default: throw RpcError.invalid("Unknown scheme")
        }
        guard active.remove(id) != nil else { return }
        task.didReceive(
          URLResponse(
            url: url, mimeType: mime, expectedContentLength: data.count,
            textEncodingName: mime.hasPrefix("text/") || mime.contains("javascript") ? "utf-8" : nil
          ))
        task.didReceive(data)
        task.didFinish()
      } catch {
        guard active.remove(id) != nil else { return }
        task.didFailWithError(error)
      }
    }
  }
  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
    active.remove(ObjectIdentifier(task))
  }
  static func mime(_ ext: String) -> String {
    [
      "html": "text/html", "js": "application/javascript", "mjs": "application/javascript",
      "css": "text/css", "json": "application/json", "svg": "image/svg+xml", "png": "image/png",
      "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
      "ico": "image/x-icon", "woff": "font/woff", "woff2": "font/woff2", "ttf": "font/ttf",
      "txt": "text/plain", "pdf": "application/pdf", "mp4": "video/mp4", "mp3": "audio/mpeg",
    ][ext.lowercased()] ?? "application/octet-stream"
  }
}
