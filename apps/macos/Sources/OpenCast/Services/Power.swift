import Foundation
import IOKit.pwr_mgt
import IOKit.ps

@MainActor final class Power {
  private var assertions: [String: IOPMAssertionID] = [:]
  static func onBattery() throws -> Bool {
    guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
      let source = IOPSGetProvidingPowerSourceType(info)?.takeUnretainedValue()
    else { throw RpcError.failure("Cannot determine the power source") }
    return source as String == kIOPSBatteryPowerValue
  }
  func set(_ p: [String: Any]) throws {
    let id = try p.string("id")
    if try p.boolean("prevented") {
      if assertions[id] != nil { return }
      var assertion: IOPMAssertionID = 0
      let result = IOPMAssertionCreateWithName(
        kIOPMAssertionTypePreventUserIdleSystemSleep as CFString,
        IOPMAssertionLevel(kIOPMAssertionLevelOn), "OpenCast AI response" as CFString, &assertion)
      guard result == kIOReturnSuccess else { throw RpcError.failure("Cannot prevent idle sleep") }
      assertions[id] = assertion
    } else if let assertion = assertions.removeValue(forKey: id) { IOPMAssertionRelease(assertion) }
  }
  func stop() {
    for assertion in assertions.values { IOPMAssertionRelease(assertion) }
    assertions.removeAll()
  }
}
