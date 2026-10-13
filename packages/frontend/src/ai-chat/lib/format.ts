import type { AIMessage } from "@surgecast/protocol";

/** "Thought for 4s", "Thought for 1m 12s". */
export function formatThoughtDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `Thought for ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `Thought for ${minutes}m${rest ? ` ${rest}s` : ""}`;
}

/** 950 → "950", 1840 → "1.8k", 12000 → "12k". */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  const k = count / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
}

export function usageSummary(usage: AIMessage["usage"]): string | undefined {
  if (!usage) return undefined;
  const parts: string[] = [];
  if (usage.inputTokens !== undefined) parts.push(`${formatTokens(usage.inputTokens)} in`);
  if (usage.outputTokens !== undefined) parts.push(`${formatTokens(usage.outputTokens)} out`);
  if (usage.reasoningTokens) parts.push(`${formatTokens(usage.reasoningTokens)} reasoning`);
  return parts.length ? `${parts.join(" · ")} tokens` : undefined;
}

/** Time of day for today, otherwise a short date. */
export function formatMessageTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const sameDay = new Date(now).toDateString() === date.toDateString();
  return sameDay ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Turn a tool name into the label shown in its activity row. */
export function toolCallLabel(title: string | undefined, name: string, status: string): string {
  const label = title ?? name.slice(name.lastIndexOf(".") + 1).replace(/[-_]/g, " ");
  switch (status) {
    case "pending":
    case "running":
      return `${label}…`;
    case "awaiting-confirmation":
      return `${label} — waiting for approval`;
    case "rejected":
      return `${label} — declined`;
    case "error":
      return `${label} — failed`;
    default:
      return label;
  }
}
