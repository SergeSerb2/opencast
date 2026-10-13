import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendEvents, CommandInfo } from "@surgecast/protocol";
import { Emitter } from "../../emitter";
import { createScriptsMock } from "./scripts";

afterEach(() => vi.useRealTimers());

describe("script creation mock", () => {
  it("registers every macOS template and preserves inline refresh and confirmation metadata", async () => {
    vi.useFakeTimers();
    const events = new Emitter<BackendEvents>();
    const commands: CommandInfo[] = [];
    const area = createScriptsMock({ events, commands });
    await vi.advanceTimersByTimeAsync(300);
    const scripts = await area.handlers["scripts.list"]!(undefined);
    const directory = scripts[0].path.slice(0, scripts[0].path.lastIndexOf("/"));
    for (const language of ["bash", "applescript", "swift", "python", "node", "typescript", "go", "ruby", "csharp"] as const) {
      const created = await area.handlers["scripts.create"]!({ directory, title: `Test ${language}`, mode: "inline", language, refreshTime: "15m", needsConfirmation: true });
      expect(created.refreshTime).toBe("15m");
      expect(created.needsConfirmation).toBeUndefined();
      expect(commands.some((c) => c.id === `script:${created.path}` && c.interval === "15m")).toBe(true);
    }
    const manual = await area.handlers["scripts.create"]!({ directory, title: "Ask First", mode: "fullOutput", language: "bash", needsConfirmation: true });
    expect(manual.needsConfirmation).toBe(true);
    expect(manual.refreshTime).toBeUndefined();
    expect((await area.handlers["scripts.list"]!(undefined)).some((s) => s.path === manual.path)).toBe(true);
  });
});
