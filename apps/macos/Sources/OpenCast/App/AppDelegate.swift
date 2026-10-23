import AppKit
import Carbon

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
  private var backend: BackendProcess!
  private var router: NativeRouter!
  private var windows: HostWindows!
  private var factory: WebViewFactory!
  private var updates: AppUpdates!
  private let hub = EventHub()
  private var status: NSStatusItem?
  private var observers: [NSObjectProtocol] = []
  private let showNotifications = ["app.opencast.showLauncher", "app.surgecast.showLauncher"].map { Notification.Name($0) }
  private var instanceFD: Int32 = -1
  private var ownsInstance = false
  private var quitting = false
  private var finishedShutdown = false
  private var backendIsReady = false
  private var pendingURLs: [String] = []
  private var signalSources: [DispatchSourceSignal] = []
  func applicationWillFinishLaunching(_ notification: Notification) {
    do { try Environment.prepare() } catch {
      fputs("OpenCast data directory unavailable: \(error)\n", stderr)
      NSApp.terminate(nil)
      return
    }
    // flock also closes the race between two processes starting simultaneously.
    instanceFD = open(
      Environment.dataDir.appendingPathComponent("native.lock").path, O_CREAT | O_RDWR, 0o600)
    guard instanceFD >= 0, flock(instanceFD, LOCK_EX | LOCK_NB) == 0 else {
      for name in showNotifications {
        DistributedNotificationCenter.default().postNotificationName(
          name, object: nil, userInfo: nil, deliverImmediately: true)
      }
      NSApp.terminate(nil)
      return
    }
    ownsInstance = true
    NSApp.setActivationPolicy(.accessory)
    NSAppleEventManager.shared().setEventHandler(
      self, andSelector: #selector(openURL(_:reply:)),
      forEventClass: AEEventClass(kInternetEventClass), andEventID: AEEventID(kAEGetURL))
  }
  func applicationDidFinishLaunching(_ notification: Notification) {
    guard ownsInstance else { return }
    router = NativeRouter(hub: hub)
    factory = WebViewFactory(hub: hub)
    factory.router = router
    windows = HostWindows(factory: factory, hub: hub)
    router.attach(windows)
    router.setMenuBar = { [weak self] visible in self?.setStatusVisible(visible) }
    updates = AppUpdates()
    installMenu()
    setStatusVisible(true)
    backend = BackendProcess(hub: hub)
    backend.router = { [weak self] method, p in
      guard let router = self?.router else { throw RpcError.failure("Native router unavailable") }
      return try await router.call(method, p)
    }
    backend.disconnected = { [weak self] in
      self?.router.power.stop()
      self?.backendIsReady = false
    }
    backend.ready = { [weak self] info in
      guard let self else { return }
      self.factory.backendReady(info)
      self.backendIsReady = true
      for url in self.pendingURLs { self.hub.emit("url.opened", ["url": url]) }
      self.pendingURLs.removeAll()
    }
    router.snippets.resolve = { [weak backend] id, keyword in
      guard let channel = backend?.channel else { throw RpcError.failure("Backend unavailable") }
      return try await channel.request("snippets.resolve", ["id": id, "keyword": keyword])
    }
    do {
      let result = try router.hotkeys.register(
        "opencast.toggle", hotkey: ["modifiers": ["opt"], "key": "space"])
      if result["ok"] as? Bool != true { Environment.log("Default launcher hotkey unavailable") }
    } catch { Environment.log("Default hotkey registration failed") }
    for name in showNotifications {
      observers.append(
        DistributedNotificationCenter.default().addObserver(
          forName: name, object: nil, queue: .main
        ) { [weak self] _ in Task { @MainActor in
          Environment.log("Launcher activation requested (\(name.rawValue))")
          self?.windows.launcher.show()
        } })
    }
    for (name, topic) in [
      (NSWorkspace.willSleepNotification, "system.willSleep"),
      (NSWorkspace.didWakeNotification, "system.didWake"),
    ] {
      observers.append(
        NSWorkspace.shared.notificationCenter.addObserver(forName: name, object: nil, queue: .main)
        { [weak self] _ in Task { @MainActor in self?.hub.emit(topic) } })
    }
    for sig in [SIGTERM, SIGINT] {
      signal(sig, SIG_IGN)
      let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
      source.setEventHandler {
        Environment.log("Termination signal received")
        NSApp.terminate(nil)
      }
      source.resume()
      signalSources.append(source)
    }
    backend.start()
    if Environment.env["OPENCAST_SHOW_ON_START"] == "1" { windows.launcher.show() }
    Environment.log("Native host started")
  }
  @objc private func openURL(_ event: NSAppleEventDescriptor, reply: NSAppleEventDescriptor) {
    if let url = event.paramDescriptor(forKeyword: AEKeyword(keyDirectObject))?.stringValue {
      receivedURL(url)
    }
  }
  func application(_ application: NSApplication, open urls: [URL]) {
    for url in urls { receivedURL(url.absoluteString) }
  }
  private func receivedURL(_ url: String) {
    if backendIsReady { hub.emit("url.opened", ["url": url]) } else { pendingURLs.append(url) }
  }
  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    Environment.log("Termination requested")
    guard ownsInstance, backend != nil, !finishedShutdown else { return .terminateNow }
    if !quitting {
      quitting = true
      Environment.log("Services shutdown starting")
      router?.stop()
      Environment.log("Services shutdown complete")
      backend.shutdown { [weak self] in
        self?.finishedShutdown = true
        NSApp.terminate(nil)
      }
    }
    // Keep AppKit's normal run loop alive while Foundation reaps the child.
    // terminateLater suspends main-queue work in this SPM command-line host.
    return .terminateCancel
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
  func applicationWillTerminate(_ notification: Notification) {
    for observer in observers {
      DistributedNotificationCenter.default().removeObserver(observer)
      NSWorkspace.shared.notificationCenter.removeObserver(observer)
    }
    signalSources.forEach { $0.cancel() }
    if instanceFD >= 0 {
      if ownsInstance { flock(instanceFD, LOCK_UN) }
      close(instanceFD)
    }
    Environment.log("Native host stopped")
  }
  private func setStatusVisible(_ visible: Bool) {
    if !visible {
      if let status { NSStatusBar.system.removeStatusItem(status) }
      status = nil
      return
    }
    guard status == nil else { return }
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    let image = NSImage(systemSymbolName: "bolt.circle.fill", accessibilityDescription: "OpenCast")
    image?.isTemplate = true
    item.button?.image = image
    item.button?.toolTip = "OpenCast"
    let menu = NSMenu()
    menu.addItem(menuItem("Open OpenCast", #selector(showLauncher), " ", [.option]))
    menu.addItem(menuItem("AI Chat", #selector(showAI)))
    menu.addItem(menuItem("Notes", #selector(showNotes)))
    menu.addItem(menuItem("Settings…", #selector(showSettings), ","))
    updates.addMenuItems(to: menu)
    menu.addItem(.separator())
    menu.addItem(menuItem("Quit OpenCast", #selector(quit), "q"))
    item.menu = menu
    status = item
  }
  private func menuItem(
    _ title: String, _ action: Selector, _ key: String = "",
    _ modifiers: NSEvent.ModifierFlags = .command
  ) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
    item.target = self
    item.keyEquivalentModifierMask = modifiers
    return item
  }
  private func installMenu() {
    let main = NSMenu()
    let appMenu = NSMenu(title: "OpenCast")
    appMenu.addItem(menuItem("About OpenCast", #selector(about)))
    appMenu.addItem(menuItem("Settings…", #selector(showSettings), ","))
    updates.addMenuItems(to: appMenu)
    appMenu.addItem(.separator())
    appMenu.addItem(menuItem("Quit OpenCast", #selector(quit), "q"))
    let appItem = NSMenuItem()
    appItem.submenu = appMenu
    main.addItem(appItem)
    let edit = NSMenu(title: "Edit")
    for (title, selector, key, shift) in [
      ("Undo", "undo:", "z", false), ("Redo", "redo:", "z", true), ("Cut", "cut:", "x", false),
      ("Copy", "copy:", "c", false), ("Paste", "paste:", "v", false),
      ("Select All", "selectAll:", "a", false),
    ] {
      let item = NSMenuItem(
        title: title, action: NSSelectorFromString(selector), keyEquivalent: key)
      item.keyEquivalentModifierMask = shift ? [.command, .shift] : .command
      edit.addItem(item)
    }
    let editItem = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
    editItem.submenu = edit
    main.addItem(editItem)
    let window = NSMenu(title: "Window")
    window.addItem(
      NSMenuItem(
        title: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
    window.addItem(
      NSMenuItem(title: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: ""))
    window.addItem(
      NSMenuItem(
        title: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)),
        keyEquivalent: ""))
    let windowItem = NSMenuItem(title: "Window", action: nil, keyEquivalent: "")
    windowItem.submenu = window
    main.addItem(windowItem)
    NSApp.mainMenu = main
    NSApp.windowsMenu = window
  }
  @objc private func showLauncher() { windows.launcher.show() }
  @objc private func showAI() { windows.show("ai-chat") }
  @objc private func showNotes() { windows.show("notes") }
  @objc private func showSettings() { windows.show("settings") }
  @objc private func quit() { NSApp.terminate(nil) }
  @objc private func about() { NSApp.orderFrontStandardAboutPanel(nil) }
}
