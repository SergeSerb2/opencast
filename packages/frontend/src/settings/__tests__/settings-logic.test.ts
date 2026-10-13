import { describe, expect, it } from "vitest";
import type { CommandInfo, InstalledExtension } from "@surgecast/protocol";
import { commandGroup, sidebarIdFor } from "../catalog";
import { findHotkeyConflict, GLOBAL_HOTKEY_OWNER, hotkeyGlyphs, recordKey, sameHotkey } from "../hotkeys";
import { formatBytes, formatRelativeTime, moveItem, tildePath } from "../lists";
import { goBack, goForward, normalizeRoute, replaceRoute, visit } from "../navigation";
import { buildMcpServer, draftFromServer, mentionNameFor, parseEnv, parseHeaders } from "../pages/ai/mcp-form";
import { buildShortcutTree, collectiveState } from "../shortcuts-tree";
import { validateSyncSetup, type SyncSetup } from "../sync-form";

const key = (code: string, key: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({ code, key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

describe("routes and history", () => {
  it("normalizes routes from window.route, hashes and aliases", () => {
    expect(normalizeRoute(undefined)).toBe("general");
    expect(normalizeRoute("#/AI/")).toBe("ai");
    expect(normalizeRoute("AI/Models")).toBe("ai/models");
    expect(normalizeRoute("extensions")).toBe("shortcuts");
    expect(normalizeRoute("sync")).toBe("cloud-sync");
    expect(normalizeRoute("extensions/MyExtension")).toBe("extensions/MyExtension");
    expect(normalizeRoute("ai/providers/AbC")).toBe("ai/providers/AbC");
  });

  it("keeps back/forward stacks like a browser", () => {
    let state = { current: "general", back: [], forward: [] } as { current: string; back: string[]; forward: string[] };
    state = visit(state, "ai");
    state = visit(state, "ai/models");
    expect(visit(state, "ai/models")).toBe(state);
    state = goBack(state);
    expect(state).toEqual({ current: "ai", back: ["general"], forward: ["ai/models"] });
    state = goForward(state);
    expect(state.current).toBe("ai/models");
    state = goBack(goBack(state));
    state = visit(state, "keyboard");
    expect(state).toEqual({ current: "keyboard", back: ["general"], forward: [] });
    expect(replaceRoute(state, "ai/providers/p1")).toEqual({ current: "ai/providers/p1", back: ["general"], forward: [] });
    expect(goBack({ current: "general", back: [], forward: [] }).current).toBe("general");
  });

  it("selects the sidebar entry that owns a route", () => {
    expect(sidebarIdFor("ai/providers/p1")).toBe("ai");
    expect(sidebarIdFor("extensions/github")).toBe("extensions/github");
    expect(sidebarIdFor("cloud-sync")).toBe("cloud-sync");
  });
});

describe("hotkey recording", () => {
  it("records modifier combinations with macOS key codes", () => {
    expect(recordKey(key("Space", " ", { altKey: true }))).toEqual({ kind: "hotkey", hotkey: { modifiers: ["opt"], key: "space", keyCode: 49 } });
    expect(recordKey(key("KeyV", "V", { metaKey: true, shiftKey: true }))).toEqual({ kind: "hotkey", hotkey: { modifiers: ["shift", "cmd"], key: "v", keyCode: 9 } });
    expect(recordKey(key("F5", "F5"))).toEqual({ kind: "hotkey", hotkey: { modifiers: [], key: "f5", keyCode: 96 } });
  });

  it("asks for a modifier for plain keys and reports held modifiers", () => {
    expect(recordKey(key("KeyA", "a"))).toEqual({ kind: "needs-modifier", key: "a" });
    expect(recordKey(key("KeyA", "A", { shiftKey: true }))).toEqual({ kind: "needs-modifier", key: "a" });
    expect(recordKey(key("MetaLeft", "Meta", { metaKey: true }))).toEqual({ kind: "modifiers", modifiers: ["cmd"] });
  });

  it("compares hotkeys regardless of modifier order and alt/opt spelling", () => {
    expect(sameHotkey({ modifiers: ["cmd", "shift"], key: "V" }, { modifiers: ["shift", "cmd"], key: "v" })).toBe(true);
    expect(sameHotkey({ modifiers: ["alt"], key: "space" }, { modifiers: ["opt"], key: "space" })).toBe(true);
    expect(sameHotkey({ modifiers: ["cmd"], key: "v" }, { modifiers: ["cmd", "shift"], key: "v" })).toBe(false);
    expect(sameHotkey(undefined, { modifiers: [], key: "v" })).toBe(false);
    expect(hotkeyGlyphs({ modifiers: ["cmd", "opt"], key: "space" })).toEqual(["⌥", "⌘", "Space"]);
  });

  it("finds conflicts with the system, the Surgecast hotkey and other commands", () => {
    const commands = [{ id: "a", title: "Clipboard History", hotkey: { modifiers: ["cmd", "shift"], key: "v" } }] as Pick<CommandInfo, "id" | "title" | "hotkey">[];
    const global = { modifiers: ["opt" as const], key: "space" };
    expect(findHotkeyConflict({ modifiers: ["cmd"], key: "space" }, "b", commands, global)).toBe("Used by Spotlight");
    expect(findHotkeyConflict(global, "b", commands, global)).toBe("Used by the Surgecast Hotkey");
    expect(findHotkeyConflict(global, GLOBAL_HOTKEY_OWNER, commands, global)).toBeNull();
    expect(findHotkeyConflict({ modifiers: ["shift", "cmd"], key: "V" }, "b", commands, global)).toBe("Already used by “Clipboard History”");
    expect(findHotkeyConflict({ modifiers: ["cmd", "shift"], key: "v" }, "a", commands, global)).toBeNull();
  });
});

const command = (over: Partial<CommandInfo>): CommandInfo => ({ id: "builtin:clipboard.history", kind: "builtin", title: "Clipboard History", typeLabel: "Command", icon: "clipboard-16", mode: "view", enabled: true, ...over });

describe("shortcuts tree", () => {
  const commands = [
    command({}),
    command({ id: "builtin:clipboard.clear", title: "Clear Clipboard", enabled: false }),
    command({ id: "ext:github.prs", kind: "extension", title: "My Pull Requests", extensionId: "github", alias: "pr" }),
    command({ id: "app:com.apple.Safari", kind: "app", title: "Safari", typeLabel: "Application", hotkey: { modifiers: ["opt"], key: "s" } }),
    command({ id: "quicklink:q1", kind: "quicklink", title: "Search MDN", typeLabel: "Quicklink" }),
  ];
  const extensions = [{ name: "github", title: "GitHub", author: "me", source: "store", enabled: true, installedAt: 0, updatedAt: 0, commands: [], tools: [], preferences: [] }] as InstalledExtension[];
  const all = { query: "", category: "all" as const, state: "all" as const };

  it("groups extensions by extension and sorts categories and titles", () => {
    const tree = buildShortcutTree(commands, extensions, all);
    expect(tree.map((c) => c.id)).toEqual(["extensions", "applications", "quicklinks"]);
    expect(tree[0].groups?.map((g) => [g.title, g.route, g.commands.map((c) => c.title)])).toEqual([
      ["Clipboard History", "clipboard-history", ["Clear Clipboard", "Clipboard History"]],
      ["GitHub", "extensions/github", ["My Pull Requests"]],
    ]);
  });

  it("filters by text, category and state", () => {
    expect(buildShortcutTree(commands, extensions, { ...all, query: "pr" }).flatMap((c) => c.commands.map((x) => x.title))).toEqual(["My Pull Requests"]);
    expect(buildShortcutTree(commands, extensions, { ...all, category: "applications" }).map((c) => c.id)).toEqual(["applications"]);
    expect(buildShortcutTree(commands, extensions, { ...all, state: "disabled" }).flatMap((c) => c.commands.map((x) => x.title))).toEqual(["Clear Clipboard"]);
    expect(buildShortcutTree(commands, extensions, { ...all, state: "hotkey-set" }).flatMap((c) => c.commands.map((x) => x.title))).toEqual(["Safari"]);
    expect(buildShortcutTree(commands, extensions, { ...all, query: "zzz" })).toEqual([]);
  });

  it("computes collective enabled state", () => {
    expect(collectiveState([{ enabled: true }, { enabled: true }])).toBe(true);
    expect(collectiveState([{ enabled: false }])).toBe(false);
    expect(collectiveState([{ enabled: true }, { enabled: false }])).toBe("indeterminate");
  });

  it("derives command groups from ids when the backend omits extensionId", () => {
    expect(commandGroup({ id: "builtin:windows.leftHalf", kind: "builtin" })).toBe("windows");
    expect(commandGroup({ id: "ext:github.prs", kind: "extension" })).toBe("github");
    expect(commandGroup({ id: "app:x", kind: "app" })).toBeUndefined();
  });
});

describe("cloud sync setup form", () => {
  const form: SyncSetup = { serverUrl: "https://sync.example.workers.dev", token: "t0ken", passphrase: "correct horse battery", confirmPassphrase: "", createVault: false, deviceName: "MacBook" };

  it("accepts a joining device and a confirmed new vault", () => {
    expect(validateSyncSetup(form)).toEqual({});
    expect(validateSyncSetup({ ...form, createVault: true, confirmPassphrase: form.passphrase })).toEqual({});
    expect(validateSyncSetup({ ...form, serverUrl: "http://localhost:8787" })).toEqual({});
  });

  it("rejects insecure or malformed URLs and missing secrets", () => {
    expect(validateSyncSetup({ ...form, serverUrl: "http://sync.example.com" }).serverUrl).toMatch(/https/);
    expect(validateSyncSetup({ ...form, serverUrl: "sync" }).serverUrl).toMatch(/valid/);
    expect(validateSyncSetup({ ...form, serverUrl: "https://a:b@sync.example.com" }).serverUrl).toMatch(/password/);
    expect(validateSyncSetup({ ...form, serverUrl: "https://sync.example.com/?token=x" }).serverUrl).toMatch(/base URL/);
    expect(validateSyncSetup({ ...form, token: " " }).token).toBeDefined();
    expect(validateSyncSetup({ ...form, passphrase: "" }).passphrase).toBeDefined();
  });

  it("requires a long, confirmed passphrase only when creating a vault", () => {
    expect(validateSyncSetup({ ...form, passphrase: "short" })).toEqual({});
    expect(validateSyncSetup({ ...form, createVault: true, passphrase: "short", confirmPassphrase: "short" }).passphrase).toMatch(/12/);
    expect(validateSyncSetup({ ...form, createVault: true, confirmPassphrase: "different" }).confirmPassphrase).toMatch(/match/);
  });
});

describe("MCP server form", () => {
  it("derives mention names", () => {
    expect(mentionNameFor("GitHub Enterprise")).toBe("github-enterprise");
    expect(mentionNameFor("Café ☕ Tools")).toBe("cafe-tools");
  });

  it("parses env and header lines", () => {
    expect(parseEnv("A=1\n\n  B_2 = two=2 ")).toEqual({ values: { A: "1", B_2: "two=2" } });
    expect(parseEnv("not valid")).toEqual({ error: "Each environment variable must be KEY=value" });
    expect(parseHeaders("Authorization: Bearer x:y")).toEqual({ values: { Authorization: "Bearer x:y" } });
    expect(parseHeaders("Bad Header: 1")).toHaveProperty("error");
  });

  it("builds stdio and http servers and reports field errors", () => {
    const stdio = buildMcpServer({ ...draftFromServer(null), name: "Files", command: "npx", args: "-y\n server-fs \n", env: "TOKEN=abc" });
    expect(stdio).toEqual({ server: { name: "Files", mentionName: "files", description: undefined, transport: "stdio", enabled: true, command: "npx", args: ["-y", "server-fs"], env: { TOKEN: "abc" } } });
    expect(buildMcpServer({ ...draftFromServer(null), name: "", command: "" })).toEqual({ errors: { name: expect.any(String), command: expect.any(String) } });
    const http = buildMcpServer({ ...draftFromServer(null), name: "Linear", transport: "http", url: "https://mcp.linear.app/mcp", headers: "Authorization: Bearer t" });
    expect(http).toMatchObject({ server: { transport: "http", url: "https://mcp.linear.app/mcp", headers: { Authorization: "Bearer t" } } });
    expect(buildMcpServer({ ...draftFromServer(null), name: "X", transport: "http", url: "http://example.com/mcp" })).toEqual({ errors: { url: expect.stringMatching(/https/) } });
  });

  it("round-trips a saved server into a draft", () => {
    const draft = draftFromServer({ id: "s", name: "S", mentionName: "s", transport: "stdio", command: "node", args: ["a.js", "--x"], env: { K: "$keychain" }, enabled: false, createdAt: 0, updatedAt: 0 });
    expect(draft).toMatchObject({ id: "s", args: "a.js\n--x", env: "K=$keychain", enabled: false });
  });
});

describe("list helpers", () => {
  it("moves items with clamping", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a"], 3, 0)).toEqual(["a"]);
  });

  it("formats sizes, times and paths", () => {
    expect(formatBytes(1)).toBe("1 byte");
    expect(formatBytes(12_582_912)).toBe("13 MB");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    const now = Date.UTC(2026, 9, 13, 12);
    expect(formatRelativeTime(now - 10_000, now)).toBe("Just now");
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(formatRelativeTime(now - 26 * 3_600_000, now)).toBe("Yesterday");
    expect(tildePath("/Users/me/Documents/x")).toBe("~/Documents/x");
    expect(tildePath("/Applications")).toBe("/Applications");
  });
});
