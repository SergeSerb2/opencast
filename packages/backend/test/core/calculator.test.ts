import { describe, expect, it } from "vitest";
import { evaluateExpression } from "../../src/services/core/calculator";
const now = new Date("2026-10-13T12:00:00Z");
describe("calculator", () => {
  it("evaluates the whole amount before currency conversion and formats both sides", () => {
    expect(
      evaluateExpression("2+2*10 usd in eur", {
        rates: { USD: 1, EUR: 0.8936 },
      }),
    ).toMatchObject({
      result: "€19.66",
      copyValue: "19.66",
      resultLabel: "Euro",
      inputLabel: "Expression",
      interpreted: "2 + 2 × 10 usd in eur",
      kind: "currency",
    });
    expect(
      evaluateExpression("100 usd in eur", { rates: { USD: 1, EUR: 0.8 } }),
    ).toMatchObject({
      result: "€80.00",
      copyValue: "80.00",
      inputLabel: "US Dollar",
      resultLabel: "Euro",
    });
    expect(evaluateExpression("1234.5 usd")).toMatchObject({
      result: "$1,234.50",
      copyValue: "1234.50",
      inputLabel: "US Dollar",
      resultLabel: "US Dollar",
    });
  });
  it("evaluates mixed unit expressions with readable names and bounded precision", () => {
    expect(evaluateExpression("3*4 km in mi")).toMatchObject({
      result: "7.45645 Miles",
      inputLabel: "Expression",
      resultLabel: "Miles",
      interpreted: "3 × 4 km in mi",
    });
    expect(evaluateExpression("5 km in mi")).toMatchObject({
      result: "3.10686 Miles",
      inputLabel: "Kilometers",
    });
    expect(evaluateExpression("1 km in km")?.result).toBe("1 Kilometer");
    expect(evaluateExpression("2+2*10")?.inputLabel).toBe("Expression");
    expect(evaluateExpression("2+2 km in mi")?.result).toBe("2.48548 Miles");
    expect(evaluateExpression("2 cup")).toMatchObject({
      result: "2 Cups",
      inputLabel: "Cups",
      kind: "unit",
    });
    expect(evaluateExpression("2 CUP")?.kind).toBe("currency");
    expect(evaluateExpression("1 m^2 in cm^2")).toMatchObject({
      result: "10000 Square Centimeters",
      inputLabel: "Square Meters",
    });
    expect(evaluateExpression("3*4 km/h in m/s")).toMatchObject({
      result: "3.33333 Meters per Second",
      inputLabel: "Expression",
    });
  });
  it.each([
    "clip",
    "1password",
    "2fa",
    "v8",
    "1",
    "1234.5",
    "-42",
    "1e3",
    "0xff",
  ])("does not interpret launcher query %s", (query) => {
    expect(evaluateExpression(query)).toBeNull();
  });
  it("normalizes percentages and gives durations, dates and time zones readable labels", () => {
    expect(evaluateExpression("50+10%")).toMatchObject({
      interpreted: "50 + 10%",
      result: "55",
      inputLabel: "Expression",
      resultLabel: "Number",
    });
    expect(evaluateExpression("20% of 50")).toMatchObject({
      interpreted: "20% of 50",
      result: "10",
    });
    expect(evaluateExpression("2 hours + 30 minutes in minutes")).toMatchObject(
      {
        result: "150 Minutes",
        copyValue: "150",
        inputLabel: "Expression",
        resultLabel: "Minutes",
        interpreted: "2 hours + 30 minutes in minutes",
      },
    );
    expect(evaluateExpression("tomorrow", { now })).toMatchObject({
      inputLabel: "Date",
      resultLabel: "Wednesday",
      interpreted: "tomorrow",
    });
    expect(evaluateExpression("days until tomorrow", { now })).toMatchObject({
      result: "1 Day",
      copyValue: "1",
      resultLabel: "Days",
    });
    expect(evaluateExpression("time in tokyo", { now })).toMatchObject({
      inputLabel: "Time",
      resultLabel: "Japan Standard Time",
      interpreted: "now in Asia/Tokyo",
    });
    expect(evaluateExpression("now in tokyo", { now })?.result).toBe("9:00 PM");
  });
  it("rounds currency display and copy consistently and respects decimal separator settings", () => {
    expect(evaluateExpression("1.005 usd")).toMatchObject({
      result: "$1.01",
      copyValue: "1.01",
    });
    expect(evaluateExpression("-0.001 usd")).toMatchObject({
      result: "$0.00",
      copyValue: "0.00",
    });
    expect(evaluateExpression("100 cad")?.resultLabel).toBe("Canadian Dollar");
    expect(
      evaluateExpression("2,5+2,5 usd in eur", {
        decimalSeparator: ",",
        rates: { USD: 1, EUR: 0.8 },
      }),
    ).toMatchObject({ result: "€4.00", copyValue: "4.00" });
  });
  it.each([
    "1/0 usd in eur",
    "2 usd in eur",
    "2 m in seconds",
    "1e300 km in nm",
    "2+2 == 4",
    "0 rem in px",
  ])("rejects invalid conversion %s", (expression) => {
    expect(evaluateExpression(expression, { remToPxRate: 0 })).toBeNull();
  });
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
      result: "200 Centimeters",
      kind: "unit",
    });
    expect(evaluateExpression("2 m in ft")?.resultLabel).toBe("Feet");
    expect(evaluateExpression("2 rem to px", { remToPxRate: 16 })?.result).toBe(
      "32 Pixels",
    );
    expect(
      evaluateExpression("100 EUR in USD", { rates: { USD: 1, EUR: 0.8 } }),
    ).toMatchObject({ result: "$125.00", resultLabel: "US Dollar" });
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
      "150 Minutes",
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
    "2\n3",
  ])("rejects unsafe or invalid expression %s", (expression) =>
    expect(evaluateExpression(expression)).toBeNull(),
  );
});
