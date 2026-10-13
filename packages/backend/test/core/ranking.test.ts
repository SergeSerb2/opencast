import { describe, expect, it } from "vitest";
import type { CommandInfo } from "@surgecast/protocol";
import {
  fuzzyMatch,
  frecency,
  rankCommands,
} from "../../src/services/core/ranking";
const command = (
  id: string,
  title: string,
  extra: Partial<CommandInfo> = {},
): CommandInfo => ({
  id,
  title,
  kind: "builtin",
  typeLabel: "Command",
  icon: "bolt-16",
  mode: "view",
  enabled: true,
  ...extra,
});
describe("ranking", () => {
  it("prioritizes exact and prefix aliases over popular titles", () => {
    const commands = [
      command("a", "Google"),
      command("b", "Search Notes", { alias: "go" }),
      command("c", "Search Files", { alias: "gone" }),
    ];
    const visits = new Map([["a", { count: 10000, lastUsed: Date.now() }]]);
    expect(
      rankCommands("go", commands, visits, "high").map((c) => c.id),
    ).toEqual(["b", "c", "a"]);
  });
  it("matches subtitle and keywords while excluding disabled items", () => {
    const commands = [
      command("a", "Other", { subtitle: "Clipboard History" }),
      command("b", "Unrelated", { keywords: ["clipboard"] }),
      command("c", "Clipboard", { enabled: false }),
    ];
    expect(
      rankCommands("clipboard", commands, new Map(), "high").map((c) => c.id),
    ).toEqual(["b", "a"]);
  });
  it("returns original character offsets for accented titles and contiguous matches", () => {
    expect(fuzzyMatch("cafe", "Café")?.matches).toEqual([[0, 4]]);
    expect(fuzzyMatch("sc", "Search Commands")?.matches).toEqual([
      [0, 1],
      [7, 8],
    ]);
    expect(fuzzyMatch("sc", "Search Commands", "low")).toBeNull();
  });
  it("decays visits and rewards repeated launches", () => {
    expect(frecency(10, 0, 0)).toBeGreaterThan(frecency(1, 0, 0));
    expect(frecency(10, 0, 86400000 * 90)).toBeLessThan(frecency(10, 0, 0));
  });
});
