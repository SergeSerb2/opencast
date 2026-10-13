import AppKit

@MainActor final class NativeRouter {
  let hub: EventHub
  let applications: Applications
  let permissions: Permissions
  let clipboard: Pasteboard
  let hotkeys: Hotkeys
  let manager = WindowManager()
  let speech = Speech()
  let power = Power()
  let hyperKey = HyperKey()
  let tidyMenuBar = TidyMenuBar()
  let hud = HUD()
  let confetti = Confetti()
  let extras: MenuBarExtras
  var windows: HostWindows!
  var input: Input!
  var snippets: SnippetExpander!
  private(set) lazy var sequentialPaste = SequentialPaste(board: clipboard, hud: hud)
  private var calendar: CalendarService
  var setMenuBar: ((Bool) -> Void)?
  init(hub: EventHub) {
    self.hub = hub
    applications = Applications(hub: hub)
    permissions = Permissions(hub: hub)
    clipboard = Pasteboard(hub: hub)
    hotkeys = Hotkeys(hub: hub)
    extras = MenuBarExtras(hub: hub)
    calendar = CalendarService()
  }
  func attach(_ windows: HostWindows) {
    self.windows = windows
    input = Input(board: clipboard, windows: windows)
    snippets = SnippetExpander(input: input)
    manager.previous = { [weak windows] in windows?.launcher.previous }
    hotkeys.toggle = { [weak windows] in windows?.toggleLauncher() }
    windows.launcher.hidden = { [weak hotkeys] in hotkeys?.cancelRecording() }
  }
  func call(_ method: String, _ p: [String: Any]) async throws -> Any {
    switch method {
    case "app.configure":
      guard let settings = p["settings"] as? [String: Any] else { throw RpcError.invalid("Missing settings") }
      windows.launcher.presentationMode = settings["launcher.windowPresentationMode"] as? String ?? "mouse-screen"
      windows.launcher.activationBehavior = settings["advanced.windowActivationBehavior"] as? String ?? "move-to-active-space"
      windows.launcher.keepVisible = p.bool("developmentActive") && (settings["developer.keepWindowVisibleDuringDevelopment"] as? Bool ?? false)
      manager.cycling = settings["windowManagement.cycling"] as? String ?? "halves-thirds"
      if settings["ai.preventIdleSleep"] as? Bool != true { power.stop() }
      manager.respectStageManager = settings["windowManagement.respectStageManager"] as? Bool ?? true
      tidyMenuBar.set(settings["advanced.tidyMenuBar"] as? Bool ?? false)
      hotkeys.hyperEnabled = (settings["keyboard.hyperKey"] as? String ?? "none") != "none"
      hotkeys.hyperIncludeShift = settings["keyboard.hyperKeyIncludeShift"] as? Bool ?? true
      setMenuBar?(settings["general.showInMenuBar"] as? Bool ?? true)
      LoginItem.sync(settings["general.openAtLogin"] as? Bool ?? true)
      // Last: Hyper Key throws without Accessibility, which must not skip the settings above.
      try hyperKey.configure(settings)
    case "system.onBattery": return try Power.onBattery()
    case "system.setIdleSleepPrevented": try power.set(p)
    case "app.info":
      #if arch(arm64)
        let arch = "arm64"
      #else
        let arch = "x86_64"
      #endif
      return [
        "version": Environment.version,
        "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1",
        "macOSVersion": ProcessInfo.processInfo.operatingSystemVersionString,
        "macOSMajor": Environment.major, "arch": arch, "bundlePath": Bundle.main.bundlePath,
        "dataDir": Environment.dataDir.path,
      ]
    case "app.quit": DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { NSApp.terminate(nil) }
    case "app.relaunch":
      let bundle = Bundle.main.bundleURL
      let pid = ProcessInfo.processInfo.processIdentifier
      Task {
        _ = try? await ProcessRunner.run(
          "/bin/sh",
          [
            "-c", "while kill -0 \"$1\" 2>/dev/null; do sleep 0.1; done; exec /usr/bin/open \"$2\"",
            "surgecast-relaunch", String(pid), bundle.path,
          ], timeout: 15)
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { NSApp.terminate(nil) }
    case "app.setLaunchAtLogin": try LoginItem.set(p.boolean("enabled"))
    case "app.setMenuBarIconVisible": setMenuBar?(try p.boolean("visible"))
    case "app.setDockIconVisible":
      NSApp.setActivationPolicy(try p.boolean("visible") ? .regular : .accessory)
    case "window.show", "window.hide", "window.toggle", "window.close", "window.setContentHeight",
      "window.setSize", "window.setFloating", "window.isVisible", "window.startDrag":
      if method == "window.hide" || method == "window.close" { hotkeys.cancelRecording() }
      return try windows.perform(method, p)
    case "apps.list", "apps.running", "apps.frontmost", "apps.previous", "apps.defaultForPath",
      "apps.forUrl", "apps.activate", "apps.hide", "apps.quit":
      return try await applications.call(method, p, previous: windows.launcher.previous)
    case "open.url", "open.path", "open.showInFinder", "open.trash", "open.quickLook":
      return try await Opener.call(method, p)
    case "clipboard.read": return try await clipboard.read() ?? (NSNull() as Any)
    case "clipboard.write":
      guard let content = p["content"] as? [String: Any] else {
        throw RpcError.invalid("Missing content")
      }
      try clipboard.write(content, concealed: p.bool("concealed"), transient: p.bool("transient"))
    case "clipboard.clear": NSPasteboard.general.clearContents()
    case "clipboard.setMonitoring": try clipboard.monitor(p)
    case "clipboard.setSequentialPaste": try sequentialPaste.set(p)
    case "input.paste", "input.typeText", "input.pressKeys", "input.selectedText",
      "input.selectedFinderItems":
      return try await input.call(method, p)
    case "hotkeys.register":
      guard let hotkey = p["hotkey"] as? [String: Any] else {
        throw RpcError.invalid("Missing hotkey")
      }
      return try hotkeys.register(try p.string("id"), hotkey: hotkey)
    case "hotkeys.unregister": hotkeys.unregister(try p.string("id"))
    case "hotkeys.unregisterAll": hotkeys.unregisterAll()
    case "hotkeys.record": return await hotkeys.record()
    case "snippets.setKeywords": try snippets.set(p)
    case "windows.run", "windows.applyLayout", "windows.undo", "windows.screens", "windows.focused":
      return try await manager.call(method, p)
    case "system.run": try await SystemActions.run(p, previous: windows.launcher.previous)
    case "system.appearance":
      return NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        ? "dark" : "light"
    case "system.volume": return try SystemActions.volume()
    case "system.runAppleScript":
      return try await SystemActions.appleScript(
        try p.string("script"), language: p["language"] as? String ?? "AppleScript")
    case "system.notification": try await SystemActions.notification(p)
    case "permissions.status": return permissions.status()
    case "permissions.request": return try await permissions.request(try p.string("kind"))
    case "permissions.openSettings": try permissions.openSettings(try p.string("kind"))
    case "keychain.get", "keychain.set", "keychain.delete":
      return try await Task.detached { try Keychain.call(method, p) }.value
    case "calendar.calendars", "calendar.events": return try await calendar.call(method, p)
    case "menus.list", "menus.press":
      return try await MenuItems.call(method, p, previous: windows.launcher.previous)
    case "files.icon", "files.metadata": return try await FileInfo.call(method, p)
    case "dialog.saveFile": return try await FileDialog.save(p)
    case "dialog.openFiles": return await FileDialog.open(p)
    case "screen.capture": return try await ScreenCapture.capture(p)
    case "speech.say": try speech.say(p)
    case "hud.show": try hud.show(p)
    case "confetti.show": confetti.show()
    case "alert.show": return try await Alert.show(p, window: NSApp.keyWindow)
    case "menubar.set": try await extras.set(p)
    case "menubar.remove": extras.remove(try p.string("id"))
    default: throw RpcError(code: -32601, message: "Method not found: \(method)")
    }
    return NSNull()
  }
  func stop() {
    Environment.log("Stopping applications watcher")
    applications.stop()
    Environment.log("Applications watcher stopped")
    tidyMenuBar.stop()
    hyperKey.stop()
    power.stop()
    permissions.stop()
    clipboard.stop()
    hotkeys.stop()
    snippets?.stop()
    sequentialPaste.stop()
    Environment.log("Stopping speech")
    speech.stop()
    Environment.log("Speech stopped")
    hud.stop()
    confetti.stop()
    extras.stop()
  }
}
