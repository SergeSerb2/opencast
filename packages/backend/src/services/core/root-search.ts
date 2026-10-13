import type { CommandInfo } from "@opencast/protocol";
import { frecency } from "./ranking";

export const BUILTIN_SUGGESTION_PRIORITIES: Record<string, number> = {
  "builtin:clipboard.clipboardHistory": 100,
  "builtin:snippets.searchSnippets": 90,
  "builtin:ai.openAiChat": 80,
  "builtin:files.searchFiles": 70,
  "builtin:calculator.history": 60,
  "builtin:core.openSettings": 50,
};

const APP_PRIORITIES: Record<string, number> = {
  "com.apple.Safari": 85,
  "com.google.Chrome": 85,
  "org.mozilla.firefox": 85,
  "com.apple.finder": 45,
  "com.apple.Terminal": 40,
  "com.apple.Notes": 35,
  "com.apple.mail": 30,
};

export function appSuggestionPriority(
  bundleId?: string,
  name?: string,
): number | undefined {
  if (/^(?:OpenCast|Surgecast|Raycast)$/i.test(name ?? "")) return undefined;
  return (bundleId && APP_PRIORITIES[bundleId]) || 1;
}

type Visits = Map<string, { count: number; lastUsed: number }>;
export function emptyRootItems(
  commands: CommandInfo[],
  visits: Visits,
  now = Date.now(),
  showSuggestions = true,
) {
  const score = (command: CommandInfo) => {
    const visit = visits.get(command.id);
    return visit ? frecency(visit.count, visit.lastUsed, now) : 1;
  };
  const order = (a: CommandInfo, b: CommandInfo) =>
    score(b) - score(a) ||
    (b.suggestionPriority ?? 0) - (a.suggestionPriority ?? 0) ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id);
  const available = [
    ...new Map(
      commands
        .filter((c) => c.enabled && !c.favorite && c.kind !== "file")
        .map((c) => [c.id, c]),
    ).values(),
  ];
  const eligible = available.filter(
    (c) =>
      !c.hotkey &&
      !/^app:.*(?:opencast|surgecast|raycast)/i.test(c.id) &&
      !(c.kind === "app" && /^(OpenCast|Surgecast|Raycast)$/i.test(c.title)),
  );
  const isNew = (c: CommandInfo) =>
    c.installedAt !== undefined &&
    now >= c.installedAt &&
    now - c.installedAt < 300_000 &&
    score(c) <= 1;
  const newItems = eligible
    .filter(isNew)
    .sort((a, b) => b.installedAt! - a.installedAt! || order(a, b))
    .slice(0, 2);
  const used = eligible.filter((c) => score(c) > 1).sort(order);
  const seeds = eligible
    .filter(
      (c) => !isNew(c) && !c.alias?.trim() && (c.suggestionPriority ?? 0) > 0,
    )
    .sort(order);
  const suggestions = showSuggestions
    ? [
        ...new Map(
          [...newItems, ...used, ...seeds].map((c) => [c.id, c]),
        ).values(),
      ].slice(0, 5)
    : [];
  const selected = new Set(suggestions.map((c) => c.id));
  const remaining = available.filter((c) => !selected.has(c.id)).sort(order);
  return {
    suggestions,
    commands: remaining.filter((c) => c.kind !== "app"),
    applications: remaining.filter((c) => c.kind === "app"),
  };
}
