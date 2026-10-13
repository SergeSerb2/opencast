import type { CalculatorResult, CommandInfo, RootSearchItem, RootSearchResult, RootSearchSection } from "@surgecast/protocol";
import { fuzzyFilter } from "../../lib/fuzzy";
import { RUNNING_APP_IDS, SUGGESTION_IDS } from "./fixtures/commands";

const RATES: Record<string, { rate: number; symbol: string; name: string }> = {
  usd: { rate: 1, symbol: "$", name: "US Dollar" },
  eur: { rate: 0.8936, symbol: "€", name: "Euro" },
  gbp: { rate: 0.7712, symbol: "£", name: "British Pound" },
  jpy: { rate: 151.2, symbol: "¥", name: "Japanese Yen" },
  chf: { rate: 0.8061, symbol: "CHF ", name: "Swiss Franc" },
};

/** Tiny arithmetic evaluator for the mock calculator (+ − × ÷ ^ % and parentheses). */
export function evaluateArithmetic(input: string): number | null {
  const src = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  if (!/^[\d.+\-*/^%()]+$/.test(src) || !/\d/.test(src)) return null;
  let pos = 0;
  const peek = () => src[pos];
  const number = (): number => {
    if (peek() === "(") {
      pos++;
      const v = expr();
      if (peek() !== ")") throw new Error("paren");
      pos++;
      return v;
    }
    if (peek() === "-") {
      pos++;
      return -number();
    }
    const start = pos;
    while (pos < src.length && /[\d.]/.test(src[pos])) pos++;
    if (start === pos) throw new Error("number");
    return Number(src.slice(start, pos));
  };
  const power = (): number => {
    const base = number();
    if (peek() === "^") {
      pos++;
      return base ** power();
    }
    if (peek() === "%") {
      pos++;
      return base / 100;
    }
    return base;
  };
  const term = (): number => {
    let v = power();
    while (peek() === "*" || peek() === "/") {
      const op = src[pos++];
      const r = power();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[pos++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  try {
    const value = expr();
    return pos === src.length && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function format(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 }).format(Math.round(value * 1e10) / 1e10);
}

function prettyExpression(expression: string): string {
  return expression.replace(/\*/g, "×").replace(/\//g, "÷").replace(/\s*([+\-×÷])\s*/g, "$1");
}

export function mockCalculate(query: string): CalculatorResult | undefined {
  const q = query.trim().toLowerCase();
  if (!q || !/\d/.test(q)) return undefined;
  const currency = q.match(/^(.+?)\s*([a-z]{3})\s+(?:in|to)\s+([a-z]{3})$/);
  if (currency && RATES[currency[2]] && RATES[currency[3]]) {
    const amount = evaluateArithmetic(currency[1]);
    if (amount === null) return undefined;
    const to = RATES[currency[3]];
    const value = (amount / RATES[currency[2]].rate) * to.rate;
    const result = `${to.symbol}${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
    return { input: query, interpreted: `${prettyExpression(currency[1])} ${currency[2]} in ${currency[3]}`, result, copyValue: value.toFixed(2), inputLabel: "Expression", resultLabel: to.name, kind: "currency" };
  }
  const value = evaluateArithmetic(q);
  if (value === null || /^\d+(\.\d+)?$/.test(q)) return undefined;
  const words = value === Math.trunc(value) && Math.abs(value) < 1e6 ? new Intl.NumberFormat("en-US").format(value) : format(value);
  return { input: query, interpreted: prettyExpression(q), result: format(value), copyValue: String(value), inputLabel: "Expression", resultLabel: words === format(value) ? "Result" : words, kind: "math" };
}

function toItem(command: CommandInfo, ranges?: [number, number][]): RootSearchItem {
  return { ...command, matches: ranges };
}

export function mockRootSearch(query: string, commands: CommandInfo[], fallbackIds: string[]): RootSearchResult {
  const enabled = commands.filter((c) => c.enabled);
  const q = query.trim();
  const decorate = (item: RootSearchItem): RootSearchItem => (RUNNING_APP_IDS.has(item.id) ? { ...item, running: true } : item);
  if (!q) {
    const favorites = enabled.filter((c) => c.favorite);
    const suggestions = SUGGESTION_IDS.map((id) => enabled.find((c) => c.id === id)).filter((c): c is CommandInfo => Boolean(c) && !c!.favorite);
    const shown = new Set([...favorites, ...suggestions].map((c) => c.id));
    const rest = enabled.filter((c) => !shown.has(c.id) && c.kind !== "app");
    const sections: RootSearchSection[] = [];
    if (favorites.length) sections.push({ id: "favorites", title: "Favorites", items: favorites.map((c) => decorate(toItem(c))) });
    if (suggestions.length) sections.push({ id: "suggestions", title: "Suggestions", items: suggestions.map((c) => decorate(toItem(c))) });
    sections.push({ id: "commands", title: "Commands", items: rest.map((c) => decorate(toItem(c))) });
    return { query, sections, fallbacks: [] };
  }
  const hits = fuzzyFilter(enabled, q, (c) => [
    { text: c.title, highlight: true },
    { text: c.alias, weight: 1.4 },
    { text: c.subtitle, weight: 0.5 },
    ...(c.keywords ?? []).map((k) => ({ text: k, weight: 0.7 })),
  ]);
  const calculator = mockCalculate(q);
  const fallbacks = fallbackIds.map((id) => enabled.find((c) => c.id === id)).filter((c): c is CommandInfo => Boolean(c)).map((c) => toItem(c));
  return {
    query,
    calculator,
    sections: hits.length ? [{ id: "results", title: "Results", items: hits.slice(0, 40).map((h) => decorate(toItem(h.item, h.ranges))) }] : [],
    fallbacks,
  };
}
