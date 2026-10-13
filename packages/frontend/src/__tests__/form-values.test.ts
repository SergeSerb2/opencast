import { describe, expect, it } from "vitest";
import { deserializeValue, serializeFormValues } from "../components/Form/serialize";
import { parseDateExpression } from "../lib/date-expression";

describe("form value serialization", () => {
  it("encodes dates and drops undefined", () => {
    const date = new Date("2026-03-14T09:30:00.000Z");
    expect(serializeFormValues({ title: "Bug", due: date, empty: undefined, tags: ["a"], done: false, none: null })).toEqual({
      title: "Bug",
      due: { $date: "2026-03-14T09:30:00.000Z" },
      tags: ["a"],
      done: false,
      none: null,
    });
  });

  it("round-trips $date values", () => {
    const value = deserializeValue({ $date: "2026-03-14T09:30:00.000Z" });
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).toISOString()).toBe("2026-03-14T09:30:00.000Z");
    expect(deserializeValue("text")).toBe("text");
  });
});

describe("date expressions", () => {
  const now = new Date(2026, 9, 13, 15, 0); // Tue Oct 13 2026
  it("understands relative words, weekdays, ISO dates and times", () => {
    expect(parseDateExpression("today", now)?.date.getDate()).toBe(13);
    expect(parseDateExpression("tomorrow at 10am", now)).toMatchObject({ hasTime: true });
    expect(parseDateExpression("tomorrow at 10am", now)?.date.getHours()).toBe(10);
    expect(parseDateExpression("in 3 days", now)?.date.getDate()).toBe(16);
    expect(parseDateExpression("friday", now)?.date.getDay()).toBe(5);
    expect(parseDateExpression("2026-02-30", now)).toBeNull();
    expect(parseDateExpression("2026-12-24 9:30", now)?.date.getMinutes()).toBe(30);
    expect(parseDateExpression("banana", now)).toBeNull();
  });
});
