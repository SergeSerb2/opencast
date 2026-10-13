import AppKit
import OpenCastCore

@MainActor final class WindowManager {
  var respectStageManager = true
  var cycling = "halves-thirds"
  private var cycleCommand = ""
  private var cycleIndex = 0
  private var cycleFrame: CGRect?
  private var history: [(AXUIElement, CGRect)] = []
  var previous: (() -> NSRunningApplication?)?
  static func rectObject(_ rect: CGRect) -> [String: Double] {
    ["x": rect.minX, "y": rect.minY, "width": rect.width, "height": rect.height]
  }
  func screens() -> [[String: Any]] {
    NSScreen.screens.enumerated().map { index, screen in
      [
        "id": (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?
          .intValue ?? index, "name": screen.localizedName, "frame": Self.rectObject(screen.frame),
        "visibleFrame": Self.rectObject(screen.visibleFrame), "scale": screen.backingScaleFactor,
        "isMain": screen === NSScreen.main,
      ]
    }
  }
  private func target() throws -> NSRunningApplication {
    let current = NSWorkspace.shared.frontmostApplication
    guard
      let app = current?.processIdentifier == ProcessInfo.processInfo.processIdentifier
        ? previous?() : current
    else { throw RpcError(code: -32004, message: "No target application") }
    return app
  }
  func call(_ method: String, _ p: [String: Any]) async throws -> Any {
    if method == "windows.screens" { return screens() }
    try Permissions.requireAX()
    let app = try target()
    let pid = app.processIdentifier
    let displays = NSScreen.screens.map(\.visibleFrame)
    let desktopTop = NSScreen.screens.first?.frame.maxY ?? 0
    guard !displays.isEmpty else { throw RpcError.failure("No displays") }
    let window: AXUIElement
    do { window = try await Task.detached { try AX.focused(pid) }.value } catch let error
      as RpcError where method == "windows.focused" && error.code == -32004
    {
      return NSNull()
    }
    if method == "windows.undo" || (method == "windows.run" && p["command"] as? String == "restore")
    {
      guard let index = history.lastIndex(where: { CFEqual($0.0, window) }) else {
        throw RpcError(code: -32004, message: "No saved frame for this window")
      }
      let rect = history[index].1
      try await Task.detached { try AX.setRect(window, rect) }.value
      history.remove(at: index)
      return NSNull()
    }
    let old = try await Task.detached { try AX.rect(window) }.value
    let current = Geometry.cocoa(old, desktopTop: desktopTop)
    let screenIndex =
      displays.indices.max { a, b in
        let ra = displays[a].intersection(current)
        let rb = displays[b].intersection(current)
        return (ra.isNull ? 0 : ra.width * ra.height) < (rb.isNull ? 0 : rb.width * rb.height)
      } ?? 0
    let outerGap = p["outerGap"] as? Double ?? 0
    guard outerGap.isFinite && outerGap >= 0 && outerGap <= 100 else { throw RpcError.invalid("Outer gap must be 0...100") }
    var layoutScreen = displays[screenIndex]
    if respectStageManager && UserDefaults(suiteName: "com.apple.WindowManager")?.bool(forKey: "GloballyEnabled") == true {
      // Leave the Stage Manager recent-app strip visible rather than covering it.
      if UserDefaults(suiteName: "com.apple.dock")?.string(forKey: "orientation") != "left" { layoutScreen.origin.x += 72 }
      layoutScreen.size.width -= 72
    }
    let screen = layoutScreen.insetBy(dx: outerGap, dy: outerGap)
    if method == "windows.focused" {
      var appInfo: [String: Any] = [
        "name": app.localizedName ?? "", "path": app.bundleURL?.path ?? "",
      ]
      appInfo["bundleId"] = app.bundleIdentifier
      let title = await Task.detached { AX.value(window, kAXTitleAttribute) as? String ?? "" }.value
      return ["app": appInfo, "title": title, "frame": Self.rectObject(old)]
    }
    let gap = p["gap"] as? Double ?? 0
    guard gap.isFinite && gap >= 0 && gap <= 100 else {
      throw RpcError.invalid("Gap must be 0...100")
    }
    var frame = current
    if method == "windows.applyLayout" {
      guard let r = p["rect"] as? [String: Any] else { throw RpcError.invalid("Missing rect") }
      let x = try r.number("x")
      let y = try r.number("y")
      let width = try r.number("width")
      let height = try r.number("height")
      guard
        x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1.00001 && y + height <= 1.00001
      else { throw RpcError.invalid("Layout must fit within 0...1") }
      frame = Geometry.layout(
        CGRect(x: x, y: y, width: width, height: height), screen: layoutScreen, innerGap: gap, outerGap: outerGap)
    } else if method == "windows.run" {
      let requested = try p.string("command")
      let cycles = ["leftHalf": ["leftHalf", "firstTwoThird", "firstThird", "firstFourth"], "rightHalf": ["rightHalf", "lastTwoThird", "lastThird", "lastFourth"], "topHalf": ["topHalf", "topTwoThird", "topThird", "topFirstFourth"], "bottomHalf": ["bottomHalf", "bottomTwoThird", "bottomThird", "topLastFourth"]]
      var command = requested
      if cycling != "off", let choices = cycles[requested] {
        let count = cycling == "halves-thirds-quarters" ? 4 : 3
        cycleIndex = cycleCommand == requested && cycleFrame == current ? (cycleIndex + 1) % count : 0
        command = choices[cycleIndex]
      } else { cycleIndex = 0 }
      cycleCommand = requested
      if let fraction = Geometry.fraction(command) {
        frame = Geometry.layout(fraction, screen: layoutScreen, innerGap: gap, outerGap: outerGap)
      } else {
        switch command {
        case "toggleAlwaysOnTop": throw RpcError.unsupported("Not supported on macOS")
        case "movePreviousDesktop", "moveNextDesktop":
          throw RpcError.unsupported(
            "Moving another application's window between Spaces is not reliably supported by macOS Accessibility. Drag its title bar while switching Spaces manually."
          )
        case "switchToPreviousSpace", "switchToNextSpace":
          try Input.press(command == "switchToPreviousSpace" ? 123 : 124, flags: .maskControl)
          return NSNull()
        case "minimize":
          try await Task.detached { try AX.set(window, kAXMinimizedAttribute, kCFBooleanTrue) }
            .value
          return NSNull()
        case "minimizeOnDisplay":
          try await Task.detached {
            let windows =
              AX.value(AXUIElementCreateApplication(pid), kAXWindowsAttribute) as? [AXUIElement]
              ?? []
            for item in windows {
              if let r = try? AX.rect(item),
                Geometry.cocoa(r, desktopTop: desktopTop).intersects(screen)
              {
                try AX.set(item, kAXMinimizedAttribute, kCFBooleanTrue)
              }
            }
          }.value
          return NSNull()
        case "toggleFullscreen":
          try await Task.detached {
            let value = AX.value(window, "AXFullScreen") as? Bool ?? false
            try AX.set(window, "AXFullScreen", value ? kCFBooleanFalse : kCFBooleanTrue)
          }.value
          return NSNull()
        case "focusNextAppWindow", "focusPreviousAppWindow":
          try await Task.detached {
            let windows =
              AX.value(AXUIElementCreateApplication(pid), kAXWindowsAttribute) as? [AXUIElement]
              ?? []
            guard !windows.isEmpty else {
              throw RpcError(code: -32004, message: "No application windows")
            }
            let index = windows.firstIndex(where: { CFEqual($0, window) }) ?? 0
            let delta = command == "focusNextAppWindow" ? 1 : -1
            let next = windows[(index + delta + windows.count) % windows.count]
            try AX.press(next, kAXRaiseAction)
            try AX.set(next, kAXMainAttribute, kCFBooleanTrue)
          }.value
          app.activate()
          return NSNull()
        case "maximizeHeight":
          frame.origin.y = screen.minY + gap
          frame.size.height = screen.height - gap * 2
        case "maximizeWidth":
          frame.origin.x = screen.minX + gap
          frame.size.width = screen.width - gap * 2
        case "reasonableSize":
          frame.size = CGSize(
            width: min(screen.width * 0.6, 1024), height: min(screen.height * 0.6, 900))
          frame.origin = CGPoint(
            x: screen.midX - frame.width / 2, y: screen.midY - frame.height / 2)
        case "center":
          frame.origin = CGPoint(
            x: screen.midX - frame.width / 2, y: screen.midY - frame.height / 2)
        case "moveLeft": frame.origin.x = screen.minX + gap
        case "moveRight": frame.origin.x = screen.maxX - frame.width - gap
        case "moveTop": frame.origin.y = screen.maxY - frame.height - gap
        case "moveBottom": frame.origin.y = screen.minY + gap
        case "makeSmaller", "makeLarger":
          let delta: CGFloat = command == "makeLarger" ? 0.1 : -0.1
          let width = min(
            screen.width, max(screen.width * 0.25, frame.width + screen.width * delta))
          let height = min(
            screen.height, max(screen.height * 0.25, frame.height + screen.height * delta))
          frame = CGRect(
            x: frame.midX - width / 2, y: frame.midY - height / 2, width: width, height: height)
        case "movePreviousDisplay", "moveNextDisplay":
          guard displays.count > 1 else {
            throw RpcError(code: -32004, message: "No other display")
          }
          let delta = command == "moveNextDisplay" ? 1 : -1
          frame = Geometry.moved(
            frame, from: screen,
            to: displays[(screenIndex + delta + displays.count) % displays.count])
        default: throw RpcError.invalid("Unknown window command: \(command)")
        }
      }
    } else {
      throw RpcError.unsupported("Unknown windows method")
    }
    guard frame.width >= 50 && frame.height >= 50 else {
      throw RpcError.invalid("Gap leaves too little window area")
    }
    let axFrame = Geometry.ax(frame, desktopTop: desktopTop)
    try await Task.detached { try AX.setRect(window, axFrame) }.value
    cycleFrame = frame
    history.append((window, old))
    if history.count > 100 { history.removeFirst() }
    return NSNull()
  }
}
