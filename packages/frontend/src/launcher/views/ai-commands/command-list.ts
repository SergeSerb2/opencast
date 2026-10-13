import type { AICommand } from "@surgecast/protocol";
import { fuzzyFilter, type MatchRange } from "../../../lib/fuzzy";

/** Tag filter value that shows every command. */
export const ALL_TAGS = "__all__";

export interface CommandSection {
  id: "custom" | "builtin";
  title: string;
  items: { command: AICommand; ranges: MatchRange[] }[];
}

const byName = (a: AICommand, b: AICommand) => a.name.localeCompare(b.name);

/**
 * "Custom Commands" then "Built-in Commands", filtered by tag and fuzzy query
 * (name, then tags); best matches first within a section.
 */
export function commandSections(commands: AICommand[], query: string, tag: string): CommandSection[] {
  const tagged = tag === ALL_TAGS ? commands : commands.filter((c) => c.tags?.includes(tag));
  const section = (id: CommandSection["id"], title: string, items: AICommand[]): CommandSection => ({
    id,
    title,
    items: fuzzyFilter([...items].sort(byName), query, (c) => [{ text: c.name, highlight: true }, ...(c.tags ?? []).map((t) => ({ text: t, weight: 0.6 }))]).map((hit) => ({ command: hit.item, ranges: hit.ranges })),
  });
  return [section("custom", "Custom Commands", tagged.filter((c) => !c.builtin)), section("builtin", "Built-in Commands", tagged.filter((c) => c.builtin))].filter((s) => s.items.length > 0);
}

/** Deeplink that runs the command (`surgecast://ai-commands/<id>`, resolved by the backend). */
export function commandDeeplink(command: Pick<AICommand, "id">): string {
  return `surgecast://ai-commands/${encodeURIComponent(command.id)}`;
}
