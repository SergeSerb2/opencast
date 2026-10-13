import AppKit
import ApplicationServices

enum AX {
  static func value(_ element: AXUIElement, _ key: String) -> CFTypeRef? {
    var result: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, key as CFString, &result) == .success
      ? result : nil
  }
  static func element(_ object: CFTypeRef?) -> AXUIElement? {
    guard let object, CFGetTypeID(object) == AXUIElementGetTypeID() else { return nil }
    return (object as! AXUIElement)
  }
  static func children(_ element: AXUIElement) -> [AXUIElement] {
    value(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
  }
  static func focused(_ pid: pid_t) throws -> AXUIElement {
    guard let w = element(value(AXUIElementCreateApplication(pid), kAXFocusedWindowAttribute))
    else { throw RpcError(code: -32004, message: "No focused window") }
    return w
  }
  static func rect(_ element: AXUIElement) throws -> CGRect {
    guard let pos = value(element, kAXPositionAttribute),
      let size = value(element, kAXSizeAttribute), CFGetTypeID(pos) == AXValueGetTypeID(),
      CFGetTypeID(size) == AXValueGetTypeID()
    else { throw RpcError.failure("Window geometry unavailable") }
    var p = CGPoint.zero
    var s = CGSize.zero
    guard AXValueGetValue(pos as! AXValue, .cgPoint, &p),
      AXValueGetValue(size as! AXValue, .cgSize, &s)
    else { throw RpcError.failure("Cannot decode window geometry") }
    return CGRect(origin: p, size: s)
  }
  static func setRect(_ element: AXUIElement, _ rect: CGRect) throws {
    var p = rect.origin
    var s = rect.size
    guard let position = AXValueCreate(.cgPoint, &p), let size = AXValueCreate(.cgSize, &s) else {
      throw RpcError.failure("Invalid window geometry")
    }
    try set(element, kAXSizeAttribute, size)
    try set(element, kAXPositionAttribute, position)
    try set(element, kAXSizeAttribute, size)
  }
  static func set(_ element: AXUIElement, _ key: String, _ value: CFTypeRef) throws {
    let status = AXUIElementSetAttributeValue(element, key as CFString, value)
    guard status == .success else {
      throw RpcError.failure("Accessibility operation rejected: \(key) (\(status.rawValue))")
    }
  }
  static func press(_ element: AXUIElement, _ action: String = kAXPressAction) throws {
    let status = AXUIElementPerformAction(element, action as CFString)
    guard status == .success else {
      throw RpcError.failure("Accessibility action failed (\(status.rawValue))")
    }
  }
}
