import type { BackendEventTopic, BackendEvents } from "@opencast/protocol";

/** An event that invalidates the result of a query; `when` returning false ignores the event. */
export type RefetchRule = { [T in BackendEventTopic]: { topic: T; when?: (payload: BackendEvents[T]) => boolean } }[BackendEventTopic];

const entities = (...collections: string[]): RefetchRule => ({
  topic: "entities.changed",
  when: (payload: BackendEvents["entities.changed"]) => collections.includes(payload.collection),
});

const on = (topic: BackendEventTopic): RefetchRule => ({ topic });

/** Ordered prefix table; the first matching prefix wins. */
const TABLE: [prefix: string, rules: RefetchRule[]][] = [
  ["settings.", [on("settings.changed")]],
  ["search.root", [on("commands.changed"), on("settings.changed"), entities("commandPrefs", "quicklinks", "snippets", "aiCommands", "aiPresets", "windowLayouts")]],
  ["commands.", [on("commands.changed"), entities("commandPrefs")]],
  ["scripts.", [on("commands.changed")]],
  ["clipboard.", [on("clipboard.changed")]],
  ["snippets.", [entities("snippets")]],
  ["quicklinks.", [entities("quicklinks")]],
  ["notes.", [on("notes.changed"), entities("notes")]],
  ["ai.chats.", [on("ai.chats.changed"), entities("aiChats")]],
  ["ai.providers.", [on("ai.providers.changed")]],
  ["ai.models.", [on("ai.providers.changed")]],
  ["ai.commands.", [entities("aiCommands")]],
  ["ai.presets.", [entities("aiPresets")]],
  ["ai.mcp.", [on("ai.mcp.changed")]],
  ["ai.tools.", [on("ai.mcp.changed"), on("extensions.changed")]],
  ["extensions.", [on("extensions.changed")]],
  ["themes.", [on("themes.changed")]],
  ["windows.layouts.", [entities("windowLayouts")]],
  ["sync.", [on("sync.status")]],
];

/** Events after which a query for `method` is refetched by `useBackend`. */
export function refetchRulesFor(method: string): RefetchRule[] {
  for (const [prefix, rules] of TABLE) if (method.startsWith(prefix)) return rules;
  return [];
}
