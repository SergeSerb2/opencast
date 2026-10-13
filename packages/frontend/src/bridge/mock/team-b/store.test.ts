import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendEvents, CommandInfo } from "@opencast/protocol";
import { Emitter } from "../../emitter";
import { createStoreMock } from "./store";

function setup() {
  const events = new Emitter<BackendEvents>();
  const commands: CommandInfo[] = [];
  const area = createStoreMock({ events, commands });
  commands.push(...(area.commands ?? []));
  const changed = vi.fn();
  events.on("extensions.changed", changed);
  return { area, commands, changed, handlers: area.handlers };
}

describe("store mock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Settle a handler call whose simulated latency runs on fake timers. */
  const run = async <T>(value: T | Promise<T>): Promise<T> => {
    const settled = Promise.resolve(value).then(
      (result) => ({ ok: true as const, result }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await vi.runAllTimersAsync();
    const outcome = await settled;
    if (!outcome.ok) throw outcome.error;
    return outcome.result;
  };

  it("keeps the shared fixture extensions installed", async () => {
    const { handlers } = setup();
    const names = (await run(handlers["extensions.list"]!(undefined))).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(["github", "weather"]));
  });

  it("pages and filters the catalog", async () => {
    const { handlers } = setup();
    const first = await run(handlers["extensions.store.search"]!({ page: 1 }));
    const second = await run(handlers["extensions.store.search"]!({ page: 2 }));
    expect(first.items).toHaveLength(10);
    expect(first.hasMore).toBe(true);
    expect(new Set([...first.items, ...second.items].map((i) => i.id)).size).toBe(20);
    const ai = await run(handlers["extensions.store.search"]!({ category: "AI Extensions" }));
    expect(ai.items.every((i) => (i.tools?.length ?? 0) > 0)).toBe(true);
    const github = await run(handlers["extensions.store.search"]!({ query: "pull requests" }));
    expect(github.items.map((i) => i.name)).toEqual(["github"]);
    expect(github.items[0].installed).toBe(true);
  });

  it("installs and uninstalls with commands and events", async () => {
    const { handlers, commands, changed } = setup();
    const installed = await run(handlers["extensions.install"]!({ source: "store", idOrSlug: "theo/linear" }));
    expect(installed.name).toBe("linear");
    expect(commands.filter((c) => c.extensionId === "linear")).toHaveLength(4);
    expect(commands.find((c) => c.id === "ext:linear.create-issue")?.needsPreferences).toBe(true);
    expect(changed).toHaveBeenCalled();
    await run(handlers["extensions.uninstall"]!({ name: "linear" }));
    expect(commands.some((c) => c.extensionId === "linear")).toBe(false);
  });

  it("disables an extension's commands", async () => {
    const { handlers, commands } = setup();
    await run(handlers["extensions.setEnabled"]!({ name: "spotify-player", enabled: false }));
    expect(commands.filter((c) => c.extensionId === "spotify-player").every((c) => !c.enabled)).toBe(true);
  });

  it("updates outdated Store extensions and reports failures", async () => {
    const { handlers } = setup();
    expect(await run(handlers["extensions.update"]!({ name: "github" }))).toEqual({ updated: ["github"] });
    expect(await run(handlers["extensions.update"]!({ name: "github" }))).toEqual({ updated: [] });
    await expect(run(handlers["extensions.update"]!({ name: "spotify-player" }))).rejects.toThrow(/502/);
  });
});
