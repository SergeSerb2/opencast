import AppKit
import EventKit

@MainActor final class CalendarService {
  private func require() throws {
    guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
      throw RpcError.missing("calendar")
    }
  }
  nonisolated private static func color(_ cg: CGColor?) -> String {
    guard let cg, let c = NSColor(cgColor: cg)?.usingColorSpace(.deviceRGB) else {
      return "#808080"
    }
    return String(
      format: "#%02x%02x%02x", Int(c.redComponent * 255), Int(c.greenComponent * 255),
      Int(c.blueComponent * 255))
  }
  func call(_ method: String, _ p: [String: Any]) async throws -> Any {
    try require()
    return try await Task.detached {
      // Keep EventKit objects within this operation's thread; only JSON values
      // cross back to the main actor. Permission requests use their own store.
      let store = EKEventStore()
      if method == "calendar.calendars" {
        return store.calendars(for: .event).map {
          [
            "id": $0.calendarIdentifier, "title": $0.title, "color": Self.color($0.cgColor),
            "source": $0.source.title, "allowsModifications": $0.allowsContentModifications,
          ] as [String: Any]
        } as Any
      }
      func date(_ string: String) -> Date? {
        let f = ISO8601DateFormatter()
        if let date = f.date(from: string) { return date }
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: string)
      }
      guard let from = date(try p.string("from")), let to = date(try p.string("to")), to > from,
        to.timeIntervalSince(from) <= 366 * 86400
      else { throw RpcError.invalid("Expected ISO dates covering at most one year") }
      let ids = p["calendarIds"] as? [String]
      let calendars = ids.map { wanted in
        store.calendars(for: .event).filter { wanted.contains($0.calendarIdentifier) }
      }
      let f = ISO8601DateFormatter()
      return store.events(
        matching: store.predicateForEvents(withStart: from, end: to, calendars: calendars)
      ).map { event -> [String: Any] in
        var o: [String: Any] = [
          "id": event.eventIdentifier ?? "", "calendarId": event.calendar.calendarIdentifier,
          "calendarTitle": event.calendar.title,
          "title": event.title ?? "", "start": f.string(from: event.startDate),
          "end": f.string(from: event.endDate), "isAllDay": event.isAllDay,
          "color": Self.color(event.calendar.cgColor),
        ]
        o["location"] = event.location
        o["notes"] = event.notes
        o["url"] = event.url?.absoluteString
        let fields = [event.url?.absoluteString, event.location, event.notes].compactMap { $0 }
          .joined(separator: " ")
        if let detector = try? NSDataDetector(
          types: NSTextCheckingResult.CheckingType.link.rawValue)
        {
          o["conferenceUrl"] =
            detector.matches(in: fields, range: NSRange(fields.startIndex..., in: fields))
            .compactMap(\.url).first { url in
              let host = url.host?.lowercased() ?? ""
              return [
                "zoom.us", "meet.google.com", "teams.microsoft.com", "teams.live.com", "webex.com",
              ].contains { host == $0 || host.hasSuffix("." + $0) }
            }?.absoluteString
        }
        o["attendees"] = event.attendees?.map { attendee -> [String: Any] in
          var a: [String: Any] = [
            "email": attendee.url.absoluteString.replacingOccurrences(of: "mailto:", with: ""),
            "status": String(describing: attendee.participantStatus),
          ]
          a["name"] = attendee.name
          return a
        }
        return o
      } as Any
    }.value
  }
}
