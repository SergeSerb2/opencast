import { describe, expect, it } from "vitest";
import type { AICommand } from "@surgecast/protocol";
import { DEFAULT_AI_ICON } from "../ai-shared/options";
import { commandDraft, commandTags, commandUpsertParams, emptyCommandDraft, validateCommandDraft } from "./command-form";
import { ALL_TAGS, commandDeeplink, commandSections } from "./command-list";

const command = (patch: Partial<AICommand>): AICommand => ({
  id: "c1",
  name: "Reply to Email",
  prompt: "Reply to {selection}",
  creativity: "medium",
  output: "quick-ai",
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

describe("command drafts", () => {
  it("starts empty with backend defaults", () => {
    expect(emptyCommandDraft()).toMatchObject({ name: "", prompt: "", creativity: "medium", output: "quick-ai", model: "", tags: [] });
  });

  it("copies a command for editing and names duplicates", () => {
    const source = command({ icon: "envelope-16", model: "openai/gpt-5.1", reasoningEffort: "high", tags: ["Email"], highlightEdits: true });
    expect(commandDraft(source, "edit")).toEqual({
      name: "Reply to Email",
      icon: "envelope-16",
      prompt: "Reply to {selection}",
      model: "openai/gpt-5.1",
      creativity: "medium",
      output: "quick-ai",
      reasoningEffort: "high",
      highlightEdits: true,
      webSearch: false,
      tags: ["Email"],
    });
    expect(commandDraft(source, "duplicate").name).toBe("Reply to Email Copy");
  });

  it("validates the name and the prompt", () => {
    expect(validateCommandDraft({ ...emptyCommandDraft(), name: " " })).toEqual({ name: "Enter a name", prompt: "Enter a prompt" });
    expect(validateCommandDraft({ ...emptyCommandDraft('Ask {argument name=""}'), name: "Ask" })).toEqual({ prompt: "Give every argument a name" });
    expect(validateCommandDraft({ ...emptyCommandDraft("Fix {selection}"), name: "Fix" })).toEqual({});
  });

  it("builds upsert params", () => {
    const draft = { ...emptyCommandDraft("Fix {selection}"), name: "  Fix  ", tags: ["Code", " Code ", ""], reasoningEffort: "low" as const };
    expect(commandUpsertParams(draft)).toEqual({
      name: "Fix",
      prompt: "Fix {selection}",
      icon: undefined,
      model: null,
      creativity: "medium",
      output: "quick-ai",
      reasoningEffort: "low",
      highlightEdits: false,
      webSearch: false,
      tags: ["Code"],
    });
  });

  it("sends the id when editing and the default tile when the icon was cleared", () => {
    const existing = command({ icon: "envelope-16" });
    const params = commandUpsertParams({ ...commandDraft(existing, "edit"), icon: "" }, existing);
    expect(params.id).toBe("c1");
    expect(params.icon).toEqual(DEFAULT_AI_ICON);
  });

  it("lists tags once, sorted", () => {
    expect(commandTags([command({ tags: ["Writing", "Email"] }), command({ tags: ["Code", "Writing"] }), command({})])).toEqual(["Code", "Email", "Writing"]);
  });

  it("sends explicit clears for default overrides through JSON", () => {
    const existing = command({ model: "local/mock", reasoningEffort: "high" });
    const params = commandUpsertParams({ ...commandDraft(existing, "edit"), model: "", reasoningEffort: "" }, existing);
    expect(JSON.parse(JSON.stringify(params))).toMatchObject({ id: existing.id, model: null, reasoningEffort: null });
  });
});

describe("commandSections", () => {
  const commands = [
    command({ id: "b2", name: "Summarize Webpage", builtin: true }),
    command({ id: "b1", name: "Improve Writing", builtin: true }),
    command({ id: "c2", name: "Write Commit Message", tags: ["Code"] }),
    command({ id: "c1", name: "Reply to Email", tags: ["Email", "Writing"] }),
  ];

  it("groups custom before built-in commands, sorted by name", () => {
    expect(commandSections(commands, "", ALL_TAGS).map((s) => [s.title, s.items.map((i) => i.command.id)])).toEqual([
      ["Custom Commands", ["c1", "c2"]],
      ["Built-in Commands", ["b1", "b2"]],
    ]);
  });

  it("filters by tag and query, with title highlight ranges", () => {
    expect(commandSections(commands, "", "Code").flatMap((s) => s.items.map((i) => i.command.id))).toEqual(["c2"]);
    const sections = commandSections(commands, "writ", ALL_TAGS);
    expect(sections.map((s) => s.items.map((i) => i.command.id))).toEqual([["c2", "c1"], ["b1"]]);
    expect(sections[0].items[0].ranges).toEqual([[0, 4]]);
  });

  it("drops empty sections", () => {
    expect(commandSections(commands, "zzz", ALL_TAGS)).toEqual([]);
  });
});

describe("commandDeeplink", () => {
  it("links to the command by id", () => {
    expect(commandDeeplink({ id: "fix spelling" })).toBe("surgecast://ai-commands/fix%20spelling");
  });
});
