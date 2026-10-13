import AppKit
import CoreAudio
import UserNotifications

@MainActor enum SystemActions {
  static func appleScript(_ script: String, language: String = "AppleScript") async throws -> String
  {
    guard ["AppleScript", "JavaScript"].contains(language) else {
      throw RpcError.invalid("Unsupported scripting language")
    }
    return try await ProcessRunner.checked("/usr/bin/osascript", ["-l", language, "-e", script])
  }
  private static func device(_ input: Bool = false) throws -> AudioObjectID {
    var address = AudioObjectPropertyAddress(
      mSelector: input
        ? kAudioHardwarePropertyDefaultInputDevice : kAudioHardwarePropertyDefaultOutputDevice,
      mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var device = AudioObjectID(0)
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    guard
      AudioObjectGetPropertyData(
        AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device) == noErr,
      device != 0
    else { throw RpcError.failure("Audio device unavailable") }
    return device
  }
  private static func read<T: BitwiseCopyable>(
    _ device: AudioObjectID, selector: AudioObjectPropertySelector, input: Bool = false, initial: T
  ) throws -> T {
    var address = AudioObjectPropertyAddress(
      mSelector: selector,
      mScope: input ? kAudioDevicePropertyScopeInput : kAudioDevicePropertyScopeOutput,
      mElement: kAudioObjectPropertyElementMain)
    var value = initial
    var size = UInt32(MemoryLayout<T>.size)
    guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, &value) == noErr else {
      throw RpcError.unsupported("Audio device does not expose this control")
    }
    return value
  }
  private static func write<T: BitwiseCopyable>(
    _ device: AudioObjectID, selector: AudioObjectPropertySelector, input: Bool = false, value: T
  ) throws {
    var address = AudioObjectPropertyAddress(
      mSelector: selector,
      mScope: input ? kAudioDevicePropertyScopeInput : kAudioDevicePropertyScopeOutput,
      mElement: kAudioObjectPropertyElementMain)
    var value = value
    guard
      AudioObjectSetPropertyData(device, &address, 0, nil, UInt32(MemoryLayout<T>.size), &value)
        == noErr
    else { throw RpcError.unsupported("Audio device does not allow this control") }
  }
  static func volume() throws -> [String: Any] {
    let d = try device()
    let scalar: Float32 = try read(
      d, selector: kAudioDevicePropertyVolumeScalar, initial: Float32(0))
    let mute: UInt32 = try read(d, selector: kAudioDevicePropertyMute, initial: UInt32(0))
    return ["volume": Double(scalar) * 100, "muted": mute != 0]
  }
  private static func media(_ code: Int) throws {
    try Permissions.requireAX()
    for state in [0xA, 0xB] {
      guard
        let event = NSEvent.otherEvent(
          with: .systemDefined, location: .zero,
          modifierFlags: NSEvent.ModifierFlags(rawValue: UInt(state << 8)),
          timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: 0, context: nil,
          subtype: 8, data1: (code << 16) | (state << 8), data2: -1), let cg = event.cgEvent
      else { throw RpcError.failure("Cannot create media key event") }
      cg.post(tap: .cghidEventTap)
    }
  }
  static func notification(_ p: [String: Any]) async throws {
    let center = UNUserNotificationCenter.current()
    guard try await center.requestAuthorization(options: [.alert, .sound]) else {
      throw RpcError.failure("Notification permission denied")
    }
    let content = UNMutableNotificationContent()
    content.title = try p.string("title")
    content.body = p["body"] as? String ?? ""
    try await center.add(
      UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
  }
  static func run(_ p: [String: Any], previous: NSRunningApplication?) async throws {
    let action = try p.string("action")
    let front = NSWorkspace.shared.frontmostApplication
    let active =
      front?.processIdentifier == ProcessInfo.processInfo.processIdentifier ? previous : front
    switch action {
    case "openTrash":
      guard
        NSWorkspace.shared.open(
          FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".Trash"))
      else { throw RpcError.failure("Cannot open Trash") }
    case "emptyTrash": _ = try await appleScript("tell application \"Finder\" to empty trash")
    case "ejectAllDisks":
      _ = try await appleScript(
        "tell application \"Finder\" to eject every disk whose ejectable is true")
    case "lockScreen":
      let path = "/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession"
      if FileManager.default.isExecutableFile(atPath: path) {
        _ = try await ProcessRunner.checked(path, ["-suspend"])
      } else {
        guard
          let handle = dlopen("/System/Library/PrivateFrameworks/login.framework/login", RTLD_LAZY),
          let symbol = dlsym(handle, "SACLockScreenImmediate")
        else { throw RpcError.unsupported("Lock screen service unavailable on this macOS version") }
        defer { dlclose(handle) }
        unsafeBitCast(symbol, to: (@convention(c) () -> Void).self)()
      }
    case "logOut", "restart", "shutDown":
      let verb = action == "logOut" ? "log out" : action == "shutDown" ? "shut down" : "restart"
      _ = try await appleScript("tell application \"System Events\" to \(verb)")
    case "sleep", "sleepDisplays":
      _ = try await ProcessRunner.checked(
        "/usr/bin/pmset", [action == "sleep" ? "sleepnow" : "displaysleepnow"])
    case "hibernate":
      throw RpcError.unsupported(
        "macOS provides no safe immediate hibernate command; use sleep instead")
    case "hideAllAppsExceptFrontmost", "quitAllApplications", "quitAllApplicationsExceptFrontmost",
      "unhideAllHiddenApps":
      for app in NSWorkspace.shared.runningApplications
      where app.activationPolicy == .regular
        && app.processIdentifier != ProcessInfo.processInfo.processIdentifier
      {
        if action == "unhideAllHiddenApps" {
          app.unhide()
        } else if action == "hideAllAppsExceptFrontmost" {
          if app != active { app.hide() }
        } else if action == "quitAllApplications" || app != active {
          if !app.terminate() {
            throw RpcError.failure("Application refused to quit: \(app.localizedName ?? "unknown")")
          }
        }
      }
    case "quitActiveApplication":
      guard let active, active.terminate() else {
        throw RpcError.failure("Active application refused to quit")
      }
    case "setVolume", "turnVolumeUp", "turnVolumeDown", "toggleMute":
      let d = try device()
      if action == "toggleMute" {
        let mute: UInt32 = try read(d, selector: kAudioDevicePropertyMute, initial: UInt32(0))
        try write(d, selector: kAudioDevicePropertyMute, value: UInt32(mute == 0 ? 1 : 0))
      } else {
        let current: Float32 = try read(
          d, selector: kAudioDevicePropertyVolumeScalar, initial: Float32(0))
        let value: Double
        if action == "setVolume" {
          value = try p.number("value")
          guard (0...100).contains(value) else { throw RpcError.invalid("Volume must be 0...100") }
        } else {
          value = Double(current) * 100 + (action == "turnVolumeUp" ? 6.25 : -6.25)
        }
        try write(
          d, selector: kAudioDevicePropertyVolumeScalar,
          value: Float32(min(100, max(0, value)) / 100))
      }
    case "toggleMicrophoneMute":
      let d = try device(true)
      let mute: UInt32 = try read(
        d, selector: kAudioDevicePropertyMute, input: true, initial: UInt32(0))
      try write(
        d, selector: kAudioDevicePropertyMute, input: true, value: UInt32(mute == 0 ? 1 : 0))
    case "toggleMuteCurrentApp":
      throw RpcError.unsupported("macOS has no public per-application audio mute API")
    case "playPause": try media(16)
    case "nextTrack": try media(17)
    case "previousTrack": try media(18)
    case "showDesktop":
      try Permissions.requireAX()
      try Input.press(103)
    case "showScreenSaver":
      _ = try await NSWorkspace.shared.openApplication(
        at: URL(fileURLWithPath: "/System/Library/CoreServices/ScreenSaverEngine.app"),
        configuration: NSWorkspace.OpenConfiguration())
    case "toggleSystemAppearance":
      _ = try await appleScript(
        "tell application \"System Events\" to tell appearance preferences to set dark mode to not dark mode"
      )
    case "toggleHiddenFiles":
      let r = try await ProcessRunner.run(
        "/usr/bin/defaults", ["read", "com.apple.finder", "AppleShowAllFiles"])
      let enabled = ["1", "true", "YES"].contains(
        r.output.trimmingCharacters(in: .whitespacesAndNewlines))
      _ = try await ProcessRunner.checked(
        "/usr/bin/defaults",
        ["write", "com.apple.finder", "AppleShowAllFiles", "-bool", enabled ? "false" : "true"])
      _ = try await appleScript("tell application \"Finder\" to quit")
      _ = try await NSWorkspace.shared.openApplication(
        at: URL(fileURLWithPath: "/System/Library/CoreServices/Finder.app"),
        configuration: NSWorkspace.OpenConfiguration())
    case "toggleWifi":
      let ports = try await ProcessRunner.checked(
        "/usr/sbin/networksetup", ["-listallhardwareports"])
      let lines = ports.components(separatedBy: "\n")
      guard let i = lines.firstIndex(where: { $0.contains("Wi-Fi") || $0.contains("AirPort") }),
        i + 1 < lines.count
      else { throw RpcError.unsupported("No Wi-Fi interface") }
      let device = lines[i + 1].replacingOccurrences(of: "Device: ", with: "")
      let state = try await ProcessRunner.checked(
        "/usr/sbin/networksetup", ["-getairportpower", device])
      _ = try await ProcessRunner.checked(
        "/usr/sbin/networksetup",
        ["-setairportpower", device, state.hasSuffix("On") ? "off" : "on"])
    case "toggleEnergySaver":
      let output = try await ProcessRunner.checked("/usr/bin/pmset", ["-g"])
      let enabled = output.components(separatedBy: "\n").contains {
        $0.contains("lowpowermode") && $0.trimmingCharacters(in: .whitespaces).hasSuffix("1")
      }
      _ = try await ProcessRunner.checked(
        "/usr/bin/pmset", ["-a", "lowpowermode", enabled ? "0" : "1"])
    case "toggleBluetooth":
      throw RpcError.unsupported(
        "macOS does not expose a public Bluetooth power control API; change Bluetooth in Control Center"
      )
    case "toggleStageManager":
      throw RpcError.unsupported(
        "macOS does not expose a supported Stage Manager toggle API; change Stage Manager in Control Center"
      )
    case "dismissNotifications":
      try Permissions.requireAX()
      guard
        let app = NSRunningApplication.runningApplications(
          withBundleIdentifier: "com.apple.notificationcenterui"
        ).first
      else { return }
      let pid = app.processIdentifier
      try await Task.detached {
        var count = 0
        func walk(_ e: AXUIElement, _ depth: Int) throws {
          guard depth < 10 else { return }
          let label =
            AX.value(e, kAXDescriptionAttribute) as? String ?? AX.value(e, kAXTitleAttribute)
            as? String ?? ""
          if AX.value(e, kAXRoleAttribute) as? String == kAXButtonRole,
            ["Close", "Clear All", "Clear"].contains(label)
          {
            try AX.press(e)
            count += 1
          } else {
            for child in AX.children(e) { try walk(child, depth + 1) }
          }
        }
        try walk(AXUIElementCreateApplication(pid), 0)
        if count == 0 {
          throw RpcError.unsupported(
            "Notification Center exposes no dismiss buttons; open Notification Center and try again"
          )
        }
      }.value
    default: throw RpcError.invalid("Unknown system action: \(action)")
    }
  }
}
