import AppKit

/// A user-positionable divider uses AppKit's normal menu-bar overflow.
/// Icons to its left collapse until the pointer enters the menu bar.
@MainActor final class TidyMenuBar {
  private var item: NSStatusItem?
  private var timer: Timer?
  func set(_ enabled: Bool) {
    if !enabled { stop(); return }
    guard item == nil else { return }
    let divider = NSStatusBar.system.statusItem(withLength: 22)
    divider.autosaveName = "Surgecast.TidyDivider"
    divider.button?.title = "│"
    divider.button?.toolTip = "Command-drag this divider to place the items you want to hide to its left"
    item = divider
    update()
    timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.update() }
    }
  }
  private func update() {
    let pointer = NSEvent.mouseLocation
    let hovering = NSScreen.screens.contains { screen in
      screen.frame.contains(pointer) && pointer.y >= screen.frame.maxY - 28
    }
    item?.length = hovering ? 22 : max(1000, (NSScreen.screens.map { $0.frame.width }.max() ?? 0) * 2)
  }
  func stop() {
    timer?.invalidate(); timer = nil
    if let item { NSStatusBar.system.removeStatusItem(item) }
    item = nil
  }
}
