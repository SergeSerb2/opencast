import { describe, expect, it } from "vitest";
import { evaluateExpression } from "../../src/services/core/calculator";
const now = new Date("2026-10-13T12:00:00Z");
describe("calculator", () => {
  it.each([
    ["2 + 3 * 4", "14"],
    ["sqrt(81)", "9"],
    ["20% of 50", "10"],
    ["50 + 10%", "55"],
    ["50 - 10%", "45"],
    ["10%", "0.1"],
  ])("evaluates %s", (expression, value) =>
    expect(evaluateExpression(expression)?.copyValue).toBe(value),
  );
  it("converts units, rem, currencies and number bases", () => {
    expect(evaluateExpression("2 m in cm")).toMatchObject({
      result: "200 cm",
      kind: "unit",
    });
    expect(evaluateExpression("2 m in ft")?.resultLabel).toBe("Feet");
    expect(evaluateExpression("2 rem to px", { remToPxRate: 16 })?.result).toBe(
      "32 px",
    );
    expect(
      evaluateExpression("100 EUR in USD", { rates: { USD: 1, EUR: 0.8 } }),
    ).toMatchObject({ result: "125", resultLabel: "USD" });
    expect(evaluateExpression("255 in hex")?.result).toBe("0xff");
    expect(evaluateExpression("0xff in binary")?.result).toBe("0b11111111");
  });
  it("handles timezone conversion, dates and durations", () => {
    expect(evaluateExpression("time in tokyo", { now })).toMatchObject({
      result: "9:00 PM",
      kind: "timezone",
    });
    expect(evaluateExpression("5pm london in sf", { now })?.result).toBe(
      "9:00 AM PDT",
    );
    expect(evaluateExpression("days until dec 25", { now })?.kind).toBe("date");
    expect(evaluateExpression("monday in 3 weeks", { now })).toMatchObject({
      kind: "date",
      result: "Nov 2, 2026",
    });
    expect(evaluateExpression("2 hours + 30 minutes in minutes")?.result).toBe(
      "150 minutes",
    );
  });
  it("converts colors only when enabled", () => {
    expect(evaluateExpression("#ff0000")).toMatchObject({
      result: "rgb(255, 0, 0)",
      color: "#FF0000",
      kind: "color",
    });
    expect(evaluateExpression("rgb(255, 0, 0) to hsl")?.result).toBe(
      "hsl(0, 100%, 50%)",
    );
    expect(evaluateExpression("hsl(120, 100%, 50%) to hex")?.result).toBe(
      "#00FF00",
    );
    expect(evaluateExpression("#fff", { colorConversion: false })).toBeNull();
  });
  it.each([
    "ordinary query",
    "a=10",
    'import("fs")',
    "range(1, 100000000)",
    "2; 3",
    "1/0",
    "200!",
    'evaluate("1+1")',
  ])("rejects unsafe or invalid expression %s", (expression) =>
    expect(evaluateExpression(expression)).toBeNull(),
  );
});
