import { describe, expect, it } from "vitest";
import type { AIToolInfo } from "@opencast/protocol";
import { applyCommandPrompt, placeholderKinds } from "../ai-chat/model/command-prompt";
import { findTrigger, mentionedToolsets, mentionSlug, replaceTrigger, segmentMentions, toolsetsFromTools } from "../ai-chat/model/mentions";

const tool = (name: string, toolset: string, toolsetTitle: string): AIToolInfo => ({ name, title: name, description: "", toolset, toolsetTitle, inputSchema: {} });
const toolsets = toolsetsFromTools([
  tool("system.notification", "builtin", "System"),
  tool("mcp:linear.create_issue", "mcp:linear", "Linear"),
  tool("ext:github.search", "ext:github", "GitHub"),
  tool("ext:github.create", "ext:github", "GitHub"),
  tool("web.search", "web", "Web Search"),
  tool("ext:gcal.events", "ext:gcal", "Google Calendar"),
  tool("mcp:gh.repos", "mcp:gh", "GitHub"),
]);

describe("toolsetsFromTools", () => {
  it("groups by toolset in web → extensions → MCP → built-in order with unique mentions", () => {
    expect(toolsets.map((t) => [t.id, t.mention, t.tools.length])).toEqual([
      ["web", "web", 1],
      ["ext:github", "github", 2],
      ["ext:gcal", "google-calendar", 1],
      ["mcp:gh", "github-2", 1],
      ["mcp:linear", "linear", 1],
      ["builtin", "system", 1],
    ]);
  });

  it("slugs titles", () => {
    expect(mentionSlug("Café Notes!")).toBe("cafe-notes");
    expect(mentionSlug("***")).toBe("tools");
  });
});

describe("findTrigger", () => {
  it("finds an @mention being typed at the caret", () => {
    expect(findTrigger("Ask @git", 8)).toEqual({ kind: "@", query: "git", start: 4, end: 8 });
    expect(findTrigger("@", 1)).toEqual({ kind: "@", query: "", start: 0, end: 1 });
    expect(findTrigger("mail me@example", 15)).toBeNull();
    expect(findTrigger("Ask @git now", 12)).toBeNull();
  });

  it("only treats / as a command at the start", () => {
    expect(findTrigger("/impr", 5)).toEqual({ kind: "/", query: "impr", start: 0, end: 5 });
    expect(findTrigger("  /fix", 6)).toMatchObject({ kind: "/", query: "fix" });
    expect(findTrigger("a/b", 3)).toBeNull();
    expect(findTrigger("text /fix", 9)).toBeNull();
  });

  it("replaces the trigger and places the caret after a space", () => {
    expect(replaceTrigger("Ask @gi please", { kind: "@", query: "gi", start: 4, end: 7 }, "@github")).toEqual({ text: "Ask @github please", caret: 12 });
    expect(replaceTrigger("@w", { kind: "@", query: "w", start: 0, end: 2 }, "@web")).toEqual({ text: "@web ", caret: 5 });
  });
});

describe("mentions in text", () => {
  it("lists mentioned toolsets once, case-insensitively", () => {
    expect(mentionedToolsets("@GitHub find bugs, then ask @web and @github again (@linear)", toolsets).map((t) => t.id)).toEqual(["ext:github", "web", "mcp:linear"]);
    expect(mentionedToolsets("email me@github.com", toolsets)).toEqual([]);
  });

  it("segments known mentions for highlighting", () => {
    expect(segmentMentions("Use @web and @nope", toolsets).map((s) => [s.text, Boolean(s.mention)])).toEqual([
      ["Use ", false],
      ["@web", true],
      [" and @nope", false],
    ]);
  });
});

describe("applyCommandPrompt", () => {
  const now = new Date(2026, 9, 13, 9, 30);

  it("puts the composer text into {selection} and the first argument", () => {
    expect(applyCommandPrompt("Fix:\n\n{selection}", { input: "teh cat", now })).toEqual({ ok: true, prompt: "Fix:\n\nteh cat" });
    expect(applyCommandPrompt('Translate {argument name="text"} to {argument name="lang" default="French"}', { input: "hello", now })).toEqual({ ok: true, prompt: "Translate hello to French" });
  });

  it("rejects required arguments the composer cannot supply", () => {
    expect(applyCommandPrompt('Translate {argument name="text"} to {argument name="language"}', { input: "hello", now })).toEqual({ ok: false, unsupported: ['argument "language"'] });
    expect(applyCommandPrompt('{argument} {argument}', { input: "hello", now })).toEqual({ ok: false, unsupported: ['argument "Argument 2"'] });
    expect(applyCommandPrompt('{argument name="text"}', { input: "", now })).toEqual({ ok: false, unsupported: ['argument "text"'] });
    expect(applyCommandPrompt('{argument name="text"} {argument name="text"}', { input: "hello", now })).toEqual({ ok: true, prompt: "hello hello" });
  });

  it("rejects clipboard history offsets instead of using the current clipboard", () => {
    expect(applyCommandPrompt('{clipboard offset="2"}', { input: "", clipboard: "current", now })).toEqual({ ok: false, unsupported: ["clipboard offset"] });
    expect(applyCommandPrompt('{clipboard offset="0"}', { input: "", clipboard: "current", now })).toEqual({ ok: true, prompt: "current" });
  });

  it.each(["date", "datetime", "time", "day"])("rejects unsupported %s formats and offsets", (kind) => {
    for (const attrs of ['format="yyyy-MM-dd"', 'offset="+1d"', 'format="yyyy-MM-dd" offset="+1d"']) {
      expect(applyCommandPrompt(`{${kind} ${attrs}}`, { input: "", now })).toEqual({ ok: false, unsupported: [`${kind} format or offset`] });
    }
  });

  it("appends the input when the template has no input placeholder", () => {
    expect(applyCommandPrompt("Write a haiku.", { input: "about rain", now })).toEqual({ ok: true, prompt: "Write a haiku.\n\nabout rain" });
    expect(applyCommandPrompt("Write a haiku.", { input: "  ", now })).toEqual({ ok: true, prompt: "Write a haiku." });
  });

  it("applies modifiers and local context", () => {
    expect(applyCommandPrompt("{selection | uppercase} from {focused-app}", { input: "hi", focusedApp: "Mail", now })).toEqual({ ok: true, prompt: "HI from Mail" });
    expect(applyCommandPrompt("Clip: {clipboard}", { input: "", clipboard: "copied", now })).toEqual({ ok: true, prompt: "Clip: copied" });
  });

  it("reports context the chat cannot provide", () => {
    expect(applyCommandPrompt('{browser-tab.content format="markdown"} {clipboard}', { input: "", now })).toEqual({ ok: false, unsupported: ["browser-tab", "clipboard"] });
    expect(placeholderKinds('A {selection | raw} {clipboard offset="1"} {unknown}')).toEqual(["selection", "clipboard"]);
  });
});
