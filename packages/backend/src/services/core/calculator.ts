import * as chrono from "chrono-node";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CalculatorResult } from "@surgecast/protocol";
import type { AppContext, Service } from "../../context";
import { boundedLimit } from "./shared";
import { parseColor } from "./colors";

import {
  math,
  mathSource,
  prettyMath,
  evaluateMath,
  singleNumber,
} from "./calculator-math";
import {
  currencyName,
  currencyText,
  isCurrency,
  unitLabel,
  unitNumber,
  zoneLabel,
} from "./calculator-format";

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
  interpreted = input.trim().replace(/\s+/g, " "),
): CalculatorResult {
  return {
    input,
    interpreted,
    result: value,
    copyValue: value,
    kind,
    resultLabel:
      label ??
      (kind === "math" || kind === "percentage" ? "Number" : undefined),
    inputLabel:
      kind === "math" || kind === "percentage"
        ? "Expression"
        : kind === "timezone"
          ? "Time"
          : kind === "date"
            ? "Date"
            : kind === "color"
              ? "Color"
              : kind === "base"
                ? "Number"
                : "Expression",
  };
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
  if (typeof input !== "string") return null;
  const expression = input.trim();
  if (!expression || expression.length > 512 || /[\r\n]/.test(expression))
    return null;
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
  const source = mathSource(expression, options.decimalSeparator);
  const currency = /^(.*?)\s*([a-z]{3})(?:\s+(?:in|to)\s+([a-z]{3}))?$/i.exec(
    source,
  );
  if (
    currency &&
    isCurrency(currency[2], options.rates) &&
    // A lowercase measurement such as "cup" takes precedence over its ISO currency.
    !(
      currency[2] === currency[2].toLowerCase() &&
      math.Unit.isValuelessUnit(currency[2])
    ) &&
    (!currency[3] || isCurrency(currency[3], options.rates))
  ) {
    const amount = evaluateMath(currency[1]);
    if (typeof amount !== "number") return null;
    const from = currency[2].toUpperCase();
    const to = (currency[3] ?? currency[2]).toUpperCase();
    const fromRate = options.rates?.[from];
    const toRate = options.rates?.[to];
    if (
      from !== to &&
      (!fromRate ||
        !toRate ||
        !Number.isFinite(fromRate) ||
        !Number.isFinite(toRate) ||
        fromRate <= 0 ||
        toRate <= 0)
    )
      return null;
    const value = from === to ? amount : (amount / fromRate!) * toRate!;
    if (!Number.isFinite(value)) return null;
    return {
      ...result(
        input,
        "",
        "currency",
        currencyName(to),
        `${prettyMath(currency[1])} ${currency[2]}${currency[3] ? ` in ${currency[3]}` : ""}`,
      ),
      ...currencyText(value, to),
      inputLabel: singleNumber(currency[1]) ? currencyName(from) : "Expression",
    };
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
  m = /^(?:time|now)\s+in\s+(.+)$/i.exec(expression);
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
      zoneLabel(zone, now),
      `now in ${zone}`,
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
          zoneLabel(to, instant),
          `${parsed.start.get("hour")! % 12 || 12}:${String(parsed.start.get("minute") ?? 0).padStart(2, "0")} ${parsed.start.get("hour")! >= 12 ? "PM" : "AM"} ${from} in ${to}`,
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
      const count = Math.round(
        ((parsed.getTime() - now.getTime()) / scale) *
          (m[2].toLowerCase() === "since" ? -1 : 1),
      );
      return {
        ...result(
          input,
          `${count} ${unitLabel(m[1].toLowerCase(), count)}`,
          "date",
          unitLabel(m[1].toLowerCase()),
        ),
        copyValue: String(count),
        inputLabel: "Expression",
      };
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
    /\b(?:now|today|tomorrow|yesterday|next|ago|in\s+\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
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
  // Evaluate a trailing unit's entire scalar expression before attaching the unit.
  // Compound quantities ("2 hours + 30 minutes") fall through to dimensional math.
  const conversion = /^(.+?)\s+(?:in|to)\s+(.+)$/i.exec(source);
  const quantity =
    /^(.+?)\s*([a-zA-Z][a-zA-Z0-9]*(?:\s*[\^*/]\s*[a-zA-Z\d+-]+)*)$/.exec(
      conversion?.[1] ?? source,
    );
  let value = null;
  let inputLabel = "Expression";
  let interpreted = prettyMath(source);
  if (quantity) {
    const amount = evaluateMath(quantity[1]);
    if (typeof amount === "number") {
      const from = quantity[2];
      const to = conversion?.[2] ?? from;
      inputLabel = singleNumber(quantity[1]) ? unitLabel(from) : "Expression";
      interpreted = `${prettyMath(quantity[1])} ${from}${conversion ? ` in ${to}` : ""}`;
      if (/^(rem|px)$/i.test(from) && /^(rem|px)$/i.test(to)) {
        const rate = options.remToPxRate ?? 16;
        if (!Number.isFinite(rate) || rate <= 0) return null;
        const number =
          amount *
          (from.toLowerCase() === to.toLowerCase()
            ? 1
            : from.toLowerCase() === "rem"
              ? rate
              : 1 / rate);
        if (!Number.isFinite(number)) return null;
        const formatted = unitNumber(number);
        return {
          ...result(
            input,
            `${formatted} ${unitLabel(to.toLowerCase(), Number(formatted))}`,
            "unit",
            unitLabel(to.toLowerCase()),
            interpreted,
          ),
          inputLabel,
          copyValue: formatted,
        };
      }
      try {
        value = math.unit(amount, from).to(to);
      } catch {
        // Math expressions and compound units still go through the bounded parser.
      }
    }
  }
  if (singleNumber(source)) return null;
  value ??= evaluateMath(source);
  if (value === null) return null;
  if (math.isUnit(value)) {
    const unit = value.formatUnits();
    const number = value.toNumber(unit);
    if (!Number.isFinite(number)) return null;
    const formatted = unitNumber(number);
    return {
      ...result(
        input,
        `${formatted} ${unitLabel(unit, Number(formatted))}`,
        "unit",
        unitLabel(unit),
        interpreted.replace(/\s+to\s+/g, " in "),
      ),
      inputLabel,
      copyValue: formatted,
    };
  }
  const formatted = math.format(value, { precision: 14 });
  if (formatted.length > 4096) return null;
  return result(
    input,
    formatted,
    source.includes("%") ? "percentage" : "math",
    undefined,
    prettyMath(source),
  );
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
    if (typeof expression !== "string" || expression.length > 512) return null;
    const conversion = /^(.*?)\s*([a-z]{3})\s+(?:in|to)\s+([a-z]{3})\s*$/i.exec(
      expression.trim(),
    );
    if (
      conversion &&
      isCurrency(conversion[2]) &&
      isCurrency(conversion[3]) &&
      typeof evaluateMath(
        mathSource(
          conversion[1],
          this.ctx.settings.get("calculator.decimalSeparator"),
        ),
      ) === "number"
    ) {
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
