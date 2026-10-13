import Foundation
import ServiceManagement

@MainActor enum LoginItem {
  static func set(_ enabled: Bool) throws {
    if enabled {
      try SMAppService.mainApp.register()
    } else {
      try SMAppService.mainApp.unregister()
    }
  }
  /// Applies the "Open at Login" setting when it differs from the registered state. Only copies
  /// installed in an Applications folder manage the login item, so dev builds never register.
  static func sync(_ enabled: Bool) {
    let path = Bundle.main.bundleURL.deletingLastPathComponent().path
    guard path == "/Applications" || path.hasSuffix("/Applications") else { return }
    let status = SMAppService.mainApp.status
    let registered = status == .enabled || status == .requiresApproval
    guard enabled != registered else { return }
    do {
      try set(enabled)
    } catch {
      Environment.log("Login item update failed: \(error.localizedDescription)")
    }
  }
}
