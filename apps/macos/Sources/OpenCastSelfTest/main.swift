import CoreGraphics
import Foundation
import OpenCastCore

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
  if !condition() {
    fputs("FAIL: \(message)\n", stderr)
    exit(1)
  }
}
let storageHome = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
let storageRoot = storageHome.appendingPathComponent("Library/Application Support")
let currentStorage = storageRoot.appendingPathComponent("OpenCast")
let legacyStorage = storageRoot.appendingPathComponent("Surgecast")
expect(AppStorage.directory(home: storageHome, parent: "Library/Application Support").path == currentStorage.path,
  "Fresh installs use OpenCast storage")
try FileManager.default.createDirectory(at: legacyStorage, withIntermediateDirectories: true)
expect(AppStorage.directory(home: storageHome, parent: "Library/Application Support").path == legacyStorage.path,
  "Existing data stays accessible without moving stored files")
try FileManager.default.createDirectory(at: currentStorage, withIntermediateDirectories: true)
expect(AppStorage.directory(home: storageHome, parent: "Library/Application Support").path == currentStorage.path,
  "Existing OpenCast storage takes priority")
try FileManager.default.removeItem(at: storageHome)
print("PASS: fresh and legacy application storage selection")
let primary = CGRect(x: 0, y: 0, width: 1440, height: 900)
let secondary = CGRect(x: -1920, y: 300, width: 1920, height: 1080)
for screen in [primary, secondary] {
  let left = Geometry.layout(Geometry.fraction("leftHalf")!, screen: screen)
  let right = Geometry.layout(Geometry.fraction("rightHalf")!, screen: screen)
  expect(abs(left.maxX - right.minX) < 0.001, "Halves join")
  expect(left.union(right) == screen, "Halves fill each display")
  let thirds = ["firstThird", "centerThird", "lastThird"].map {
    Geometry.layout(Geometry.fraction($0)!, screen: screen)
  }
  expect(abs(thirds.reduce(0) { $0 + $1.width } - screen.width) < 0.001, "Thirds fill width")
  for (index, r) in thirds.enumerated() {
    expect(
      abs(r.minX - (screen.minX + CGFloat(index) * screen.width / 3)) < 0.001,
      "Thirds have ordered positions")
  }
  let sixths = [
    "topLeftSixth", "topCenterSixth", "topRightSixth", "bottomLeftSixth", "bottomCenterSixth",
    "bottomRightSixth",
  ].map { Geometry.layout(Geometry.fraction($0)!, screen: screen) }
  expect(
    abs(sixths.reduce(0) { $0 + $1.width * $1.height } - screen.width * screen.height) < 0.001,
    "Sixths fill area")
  expect(
    sixths[0].minY == screen.midY && sixths[3].maxY == screen.midY,
    "Top/bottom use Cocoa coordinates")
  for r in sixths {
    let ax = Geometry.ax(r, desktopTop: 900)
    expect(Geometry.cocoa(ax, desktopTop: 900) == r, "AX transform round trip")
  }
  let spacedLeft = Geometry.layout(Geometry.fraction("leftHalf")!, screen: screen, innerGap: 10, outerGap: 20)
  let spacedRight = Geometry.layout(Geometry.fraction("rightHalf")!, screen: screen, innerGap: 10, outerGap: 20)
  expect(spacedLeft.minX == screen.minX + 20 && spacedRight.maxX == screen.maxX - 20, "Outer gaps apply only at display edges")
  expect(spacedRight.minX - spacedLeft.maxX == 10, "Adjacent halves share one inner gap")
  let gap = Geometry.layout(CGRect(x: 0, y: 0, width: 1, height: 1), screen: screen, gap: 8)
  expect(gap.width == screen.width - 16 && gap.minX == screen.minX + 8, "Gap applied inside")
}
let moved = Geometry.moved(
  CGRect(x: 360, y: 225, width: 720, height: 450), from: primary, to: secondary)
expect(
  moved == CGRect(x: -1440, y: 570, width: 960, height: 540),
  "Display movement preserves fractions with negative origin")
expect(
  Geometry.ax(secondary, desktopTop: 900).minY == -480, "Screen above primary has negative AX y")
for (key, code) in [
  ("space", 49), ("a", 0), ("1", 18), ("f5", 96), ("return", 36), ("arrowUp", 126), ("comma", 43),
  ("bracketLeft", 33), ("escape", 53),
] { expect(KeyMap.code(key) == UInt16(code), "Key code for \(key)") }
expect(KeyMap.code("not-a-key") == nil, "Invalid key rejected")
print(
  "PASS: geometry on two displays, halves/thirds/sixths, AX transforms, gaps, display movement, key mappings"
)
let home = URL(fileURLWithPath: "/Users/opencast-policy-check")
let keychains = home.appendingPathComponent("Library/Keychains")
expect(
  FileAccessPolicy.allows(
    home.appendingPathComponent("Documents/image.png"), roots: [home], forbidden: [keychains]),
  "Home asset allowed")
expect(
  !FileAccessPolicy.allows(
    keychains.appendingPathComponent("login.keychain-db"), roots: [home], forbidden: [keychains]),
  "Keychain denied")
expect(
  !FileAccessPolicy.allows(
    home.appendingPathComponent("library/KEYCHAINS/login.keychain-db"), roots: [home],
    forbidden: [keychains]), "Keychain case variant denied")
expect(
  !FileAccessPolicy.allows(
    URL(fileURLWithPath: home.path + "-other/secret"), roots: [home], forbidden: [keychains]),
  "Sibling prefix does not bypass root")
expect(
  !FileAccessPolicy.allows(
    home.appendingPathComponent("../outside/file"), roots: [home], forbidden: [keychains]),
  "Traversal outside root denied")
print("PASS: file allow-list boundaries, traversal, Keychain exclusion including case variants")
let clipboardTestDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at: clipboardTestDir, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: clipboardTestDir) }
let clipboardPNG = Data([1, 2, 3])
let clipboardFile = clipboardTestDir.appendingPathComponent("image.png")
for marker in ["org.nspasteboard.ConcealedType", "org.nspasteboard.TransientType", "org.nspasteboard.AutoGeneratedType"] {
  let content = try ClipboardImageStore.content(png: clipboardPNG, file: clipboardFile, width: 1, height: 1, types: [marker], persist: true)
  expect(content["path"] == nil && content["base64"] as? String == clipboardPNG.base64EncodedString(), "Private image reads use memory")
  expect(!FileManager.default.fileExists(atPath: clipboardFile.path), "Private clipboard images never reach disk")
}
let explicitImage = try ClipboardImageStore.content(png: clipboardPNG, file: clipboardFile, width: 1, height: 1, types: ["public.png"])
expect(explicitImage["base64"] as? String == clipboardPNG.base64EncodedString() && !FileManager.default.fileExists(atPath: clipboardFile.path), "Explicit clipboard reads are nonpersistent")
let publicImage = try ClipboardImageStore.content(png: clipboardPNG, file: clipboardFile, width: 1, height: 1, types: ["public.png"], persist: true)
expect(publicImage["path"] as? String == clipboardFile.path, "Public clipboard image has a persistent path")
let storedPNG = try Data(contentsOf: clipboardFile)
expect(storedPNG == clipboardPNG, "Public clipboard image is persisted")
print("PASS: clipboard privacy markers prevent persistence and explicit reads return image bytes")
func stubbornChild() throws -> Process {
  let child = Process()
  let ready = Pipe()
  child.executableURL = URL(fileURLWithPath: "/bin/sh")
  child.arguments = ["-c", "trap '' TERM; echo ready; while :; do :; done"]
  child.standardOutput = ready
  try child.run()
  _ = ready.fileHandleForReading.availableData
  return child
}
func pumpRunLoop(_ interval: TimeInterval) {
  let deadline = Date().addingTimeInterval(interval)
  while Date() < deadline { _ = RunLoop.main.run(mode: .default, before: deadline) }
}
let stalledChild = try stubbornChild()
ProcessRecovery.terminate(stalledChild, gracePeriod: 0.05, isCurrent: { true })
pumpRunLoop(0.2)
expect(!stalledChild.isRunning, "Recovery kills a child that ignores SIGTERM")
let staleChild = try stubbornChild()
var currentLaunch = true
ProcessRecovery.terminate(staleChild, gracePeriod: 0.05, isCurrent: { currentLaunch })
currentLaunch = false
pumpRunLoop(0.15)
expect(staleChild.isRunning, "A stale launch cannot escalate to SIGKILL")
kill(staleChild.processIdentifier, SIGKILL)
staleChild.waitUntilExit()
print("PASS: stalled-child recovery escalates and stale launch callbacks cannot kill")
var pasteSequence = PasteSequence(["A", "B", "C"])
expect(pasteSequence.request() == "A", "First paste consumes A")
expect(pasteSequence.request() == nil, "Rapid second paste waits for A to be read")
expect(pasteSequence.request() == nil, "Rapid third paste waits too")
expect(pasteSequence.complete() == "B", "Completing A starts B for the second press")
expect(pasteSequence.complete() == "C", "Completing B starts C for the third press")
expect(pasteSequence.complete() == nil && pasteSequence.isFinished, "Completing C drains the sequence")
print("PASS: rapid sequential paste requests consume ordered items")
