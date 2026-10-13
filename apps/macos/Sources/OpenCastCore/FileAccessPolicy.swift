import Foundation

public enum FileAccessPolicy {
  public static func allows(_ url: URL, roots: [URL], forbidden: [URL]) -> Bool {
    let path = url.standardizedFileURL.resolvingSymlinksInPath().path
    func under(_ candidate: String, _ root: String) -> Bool {
      candidate == root || candidate.hasPrefix(root + "/")
    }
    // Deny case variants as well, since macOS volumes are commonly case-insensitive.
    if forbidden.contains(where: {
      under(path.lowercased(), $0.standardizedFileURL.resolvingSymlinksInPath().path.lowercased())
    }) {
      return false
    }
    return roots.contains { under(path, $0.standardizedFileURL.resolvingSymlinksInPath().path) }
  }
}
