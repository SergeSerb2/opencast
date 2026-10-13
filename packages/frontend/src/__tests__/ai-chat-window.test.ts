import { describe, expect, it } from "vitest";
import type { AIChat } from "@opencast/protocol";
import { flattenGroups, groupChats, timeGroupLabel } from "../ai-chat/model/chat-groups";
import { formatThoughtDuration, formatTokens, toolCallLabel, usageSummary } from "../ai-chat/lib/format";
import { resolveModelRef } from "../ai-chat/model/models";
import { revealStep } from "../ai-chat/transcript/useSmoothText";
import { parseChatRoute } from "../ai-chat/window/useChatRoutes";

const now = new Date(2026, 9, 13, 15, 0).getTime();
const day = 86_400_000;
const chat = (id: string, updatedAt: number, extra: Partial<AIChat> = {}): AIChat => ({ id, title: id, source: "chat", createdAt: updatedAt, updatedAt, ...extra });

describe("groupChats", () => {
  const chats = [
    chat("today", now - 3_600_000),
    chat("yesterday", now - day),
    chat("week", now - 4 * day),
    chat("old", now - 90 * day),
    chat("pinned", now - 50 * day, { pinned: true }),
    chat("filed", now - 2 * day, { folderId: "f1" }),
    chat("lost", now - 2 * day, { folderId: "deleted-folder" }),
    chat("archived", now, { archived: true }),
  ];
  const groups = groupChats(chats, [{ id: "f1", name: "Work", createdAt: 0 }], now);

  it("separates pinned, folders, recent time groups and the archive", () => {
    expect(groups.pinned.map((c) => c.id)).toEqual(["pinned"]);
    expect(groups.folders.map((f) => [f.folder.name, f.chats.map((c) => c.id)])).toEqual([["Work", ["filed"]]]);
    expect(groups.recent.map((g) => [g.label, g.chats.map((c) => c.id)])).toEqual([
      [undefined, ["today"]],
      ["Yesterday", ["yesterday"]],
      ["Previous 7 Days", ["lost", "week"]],
      ["Older", ["old"]],
    ]);
    expect(groups.archived.map((c) => c.id)).toEqual(["archived"]);
  });

  it("flattens in sidebar order, skipping collapsed sections", () => {
    expect(flattenGroups(groups).map((c) => c.id)).toEqual(["pinned", "filed", "today", "yesterday", "lost", "week", "old"]);
    expect(flattenGroups(groups, new Set(["pinned", "folder:f1"])).map((c) => c.id)[0]).toBe("today");
  });

  it("labels by calendar day", () => {
    expect(timeGroupLabel(now - 14 * 3_600_000, now)).toBeUndefined();
    expect(timeGroupLabel(now - 20 * day, now)).toBe("Previous 30 Days");
  });
});

describe("parseChatRoute", () => {
  it("handles deeplink routes", () => {
    expect(parseChatRoute("add-text", { text: "hello" })).toEqual({ kind: "text", text: "hello" });
    expect(parseChatRoute("append-text", { text: "  " })).toEqual({ kind: "none" });
    expect(parseChatRoute("add-attachment", { filepath: "/tmp/a.png" })).toEqual({ kind: "attachment", path: "/tmp/a.png" });
    expect(parseChatRoute("new", undefined)).toEqual({ kind: "new", presetId: undefined });
  });

  it("opens chats by id", () => {
    expect(parseChatRoute("chat-123", undefined)).toEqual({ kind: "chat", chatId: "chat-123" });
    expect(parseChatRoute("/chat/abc/", undefined)).toEqual({ kind: "chat", chatId: "abc" });
  });

  it("understands launcher hand-offs", () => {
    expect(parseChatRoute(undefined, { prompt: " Hi ", presetId: "p" })).toEqual({ kind: "prompt", prompt: "Hi", presetId: "p" });
    expect(parseChatRoute("", { aiCommandId: "improve-writing" })).toEqual({ kind: "command", commandId: "improve-writing", arguments: undefined });
    expect(parseChatRoute(undefined, { presetId: "p" })).toEqual({ kind: "new", presetId: "p" });
    expect(parseChatRoute(undefined, null)).toEqual({ kind: "none" });
  });
});

describe("formatting", () => {
  it("formats reasoning time, tokens and usage", () => {
    expect(formatThoughtDuration(400)).toBe("Thought for 1s");
    expect(formatThoughtDuration(72_000)).toBe("Thought for 1m 12s");
    expect(formatThoughtDuration(120_000)).toBe("Thought for 2m");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1840)).toBe("1.8k");
    expect(formatTokens(12_400)).toBe("12k");
    expect(usageSummary({ inputTokens: 1840, outputTokens: 402, reasoningTokens: 0 })).toBe("1.8k in · 402 out tokens");
    expect(usageSummary(undefined)).toBeUndefined();
  });

  it("labels tool activity by status", () => {
    expect(toolCallLabel("Search the Web", "web.search", "running")).toBe("Search the Web…");
    expect(toolCallLabel(undefined, "mcp:linear.create_issue", "awaiting-confirmation")).toBe("create issue — waiting for approval");
    expect(toolCallLabel("Create Issue", "x", "rejected")).toBe("Create Issue — declined");
  });

  it("reveals streamed text faster when it falls behind", () => {
    expect(revealStep(1)).toBe(2);
    expect(revealStep(80)).toBe(10);
  });
});

describe("resolveModelRef", () => {
  const models = [
    { ref: "a/x", providerId: "a", providerName: "A", modelId: "x", name: "X", capabilities: {} },
    { ref: "b/y", providerId: "b", providerName: "B", modelId: "y", name: "Y", capabilities: {} },
  ];
  it("prefers the first available preference, then the first model", () => {
    expect(resolveModelRef(models, "gone/z", "b/y")).toBe("b/y");
    expect(resolveModelRef(models, undefined, null)).toBe("a/x");
    expect(resolveModelRef([], "a/x")).toBeUndefined();
  });
});
