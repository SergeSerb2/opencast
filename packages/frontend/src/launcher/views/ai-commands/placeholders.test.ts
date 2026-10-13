import { describe, expect, it } from "vitest";
import { insertPlaceholder, PROMPT_PLACEHOLDERS, promptArguments, promptProblem, tokenizePrompt, typedPlaceholderTrigger } from "./placeholders";

const option = (id: string) => PROMPT_PLACEHOLDERS.find((p) => p.id === id)!;

describe("insertPlaceholder", () => {
  it("inserts at the caret and moves the caret after the placeholder", () => {
    expect(insertPlaceholder("Fix: ", 5, 5, option("selection"))).toEqual({ text: "Fix: {selection}", caret: 16 });
  });

  it("replaces the selection", () => {
    expect(insertPlaceholder("Use THIS text", 4, 8, option("clipboard"))).toEqual({ text: "Use {clipboard} text", caret: 15 });
  });

  it("replaces the typed brace and puts the caret inside the name quotes", () => {
    const edit = insertPlaceholder("Ask {", 4, 5, option("argument"));
    expect(edit.text).toBe('Ask {argument name=""}');
    expect(edit.text.slice(0, edit.caret)).toBe('Ask {argument name="');
  });
});

describe("typedPlaceholderTrigger", () => {
  it("detects a single typed brace", () => {
    expect(typedPlaceholderTrigger("Hello ", "Hello {", 7)).toBe(6);
    expect(typedPlaceholderTrigger("ab", "a{b", 2)).toBe(1);
  });

  it("ignores pastes, deletions and other characters", () => {
    expect(typedPlaceholderTrigger("", "{selection}", 11)).toBeNull();
    expect(typedPlaceholderTrigger("a{", "a", 1)).toBeNull();
    expect(typedPlaceholderTrigger("a", "ab", 2)).toBeNull();
  });
});

describe("tokenizePrompt", () => {
  it("splits recognized placeholders from text and leaves other braces literal", () => {
    expect(tokenizePrompt('Reply in {argument name="Tone"} to: {selection | trim} {"json": 1}')).toEqual([
      { kind: "text", text: "Reply in " },
      { kind: "placeholder", text: '{argument name="Tone"}', key: "argument", invalid: false },
      { kind: "text", text: " to: " },
      { kind: "placeholder", text: "{selection | trim}", key: "selection", invalid: false },
      { kind: "text", text: ' {"json": 1}' },
    ]);
  });

  it("marks invalid placeholders", () => {
    expect(tokenizePrompt("{clipboard | shout}")).toEqual([{ kind: "placeholder", text: "{clipboard | shout}", key: "clipboard", invalid: true }]);
  });
});

describe("promptArguments", () => {
  it("collects named, unnamed and dropdown arguments once each", () => {
    const args = promptArguments('{argument name="Topic"} and {argument name="Tone" options="Formal, Casual" default="Casual"} {argument} {argument name="Topic"}');
    expect(args).toEqual([
      { name: "Topic", type: "text", placeholder: "Topic", required: true, default: undefined, data: undefined },
      { name: "Tone", type: "dropdown", placeholder: "Casual", required: false, default: "Casual", data: [{ title: "Formal", value: "Formal" }, { title: "Casual", value: "Casual" }] },
      { name: "Argument 3", type: "text", placeholder: "Argument 3", required: true, default: undefined, data: undefined },
    ]);
  });

  it("keeps quoted pipes inside options", () => {
    expect(promptArguments('{argument name="Sep" options="a|b,c"}')[0].data).toEqual([{ title: "a|b", value: "a|b" }, { title: "c", value: "c" }]);
  });
});

describe("promptProblem", () => {
  it("accepts valid prompts", () => {
    expect(promptProblem('Summarize {browser-tab format="markdown" | raw} for {argument name="Audience" default="me"}')).toBeUndefined();
  });

  it("requires a prompt", () => {
    expect(promptProblem("  \n")).toBe("Enter a prompt");
  });

  it("rejects empty argument and snippet names", () => {
    expect(promptProblem('Ask {argument name=""}')).toBe("Give every argument a name");
    expect(promptProblem("{snippet}")).toBe("Add the name of the snippet to insert");
  });

  it("rejects unknown modifiers, attributes and browser fields", () => {
    expect(promptProblem("{selection | shout}")).toBe('Unknown modifier "shout" in {selection | shout}');
    expect(promptProblem('{selection name="x"}')).toBe(`{selection} doesn't support "name"`);
    expect(promptProblem("{browser-tab.links}")).toMatch(/^Use \{browser-tab\}/);
    expect(promptProblem('{browser-tab format="pdf"}')).toBe("Browser tab format must be text, markdown or html");
    expect(promptProblem('{clipboard offset="1" offset="2"}')).toBe('{clipboard offset="1" offset="2"} sets "offset" twice');
  });

  it("checks argument defaults, conflicts and the argument limit", () => {
    expect(promptProblem('{argument name="Tone" options="A,B" default="C"}')).toBe('The default of "Tone" must be one of its options');
    expect(promptProblem('{argument name="X"} {argument name="X" default="y"}')).toBe('Argument "X" is used with different settings');
    expect(promptProblem('{argument name="A"} {argument name="B"} {argument name="C"} {argument name="D"}')).toBe("Use at most 3 different arguments");
    expect(promptProblem('{argument name="A"} {argument name="A"} {argument name="B"} {argument name="C"}')).toBeUndefined();
  });
});
