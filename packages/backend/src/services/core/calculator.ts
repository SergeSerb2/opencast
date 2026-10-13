import { create, all, type MathNode } from "mathjs";
import * as chrono from "chrono-node";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CalculatorResult } from "@surgecast/protocol";
import type { AppContext, Service } from "../../context";
import { boundedLimit } from "./shared";
import { parseColor } from "./colors";

const math = create(all, { number: "number" });
const FUNCTIONS = new Set(
  "abs acos acosh asin asinh atan atan2 atanh ceil cos cosh exp floor log log10 log2 max min mod pow round sign sin sinh sqrt tan tanh cbrt factorial gcd lcm hypot nthRoot".split(
    " ",
  ),
);
const ZONES: Record<string, string> = {
  tokyo: "Asia/Tokyo",
  london: "Europe/London",
  sf: "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  "los angeles": "America/Los_Angeles",
  la: "America/Los_Angeles",
  vancouver: "America/Vancouver",
  "new york": "America/New_York",
  nyc: "America/New_York",
  paris: "Europe/Paris",
  berlin: "Europe/Berlin",
  sydney: "Australia/Sydney",
  singapore: "Asia/Singapore",
  dubai: "Asia/Dubai",
  delhi: "Asia/Kolkata",
  india: "Asia/Kolkata",
  utc: "UTC",
  gmt: "UTC",
};
export function timezone(value: string): string | null {
  const requested = value.trim().toLowerCase();
  const known = Intl.supportedValuesOf("timeZone").filter(
    (zone) =>
      zone.split("/").at(-1)!.replace(/_/g, " ").toLowerCase() === requested,
  );
  const name =
    ZONES[requested] ?? (known.length === 1 ? known[0] : value.trim());
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return name;
  } catch {
    return null;
  }
}
function zoneParts(date: Date, zone: string): Record<string, number> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
}
function zoneOffset(date: Date, zone: string): number {
  const p = zoneParts(date, zone);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    Math.floor(date.getTime() / 1000) * 1000
  );
}
function result(
  input: string,
  value: string,
  kind: CalculatorResult["kind"],
  label?: string,
  interpreted = input,
): CalculatorResult {
  return {
    input,
    interpreted,
    result: value,
    copyValue: value,
    kind,
    resultLabel: label,
  };
}
function unitLabel(unit: string): string {
  const labels: Record<string, string> = {
    m: "Meters",
    meter: "Meters",
    meters: "Meters",
    cm: "Centimeters",
    mm: "Millimeters",
    km: "Kilometers",
    ft: "Feet",
    foot: "Feet",
    feet: "Feet",
    inch: "Inches",
    inches: "Inches",
    mile: "Miles",
    miles: "Miles",
    kg: "Kilograms",
    g: "Grams",
    lb: "Pounds",
    lbs: "Pounds",
    s: "Seconds",
    second: "Seconds",
    seconds: "Seconds",
    minutes: "Minutes",
    h: "Hours",
    hours: "Hours",
    days: "Days",
    degC: "Celsius",
    degF: "Fahrenheit",
    px: "Pixels",
    rem: "Root ems",
  };
  return labels[unit] ?? unit;
}
export interface EvaluateOptions {
  now?: Date;
  colorConversion?: boolean;
  remToPxRate?: number;
  rates?: Record<string, number>;
  decimalSeparator?: "auto" | "." | ",";
}
export function evaluateExpression(
  input: string,
  options: EvaluateOptions = {},
): CalculatorResult | null {
  const expression = input.trim();
  if (!expression || expression.length > 512) return null;
  const now = options.now ?? new Date();
  let m: RegExpExecArray | null;
  if (options.colorConversion !== false) {
    m = /^(.*?)(?:\s+(?:in|to)\s+(hex|rgb|hsl))?$/i.exec(expression);
    const color = parseColor(m![1]);
    if (color) {
      const format = (m![2]?.toLowerCase() ??
        (m![1].startsWith("#") ? "rgb" : "hex")) as keyof typeof color;
      return {
        ...result(input, color[format], "color", format.toUpperCase()),
        color: color.hex,
      };
    }
  }
  m =
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([a-z]{3})\s+(?:in|to)\s+([a-z]{3})$/i.exec(
      expression,
    );
  if (
    m &&
    options.rates?.[m[2].toUpperCase()] &&
    options.rates[m[3].toUpperCase()]
  ) {
    const value =
      (Number(m[1]) / options.rates[m[2].toUpperCase()]) *
      options.rates[m[3].toUpperCase()];
    return result(
      input,
      Number(value.toFixed(6)).toString(),
      "currency",
      m[3].toUpperCase(),
    );
  }
  m =
    /^([+-]?(?:0x[\da-f]+|0b[01]+|0o[0-7]+|\d+))\s+(?:in|to)\s+(hex|hexadecimal|bin|binary|oct|octal|dec|decimal)$/i.exec(
      expression,
    );
  if (m) {
    try {
      const negative = m[1].startsWith("-");
      const number = BigInt(m[1].replace(/^[+-]/, ""));
      const base = /^(hex)/i.test(m[2])
        ? 16
        : /^(bin)/i.test(m[2])
          ? 2
          : /^(oct)/i.test(m[2])
            ? 8
            : 10;
      return result(
        input,
        `${negative ? "-" : ""}${base === 16 ? "0x" : base === 2 ? "0b" : base === 8 ? "0o" : ""}${number.toString(base)}`,
        "base",
        m[2],
      );
    } catch {
      return null;
    }
  }
  m = /^time\s+in\s+(.+)$/i.exec(expression);
  if (m) {
    const zone = timezone(m[1]);
    if (!zone) return null;
    return result(
      input,
      now.toLocaleTimeString("en", {
        timeZone: zone,
        hour: "numeric",
        minute: "2-digit",
      }),
      "timezone",
      zone,
    );
  }
  m = /^(.+?)\s+([a-z/_ -]+)\s+(?:in|to)\s+([a-z/_ -]+)$/i.exec(expression);
  if (m) {
    const from = timezone(m[2]);
    const to = timezone(m[3]);
    if (from && to) {
      const parsed = chrono.parse(m[1], now)[0];
      if (parsed?.start.isCertain("hour")) {
        const p = zoneParts(now, from);
        const wall = Date.UTC(
          p.year,
          p.month - 1,
          p.day,
          parsed.start.get("hour")!,
          parsed.start.get("minute") ?? 0,
        );
        let instant = new Date(wall);
        for (let i = 0; i < 3; i++)
          instant = new Date(wall - zoneOffset(instant, from));
        return result(
          input,
          instant.toLocaleTimeString("en", {
            timeZone: to,
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          }),
          "timezone",
          to,
        );
      }
    }
  }
  m = /^(days?|weeks?|hours?|minutes?)\s+(until|since)\s+(.+)$/i.exec(
    expression,
  );
  if (m) {
    const parsed = chrono.parseDate(m[3], now, {
      forwardDate: m[2].toLowerCase() === "until",
    });
    if (parsed) {
      const scale = /^week/i.test(m[1])
        ? 604800000
        : /^day/i.test(m[1])
          ? 86400000
          : /^hour/i.test(m[1])
            ? 3600000
            : 60000;
      return result(
        input,
        String(
          Math.round(
            ((parsed.getTime() - now.getTime()) / scale) *
              (m[2].toLowerCase() === "since" ? -1 : 1),
          ),
        ),
        "date",
        m[1],
      );
    }
  }
  m = /^(\w+)\s+in\s+(\d+)\s+weeks?$/i.exec(expression);
  if (m) {
    const weekdays = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    const weekday = weekdays.indexOf(m[1].toLowerCase());
    if (weekday >= 0) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(
        day.getDate() - ((day.getDay() + 6) % 7) + weekday + Number(m[2]) * 7,
      );
      return result(
        input,
        day.toLocaleDateString("en", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
        "date",
        day.toLocaleDateString("en", { weekday: "long" }),
      );
    }
  }
  if (
    /\b(?:today|tomorrow|yesterday|next|ago|in\s+\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      expression,
    )
  ) {
    const dates = chrono.parse(expression, now, { forwardDate: true });
    if (
      dates.length === 1 &&
      dates[0].text.trim().toLowerCase() === expression.toLowerCase()
    ) {
      const date = dates[0].start.date();
      return result(
        input,
        date.toLocaleString("en", {
          year: "numeric",
          month: "short",
          day: "numeric",
          ...(dates[0].start.isCertain("hour")
            ? { hour: "numeric", minute: "2-digit" }
            : {}),
        }),
        "date",
        date.toLocaleDateString("en", { weekday: "long" }),
      );
    }
  }
  m = /^([+-]?[\d.]+)\s*(rem|px)\s+(?:in|to)\s+(rem|px)$/i.exec(expression);
  if (m) {
    const rate = options.remToPxRate ?? 16;
    const value =
      Number(m[1]) *
      (m[2].toLowerCase() === m[3].toLowerCase()
        ? 1
        : m[2].toLowerCase() === "rem"
          ? rate
          : 1 / rate);
    return result(
      input,
      `${value} ${m[3].toLowerCase()}`,
      "unit",
      unitLabel(m[3].toLowerCase()),
    );
  }
  let source = expression
    .replace(/×/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/−/g, "-");
  if (options.decimalSeparator === ",")
    source = source.replace(/(\d),(\d)/g, "$1.$2");
  const percent = source.includes("%");
  source = source
    .replace(/([\d.]+)%\s+of\s+([\d.]+)/gi, "($1 / 100 * $2)")
    .replace(/([\d.]+)\s*([+-])\s*([\d.]+)%/g, "($1 $2 ($1 * $3 / 100))")
    .replace(/([\d.]+)%/g, "($1 / 100)")
    .replace(/\s+in\s+/gi, " to ");
  if (!/[\d]/.test(source) || source.includes(";") || source.includes("\n"))
    return null;
  try {
    const node = math.parse(source);
    let nodes = 0;
    node.traverse((child: MathNode) => {
      if (
        ++nodes > 100 ||
        ![
          "ConstantNode",
          "SymbolNode",
          "OperatorNode",
          "ParenthesisNode",
          "FunctionNode",
        ].includes(child.type)
      )
        throw new Error("Unsupported expression");
      if (
        child.type === "ConstantNode" &&
        typeof (child as unknown as { value: unknown }).value === "string"
      )
        throw new Error("Text is not math");
      if (
        child.type === "FunctionNode" &&
        !FUNCTIONS.has((child as unknown as { name: string }).name)
      )
        throw new Error("Unsupported function");
      if (child.type === "OperatorNode") {
        const operator = child as unknown as { op: string; args: MathNode[] };
        if (operator.op === "!" && Number(operator.args[0].toString()) > 170)
          throw new Error("Factorial too large");
      }
    });
    const value = node.compile().evaluate();
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    const formatted = math.format(value, { precision: 14 });
    if (formatted.length > 4096) return null;
    const kind = value?.isUnit ? "unit" : percent ? "percentage" : "math";
    return result(
      input,
      formatted,
      kind,
      value?.isUnit
        ? unitLabel(String(value.units?.[0]?.unit?.name ?? ""))
        : undefined,
      source,
    );
  } catch {
    return null;
  }
}
interface Rates {
  fetchedAt: number;
  rates: Record<string, number>;
}
export class Calculator {
  private cache?: Rates;
  private refreshing?: Promise<void>;
  constructor(private readonly ctx: AppContext) {}
  private async refreshRates(): Promise<void> {
    if (!this.cache) {
      try {
        const value: Rates = JSON.parse(
          await readFile(join(this.ctx.dataDir, "currency-rates.json"), "utf8"),
        );
        if (validRates(value)) this.cache = value;
      } catch {
        /* A cold/offline start still supports all other calculations. */
      }
    }
    if (this.cache && Date.now() - this.cache.fetchedAt < 43200000) return;
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD", {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return;
      const json = (await response.json()) as {
        rates?: Record<string, number>;
      };
      const next = { fetchedAt: Date.now(), rates: json.rates! };
      if (!validRates(next)) return;
      this.cache = next;
      await mkdir(this.ctx.dataDir, { recursive: true });
      const path = join(this.ctx.dataDir, "currency-rates.json");
      const part = `${path}.${randomUUID()}.part`;
      await writeFile(part, JSON.stringify(next), { mode: 0o600 });
      await rename(part, path);
    } catch {
      /* Use stale rates when offline. */
    }
  }
  async evaluate(expression: string): Promise<CalculatorResult | null> {
    if (/\d\s*[A-Z]{3}\s+(?:in|to)\s+[A-Z]{3}\s*$/i.test(expression)) {
      this.refreshing ??= this.refreshRates().finally(() => {
        this.refreshing = undefined;
      });
      await this.refreshing;
    }
    return evaluateExpression(expression, {
      rates: this.cache?.rates,
      colorConversion: this.ctx.settings.get("calculator.colorConversion"),
      remToPxRate: this.ctx.settings.get("calculator.remToPxRate"),
      decimalSeparator: this.ctx.settings.get("calculator.decimalSeparator"),
    });
  }
}
function validRates(value: Rates): boolean {
  return (
    !!value &&
    Number.isFinite(value.fetchedAt) &&
    !!value.rates &&
    value.rates.USD === 1 &&
    Object.values(value.rates).every(
      (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
    )
  );
}
const calculators = new WeakMap<AppContext, Calculator>();
export function calculator(ctx: AppContext): Calculator {
  let c = calculators.get(ctx);
  if (!c) {
    c = new Calculator(ctx);
    calculators.set(ctx, c);
  }
  return c;
}
export const calculatorService: Service = {
  name: "core.calculator",
  register(ctx) {
    ctx.db.addMigrations({
      id: "core-calc-history-001",
      up: "CREATE TABLE calculator_history (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, data TEXT NOT NULL)",
    });
    ctx.rpc.handleAll({
      "calc.evaluate": ({ expression }) => calculator(ctx).evaluate(expression),
      "calc.saveHistory": ({ result }) => {
        ctx.db.run(
          "INSERT INTO calculator_history VALUES (?, ?, ?)",
          randomUUID(),
          Date.now(),
          JSON.stringify(result),
        );
      },
      "calc.history": ({ query = "", limit }) =>
        ctx.db
          .all<{
            id: string;
            created_at: number;
            data: string;
          }>(
            "SELECT * FROM calculator_history WHERE instr(lower(data), lower(?)) > 0 ORDER BY created_at DESC LIMIT ?",
            query,
            boundedLimit(limit),
          )
          .map((r) => ({
            ...JSON.parse(r.data),
            id: r.id,
            createdAt: r.created_at,
          })),
      "calc.clearHistory": () => {
        ctx.db.run("DELETE FROM calculator_history");
      },
    });
  },
};
