import type { CalendarEvent } from "@opencast/protocol";

/**
 * Pure date logic for "My Schedule": day sections, time labels, relative
 * tags and clipboard text. `locale` is injectable for tests; the views pass
 * the system locale (undefined).
 */

const MINUTE = 60_000;
const DAY = 86_400_000;

export function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Whole calendar days from `a` to `b` (DST-safe). */
function dayDifference(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

const start = (event: CalendarEvent) => new Date(event.start);

/** Row id: occurrences of a recurring event share `id`, so include the start. */
export function eventKey(event: CalendarEvent): string {
  return `${event.id}@${event.start}`;
}
const end = (event: CalendarEvent) => new Date(event.end);

/** ISO range covering `days` whole days from the start of today. */
export function scheduleRange(now: Date, days: number): { from: string; to: string } {
  const from = startOfDay(now);
  return { from: from.toISOString(), to: addDays(from, days).toISOString() };
}

export function isOngoing(event: CalendarEvent, now: Date): boolean {
  return !event.isAllDay && start(event) <= now && now < end(event);
}

export function hasEnded(event: CalendarEvent, now: Date): boolean {
  return end(event) <= now;
}

export interface DaySection {
  /** yyyy-mm-dd of the day. */
  id: string;
  /** Midnight of the day. */
  day: Date;
  title: string;
  subtitle: string;
  events: CalendarEvent[];
}

function dayId(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Today" / "Tomorrow" / weekday, with the date as subtitle. */
export function dayTitle(day: Date, now: Date, locale?: string): { title: string; subtitle: string } {
  const offset = dayDifference(now, day);
  const date = day.toLocaleDateString(locale, { month: "long", day: "numeric", ...(day.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
  if (offset === 0) return { title: "Today", subtitle: date };
  if (offset === 1) return { title: "Tomorrow", subtitle: date };
  return { title: day.toLocaleDateString(locale, { weekday: "long" }), subtitle: date };
}

/**
 * Events grouped by the day they start; events that began before today and
 * are still running go under Today. All-day events lead each day.
 */
export function groupByDay(events: CalendarEvent[], now: Date, locale?: string): DaySection[] {
  const today = startOfDay(now);
  const sections = new Map<string, { day: Date; events: CalendarEvent[] }>();
  for (const event of events) {
    const day = start(event) < today ? today : startOfDay(start(event));
    if (end(event) <= today) continue;
    const id = dayId(day);
    const section = sections.get(id) ?? { day, events: [] };
    section.events.push(event);
    sections.set(id, section);
  }
  return [...sections.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, { day, events: list }]) => ({
      id,
      day,
      ...dayTitle(day, now, locale),
      events: [...list].sort((a, b) => Number(b.isAllDay) - Number(a.isAllDay) || start(a).getTime() - start(b).getTime() || a.title.localeCompare(b.title)),
    }));
}

export function formatTime(date: Date, locale?: string): string {
  return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/**
 * Row time column for an event listed under `day`: "All day", or start and
 * end times; a time on another day gains its weekday ("Mon 11:45 PM").
 */
export function timeLabel(event: CalendarEvent, day: Date, locale?: string): { start: string; end?: string } {
  const s = start(event);
  const e = end(event);
  if (event.isAllDay) {
    if (dayDifference(s, e) <= 1) return { start: "All day" };
    const last = addDays(e, -1);
    return { start: "All day", end: `until ${last.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })}` };
  }
  const label = (date: Date) => (sameDay(date, day) ? formatTime(date, locale) : `${date.toLocaleDateString(locale, { weekday: "short" })} ${formatTime(date, locale)}`);
  return { start: label(s), end: label(e) };
}

/** "Now" for running events, "in 10 min" for those starting within the hour. */
export function relativeTag(event: CalendarEvent, now: Date): { text: string; tone: "now" | "soon" } | null {
  if (event.isAllDay) return null;
  if (isOngoing(event, now)) return { text: "Now", tone: "now" };
  const minutes = Math.ceil((start(event).getTime() - now.getTime()) / MINUTE);
  if (minutes > 0 && minutes <= 60) return { text: minutes === 60 ? "in 1 hr" : `in ${minutes} min`, tone: "soon" };
  return null;
}

/** Long description for details and the clipboard: "Tuesday, October 13 · 10:00 – 10:45 AM". */
export function whenLabel(event: CalendarEvent, now: Date, locale?: string): string {
  const s = start(event);
  const e = end(event);
  const dayText = (date: Date) => {
    const offset = dayDifference(now, date);
    const full = date.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
    return offset === 0 ? `Today, ${full}` : offset === 1 ? `Tomorrow, ${full}` : full;
  };
  if (event.isAllDay) {
    const last = addDays(e, -1);
    return dayDifference(s, e) <= 1 ? `${dayText(s)} · All day` : `${dayText(s)} – ${dayText(last)} · All day`;
  }
  if (sameDay(s, e)) return `${dayText(s)} · ${formatTime(s, locale)} – ${formatTime(e, locale)}`;
  return `${dayText(s)}, ${formatTime(s, locale)} – ${dayText(e)}, ${formatTime(e, locale)}`;
}

/** Event length, e.g. "45 min", "1 hr 30 min", "2 days". */
export function durationLabel(event: CalendarEvent): string {
  if (event.isAllDay) {
    const days = Math.max(1, dayDifference(start(event), end(event)));
    return days === 1 ? "All day" : `${days} days`;
  }
  const minutes = Math.round((end(event).getTime() - start(event).getTime()) / MINUTE);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

const PROVIDERS: [RegExp, string][] = [
  [/(^|\.)zoom\.us$/, "Zoom"],
  [/^meet\.google\.com$/, "Google Meet"],
  [/^teams\.(microsoft|live)\.com$/, "Microsoft Teams"],
  [/(^|\.)webex\.com$/, "Webex"],
];

/** Meeting service of a conference link ("Zoom", "Google Meet"…). */
export function conferenceProvider(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PROVIDERS.find(([pattern]) => pattern.test(host))?.[1];
  } catch {
    return undefined;
  }
}

export type AttendeeStatus = "accepted" | "declined" | "tentative" | "pending" | "unknown";

const STATUS_BY_RAW_VALUE: AttendeeStatus[] = ["unknown", "pending", "accepted", "declined", "tentative"];

/**
 * Normalize a participant status. The host may send EventKit names
 * ("accepted"), descriptions ("EKParticipantStatus(rawValue: 2)") or raw values.
 */
export function attendeeStatus(raw: string | undefined): AttendeeStatus {
  const text = (raw ?? "").toLowerCase();
  const number = /(\d+)\)?\s*$/.exec(text);
  if (number) return STATUS_BY_RAW_VALUE[Number(number[1])] ?? "unknown";
  if (text.includes("accept")) return "accepted";
  if (text.includes("declin")) return "declined";
  if (text.includes("tentative") || text.includes("maybe")) return "tentative";
  if (text.includes("pending") || text.includes("needs")) return "pending";
  return "unknown";
}

export const STATUS_LABEL: Record<AttendeeStatus, string> = { accepted: "Accepted", declined: "Declined", tentative: "Maybe", pending: "Awaiting Response", unknown: "Unknown" };

/** Case-insensitive filter on title and location (every word must match), then by calendar. */
export function filterEvents(events: CalendarEvent[], query: string, calendarId: string | null): CalendarEvent[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return events.filter((event) => {
    if (calendarId && event.calendarId !== calendarId) return false;
    const haystack = `${event.title} ${event.location ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Opens the event in Calendar.app. */
export function calendarAppUrl(event: CalendarEvent): string {
  return `ical://ekevent/${encodeURIComponent(event.id)}?method=show&options=more`;
}

/** Plain-text summary for "Copy Event Details". */
export function eventDetailsText(event: CalendarEvent, now: Date, calendarTitle?: string, locale?: string): string {
  const lines = [event.title || "Untitled Event", whenLabel(event, now, locale)];
  if (calendarTitle) lines.push(`Calendar: ${calendarTitle}`);
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.conferenceUrl) lines.push(`Join: ${event.conferenceUrl}`);
  const attendees = (event.attendees ?? []).map((a) => a.name || a.email).filter(Boolean);
  if (attendees.length) lines.push(`Attendees: ${attendees.join(", ")}`);
  if (event.notes?.trim()) lines.push("", event.notes.trim());
  return lines.join("\n");
}

/** Id of the event to select first: the running or next event, else the first one. */
export function initialEventId(sections: DaySection[], now: Date): string | undefined {
  const all = sections.flatMap((s) => s.events);
  const event = all.find((e) => !e.isAllDay && !hasEnded(e, now)) ?? all.find((e) => !hasEnded(e, now)) ?? all[0];
  return event && eventKey(event);
}
