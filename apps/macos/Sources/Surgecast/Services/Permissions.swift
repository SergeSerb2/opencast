import AVFoundation
import AppKit
import ApplicationServices
import Contacts
import CoreLocation
import EventKit

@MainActor final class Permissions: NSObject, @preconcurrency CLLocationManagerDelegate {
  let hub: EventHub
  let eventStore = EKEventStore()
  private let location = CLLocationManager()
  private var locationRequest: CheckedContinuation<String, Never>?
  private var poll: Timer?
  private var last: [String: String] = [:]
  init(hub: EventHub) {
    self.hub = hub
    super.init()
    location.delegate = self
    last = status()
    poll = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
      Task { @MainActor in
        guard let self else { return }
        let current = self.status()
        for (kind, value) in current where self.last[kind] != value {
          self.hub.emit("permissions.changed", ["kind": kind, "status": value])
        }
        self.last = current
      }
    }
  }
  func stop() {
    poll?.invalidate()
    locationRequest?.resume(returning: "unknown")
    locationRequest = nil
  }
  static func requireAX() throws {
    guard AXIsProcessTrusted() else { throw RpcError.missing("accessibility") }
  }
  private func ek(_ type: EKEntityType) -> String {
    switch EKEventStore.authorizationStatus(for: type) {
    case .fullAccess: return "granted"
    case .writeOnly: return "denied"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
  }
  private func locationStatus() -> String {
    switch location.authorizationStatus {
    case .authorizedAlways: return "granted"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
  }
  func status() -> [String: String] {
    let contacts: String
    switch CNContactStore.authorizationStatus(for: .contacts) {
    case .authorized: contacts = "granted"
    case .denied: contacts = "denied"
    case .restricted: contacts = "restricted"
    case .notDetermined: contacts = "notDetermined"
    case .limited: contacts = "granted"
    @unknown default: contacts = "unknown"
    }
    let mic: String
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized: mic = "granted"
    case .denied: mic = "denied"
    case .restricted: mic = "restricted"
    case .notDetermined: mic = "notDetermined"
    @unknown default: mic = "unknown"
    }
    return [
      "accessibility": AXIsProcessTrusted() ? "granted" : "denied",
      "screenRecording": CGPreflightScreenCaptureAccess() ? "granted" : "denied",
      "inputMonitoring": CGPreflightListenEventAccess() ? "granted" : "denied",
      "calendar": ek(.event), "reminders": ek(.reminder), "contacts": contacts, "microphone": mic,
      "location": locationStatus(), "automation": "unknown", "fullDiskAccess": "unknown",
    ]
  }
  func request(_ kind: String) async throws -> String {
    guard status()[kind] != nil else { throw RpcError.invalid("Unknown permission") }
    switch kind {
    case "accessibility":
      _ = AXIsProcessTrustedWithOptions(
        [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
    case "screenRecording": _ = CGRequestScreenCaptureAccess()
    case "inputMonitoring": _ = CGRequestListenEventAccess()
    case "calendar": _ = try await eventStore.requestFullAccessToEvents()
    case "reminders": _ = try await eventStore.requestFullAccessToReminders()
    case "contacts": _ = try await CNContactStore().requestAccess(for: .contacts)
    case "microphone": _ = await AVCaptureDevice.requestAccess(for: .audio)
    case "location":
      if location.authorizationStatus == .notDetermined {
        return await withCheckedContinuation { c in
          locationRequest?.resume(returning: "notDetermined")
          locationRequest = c
          location.requestWhenInUseAuthorization()
        }
      }
    case "automation", "fullDiskAccess": try openSettings(kind)
    default: break
    }
    let value = status()[kind] ?? "unknown"
    hub.emit("permissions.changed", ["kind": kind, "status": value])
    return value
  }
  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard manager.authorizationStatus != .notDetermined else { return }
    locationRequest?.resume(returning: locationStatus())
    locationRequest = nil
  }
  func openSettings(_ kind: String) throws {
    let panes = [
      "accessibility": "Accessibility", "screenRecording": "ScreenCapture", "calendar": "Calendars",
      "reminders": "Reminders", "contacts": "Contacts", "fullDiskAccess": "AllFiles",
      "automation": "Automation", "inputMonitoring": "ListenEvent", "location": "LocationServices",
      "microphone": "Microphone",
    ]
    guard let pane = panes[kind],
      let url = URL(
        string: "x-apple.systempreferences:com.apple.preference.security?Privacy_\(pane)")
    else { throw RpcError.invalid("Unknown permission") }
    NSWorkspace.shared.open(url)
  }
}
