/**
 * Small natural-language date parser for Form.DatePicker's search field:
 * "today", "tomorrow at 10am", "in 3 days", "next friday", "2026-03-14 9:30".
 */

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseTime(text: string): { hours: number; minutes: number } | null {
  const match = text.match(/(?:^|\s)(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();
  if (!match[2] && !meridiem && !/\bat\s+\d/i.test(text)) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export interface ParsedDate {
  date: Date;
  /** True when the expression included a time of day. */
  hasTime: boolean;
}

export function parseDateExpression(input: string, now: Date = new Date()): ParsedDate | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  const time = parseTime(text);
  const datePart = time ? text.replace(/(?:^|\s)(?:at\s+)?\d{1,2}(?::\d{2})?\s*(am|pm)?$/i, "").trim() : text;
  let base: Date | null = null;

  if (!datePart || datePart === "today") base = startOfDay(now);
  else if (datePart === "tomorrow") base = startOfDay(new Date(now.getTime() + 86_400_000));
  else if (datePart === "yesterday") base = startOfDay(new Date(now.getTime() - 86_400_000));
  else if (datePart === "next week") base = startOfDay(new Date(now.getTime() + 7 * 86_400_000));
  else if (datePart === "next month") {
    base = startOfDay(now);
    base.setMonth(base.getMonth() + 1);
  } else {
    const relative = datePart.match(/^in\s+(\d+)\s+(day|days|week|weeks|month|months)$/);
    const weekday = datePart.match(/^(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
    const iso = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (relative) {
      const n = Number(relative[1]);
      base = startOfDay(now);
      if (relative[2].startsWith("day")) base.setDate(base.getDate() + n);
      else if (relative[2].startsWith("week")) base.setDate(base.getDate() + 7 * n);
      else base.setMonth(base.getMonth() + n);
    } else if (weekday) {
      const target = WEEKDAYS.indexOf(weekday[2]);
      base = startOfDay(now);
      let diff = (target - base.getDay() + 7) % 7;
      if (diff === 0 || weekday[1]) diff = diff === 0 ? 7 : diff;
      base.setDate(base.getDate() + diff);
    } else if (iso) {
      base = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      if (base.getMonth() !== Number(iso[2]) - 1) return null;
    }
  }
  if (!base) return null;
  if (time) base.setHours(time.hours, time.minutes, 0, 0);
  return { date: base, hasTime: Boolean(time) };
}

export function formatDateValue(date: Date, withTime: boolean): string {
  return date.toLocaleString(undefined, withTime ? { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" } : { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
