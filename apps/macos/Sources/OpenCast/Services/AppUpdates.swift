import AppKit
import Sparkle

@MainActor final class AppUpdates: NSObject, NSMenuItemValidation {
  private var controller: SPUStandardUpdaterController?

  override init() {
    super.init()
    // Development hosts must not replace themselves with a production release.
    guard Bundle.main.bundleURL.pathExtension == "app",
      Environment.env["OPENCAST_DEV_URL"] == nil,
      Environment.env["OPENCAST_BACKEND_ENTRY"] == nil,
      Environment.env["OPENCAST_RESOURCES"] == nil,
      Environment.env["OPENCAST_DATA_DIR"] == nil
    else { return }
    let controller = SPUStandardUpdaterController(
      startingUpdater: false, updaterDelegate: nil, userDriverDelegate: nil)
    do {
      try controller.updater.start()
      self.controller = controller
    } catch {
      Environment.log("Updater could not start: \(error.localizedDescription)")
    }
  }

  func addMenuItems(to menu: NSMenu) {
    let check = NSMenuItem(
      title: "Check for Updates…", action: #selector(checkForUpdates), keyEquivalent: "")
    check.target = self
    menu.addItem(check)
    let automatic = NSMenuItem(
      title: "Automatically Check for Updates", action: #selector(toggleAutomaticChecks), keyEquivalent: "")
    automatic.target = self
    menu.addItem(automatic)
  }

  @objc private func checkForUpdates() {
    NSApp.activate(ignoringOtherApps: true)
    controller?.checkForUpdates(nil)
  }

  @objc private func toggleAutomaticChecks() {
    guard let updater = controller?.updater else { return }
    updater.automaticallyChecksForUpdates.toggle()
  }

  func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
    guard let updater = controller?.updater else { return false }
    if menuItem.action == #selector(toggleAutomaticChecks) {
      menuItem.state = updater.automaticallyChecksForUpdates ? .on : .off
      return true
    }
    return updater.canCheckForUpdates
  }
}
