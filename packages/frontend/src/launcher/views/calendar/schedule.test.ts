import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@surgecast/protocol";
import {
  attendeeStatus,
  calendarAppUrl,
  conferenceProvider,
  dayTitle,
  durationLabel,
  eventDetailsText,
  eventKey,
  filterEvents,
  groupByDay,
  initialEventId,
  relativeTag,
  scheduleRange,
  timeLabel,
  whenLabel,
} from "./schedule";

// Tuesday, October 13, 2026, 10:20 local time.
const NOW = new Date(2026, 9, 13, 10, 20);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);

function event(id: string, start: Date, end: Date, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id, calendarId: "work", title: id, start: start.toISOString(), end: end.toISOString(), isAllDay: false, color: "#3B82F6", ...extra };
}
const allDay = (id: string, day: number, days = 1, extra: Partial<CalendarEvent> = {}) => event(id, at(day, 0), at(day + days, 0), { isAllDay: true, ...extra });

describe("scheduleRange", () => {
  it("starts at midnight today", () => {
    const { from, to } = scheduleRange(NOW, 7);
    expect(new Date(from)).toEqual(at(13, 0));
    expect(new Date(to)).toEqual(at(20, 0));
  });
});

describe("dayTitle", () => {
  it("names today, tomorrow and later days", () => {
    expect(dayTitle(at(13, 0), NOW, "en-US")).toEqual({ title: "Today", subtitle: "October 13" });
    expect(dayTitle(at(14, 0), NOW, "en-US")).toEqual({ title: "Tomorrow", subtitle: "October 14" });
    expect(dayTitle(at(16, 0), NOW, "en-US")).toEqual({ title: "Friday", subtitle: "October 16" });
    expect(dayTitle(new Date(2027, 0, 4), NOW, "en-US")).toEqual({ title: "Monday", subtitle: "January 4, 2027" });
  });
});

describe("groupByDay", () => {
  const events = [
    event("standup", at(13, 9), at(13, 9, 15)),
    event("review", at(13, 10), at(13, 10, 45)),
    allDay("birthday", 13),
    event("sync", at(14, 10), at(14, 10, 30)),
    event("overnight", at(12, 22), at(13, 11)),
    event("yesterday", at(12, 8), at(12, 9)),
    allDay("offsite", 15, 2),
  ];

  it("sections by start day, all-day events first", () => {
    const sections = groupByDay(events, NOW, "en-US");
    expect(sections.map((s) => [s.title, s.events.map((e) => e.id)])).toEqual([
      ["Today", ["birthday", "overnight", "standup", "review"]],
      ["Tomorrow", ["sync"]],
      ["Thursday", ["offsite"]],
    ]);
  });

  it("selects the running or next timed event first", () => {
    const sections = groupByDay(events, NOW, "en-US");
    expect(initialEventId(sections, NOW)).toBe(eventKey(events[4]));
    expect(initialEventId(groupByDay([events[0], events[3]], NOW), NOW)).toBe(eventKey(events[3]));
  });
});

describe("timeLabel / whenLabel / durationLabel", () => {
  it("labels timed, multi-day and all-day events", () => {
    expect(timeLabel(event("a", at(13, 10), at(13, 10, 45)), at(13, 0), "en-US")).toEqual({ start: "10:00 AM", end: "10:45 AM" });
    expect(timeLabel(event("b", at(13, 22), at(14, 6)), at(13, 0), "en-US")).toEqual({ start: "10:00 PM", end: "Wed 6:00 AM" });
    expect(timeLabel(event("c", at(12, 23), at(13, 1)), at(13, 0), "en-US")).toEqual({ start: "Mon 11:00 PM", end: "1:00 AM" });
    expect(timeLabel(allDay("d", 13), at(13, 0), "en-US")).toEqual({ start: "All day" });
    expect(timeLabel(allDay("e", 15, 2), at(15, 0), "en-US")).toEqual({ start: "All day", end: "until Fri, Oct 16" });
  });

  it("describes when an event happens", () => {
    expect(whenLabel(event("a", at(13, 10), at(13, 10, 45)), NOW, "en-US")).toBe("Today, Tuesday, October 13 · 10:00 AM – 10:45 AM");
    expect(whenLabel(allDay("d", 15, 2), NOW, "en-US")).toBe("Thursday, October 15 – Friday, October 16 · All day");
  });

  it("formats durations", () => {
    expect(durationLabel(event("a", at(13, 10), at(13, 10, 45)))).toBe("45 min");
    expect(durationLabel(event("b", at(13, 10), at(13, 11, 30)))).toBe("1 hr 30 min");
    expect(durationLabel(event("c", at(13, 10), at(13, 12)))).toBe("2 hr");
    expect(durationLabel(allDay("d", 15, 2))).toBe("2 days");
  });
});

describe("relativeTag", () => {
  it("tags running and imminent events", () => {
    expect(relativeTag(event("a", at(13, 10), at(13, 10, 45)), NOW)).toEqual({ text: "Now", tone: "now" });
    expect(relativeTag(event("b", at(13, 10, 30), at(13, 11)), NOW)).toEqual({ text: "in 10 min", tone: "soon" });
    expect(relativeTag(event("c", at(13, 11, 20), at(13, 12)), NOW)).toEqual({ text: "in 1 hr", tone: "soon" });
    expect(relativeTag(event("d", at(13, 12), at(13, 13)), NOW)).toBeNull();
    expect(relativeTag(event("e", at(13, 9), at(13, 10)), NOW)).toBeNull();
    expect(relativeTag(allDay("f", 13), NOW)).toBeNull();
  });
});

describe("conferenceProvider / attendeeStatus", () => {
  it("recognizes meeting services", () => {
    expect(conferenceProvider("https://us02web.zoom.us/j/123")).toBe("Zoom");
    expect(conferenceProvider("https://meet.google.com/abc-defg-hij")).toBe("Google Meet");
    expect(conferenceProvider("https://teams.microsoft.com/l/meetup-join/x")).toBe("Microsoft Teams");
    expect(conferenceProvider("https://example.com")).toBeUndefined();
    expect(conferenceProvider("not a url")).toBeUndefined();
  });

  it("normalizes EventKit statuses", () => {
    expect(attendeeStatus("accepted")).toBe("accepted");
    expect(attendeeStatus("EKParticipantStatus(rawValue: 3)")).toBe("declined");
    expect(attendeeStatus("4")).toBe("tentative");
    expect(attendeeStatus("pending")).toBe("pending");
    expect(attendeeStatus(undefined)).toBe("unknown");
  });
});

describe("filterEvents / text helpers", () => {
  const events = [event("Design Review", at(13, 10), at(13, 11), { location: "Zoom" }), event("Lunch", at(13, 12), at(13, 13), { calendarId: "personal", location: "Tartine" })];

  it("filters by words in title or location and by calendar", () => {
    expect(filterEvents(events, "review", null).map((e) => e.id)).toEqual(["Design Review"]);
    expect(filterEvents(events, "tartine lunch", null).map((e) => e.id)).toEqual(["Lunch"]);
    expect(filterEvents(events, "", "personal").map((e) => e.id)).toEqual(["Lunch"]);
  });

  it("builds clipboard text and Calendar URLs", () => {
    const text = eventDetailsText({ ...events[0], conferenceUrl: "https://zoom.us/j/1", attendees: [{ name: "Priya" }, { email: "jo@x.com" }], notes: "Agenda" }, NOW, "Work", "en-US");
    expect(text).toBe("Design Review\nToday, Tuesday, October 13 · 10:00 AM – 11:00 AM\nCalendar: Work\nLocation: Zoom\nJoin: https://zoom.us/j/1\nAttendees: Priya, jo@x.com\n\nAgenda");
    expect(calendarAppUrl({ ...events[0], id: "A1:B2" })).toBe("ical://ekevent/A1%3AB2?method=show&options=more");
  });
});
