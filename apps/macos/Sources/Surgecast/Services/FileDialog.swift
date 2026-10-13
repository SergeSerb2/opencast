import AppKit
import UniformTypeIdentifiers

/// `dialog.openFiles`: a standard open panel for form file pickers and
/// file/directory preferences. Resolves with the chosen paths, or null on cancel.
@MainActor enum FileDialog {
  static func open(_ p: [String: Any]) async -> Any {
    let panel = NSOpenPanel()
    panel.canChooseFiles = p["canChooseFiles"] as? Bool ?? true
    panel.canChooseDirectories = p.bool("canChooseDirectories")
    panel.allowsMultipleSelection = p.bool("allowMultipleSelection")
    panel.canCreateDirectories = panel.canChooseDirectories
    if let title = p["title"] as? String { panel.message = title }
    if let prompt = p["prompt"] as? String { panel.prompt = prompt }
    if let directory = p["directory"] as? String {
      panel.directoryURL = URL(fileURLWithPath: (directory as NSString).expandingTildeInPath)
    }
    if let types = p["allowedTypes"] as? [String], !types.isEmpty {
      panel.allowedContentTypes = types.compactMap { UTType(filenameExtension: $0) ?? UTType($0) }
    }
    NSApp.activate(ignoringOtherApps: true)
    let response = await withCheckedContinuation { continuation in
      panel.begin { continuation.resume(returning: $0) }
    }
    guard response == .OK else { return NSNull() }
    return panel.urls.map(\.path)
  }
}
