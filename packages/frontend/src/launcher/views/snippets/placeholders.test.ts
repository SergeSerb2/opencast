import { describe, expect, it } from "vitest";
import { filterPlaceholderOptions, insertPlaceholder, placeholderOptions, placeholderQueryAt, snippetReference, templateArgumentNames, tokenizeTemplate, validateTemplate } from "./placeholders";
import { snippetPayload, validateSnippetDraft } from "./snippet-validation";

describe("placeholderOptions", () => {
  it("offers cursor and snippet references in snippets, selection in quicklinks", () => {
    const snippet = placeholderOptions("snippet").map((o) => o.id);
    const quicklink = placeholderOptions("quicklink").map((o) => o.id);
    expect(snippet).toContain("cursor");
    expect(snippet).toContain("snippet");
    expect(snippet).not.toContain("selection");
    expect(quicklink).toContain("selection");
    expect(quicklink).toContain("snippet");
    expect(quicklink).not.toContain("cursor");
    expect(snippet.slice(-6)).toEqual(["date", "time", "datetime", "day", "date-format", "date-locale"]);
  });

  it("filters by title or inserted keyword", () => {
    const options = placeholderOptions("snippet");
    expect(filterPlaceholderOptions(options, "clip").map((o) => o.id)).toEqual(["clipboard"]);
    expect(filterPlaceholderOptions(options, "date").map((o) => o.id)).toEqual(["date", "datetime", "date-format", "date-locale"]);
    expect(filterPlaceholderOptions(options, "")).toHaveLength(options.length);
  });
});

describe("template composition limits", () => {
  it("enforces one cursor without modifiers and valid context", () => {
    expect(validateTemplate("{cursor}{CURSOR}", "snippet")).toMatch(/one cursor/);
    expect(validateTemplate("{cursor | trim}", "snippet")).toMatch(/modifiers/);
    expect(validateTemplate("{cursor}", "quicklink")).toMatch(/only in snippets/);
    expect(validateTemplate("{selection}", "snippet")).toMatch(/only in quicklinks/);
  });

  it("counts unnamed positions separately but shares named arguments", () => {
    expect(validateTemplate("{argument}{argument}{argument}{argument}", "snippet")).toMatch(/three/);
    expect(validateTemplate('{argument name="A"}{argument name="A"}{argument name="B"}{argument name="C"}', "snippet")).toBeUndefined();
    expect(validateTemplate('{ARGUMENT NAME="A"}{argument name="B"}{argument name="C"}{argument name="D"}', "snippet")).toMatch(/three/);
    expect(validateTemplate("{query}{customer}{city}{country}", "quicklink")).toMatch(/three/);
    expect(validateTemplate("{literal}{braces}{stay}{unchanged}", "snippet")).toBeUndefined();
  });
});

describe("placeholderQueryAt", () => {
  it("finds the unfinished placeholder before the caret", () => {
    expect(placeholderQueryAt("Hello {cli", 10)).toEqual({ start: 6, query: "cli" });
    expect(placeholderQueryAt("Hello {", 7)).toEqual({ start: 6, query: "" });
  });

  it("ignores closed placeholders and line breaks", () => {
    expect(placeholderQueryAt("Hi {date} there", 15)).toBeNull();
    expect(placeholderQueryAt("{date\nmore", 10)).toBeNull();
    expect(placeholderQueryAt("plain text", 5)).toBeNull();
  });
});

describe("insertPlaceholder", () => {
  it("replaces the typed query and puts the caret after the placeholder", () => {
    expect(insertPlaceholder("Hi {cl!", 3, 6, "{clipboard}")).toEqual({ text: "Hi {clipboard}!", selection: [14, 14] });
  });

  it("selects the first quoted value so it can be typed over", () => {
    const result = insertPlaceholder("{", 0, 1, '{argument name="Argument"}');
    expect(result.text).toBe('{argument name="Argument"}');
    expect(result.text.slice(...result.selection)).toBe("Argument");
  });
});

describe("tokenizeTemplate", () => {
  it("splits text and placeholders, keeping braces inside quotes", () => {
    const tokens = tokenizeTemplate('Hi {argument name="a}b"} at {date format="yyyy"}!');
    expect(tokens.map((t) => [t.kind, t.text])).toEqual([
      ["text", "Hi "],
      ["placeholder", '{argument name="a}b"}'],
      ["text", " at "],
      ["placeholder", '{date format="yyyy"}'],
      ["text", "!"],
    ]);
    expect(tokens[1]).toMatchObject({ keyword: "argument", known: true });
  });

  it("marks unknown keywords", () => {
    expect(tokenizeTemplate("{bogus}")[0]).toMatchObject({ kind: "placeholder", keyword: "bogus", known: false });
    expect(tokenizeTemplate("{query:default}")[0]).toMatchObject({ keyword: "query", known: true });
  });
});

describe("templateArgumentNames", () => {
  it("lists distinct argument names in order", () => {
    expect(templateArgumentNames('{argument name="to"} {query} {argument name="to"} {argument}')).toEqual(["to", "query", "argument"]);
  });
});

describe("snippetReference", () => {
  it("escapes quotes", () => {
    expect(snippetReference('Say "hi"')).toBe('{snippet name="Say \\"hi\\""}');
  });
});

describe("validateSnippetDraft", () => {
  const draft = { name: "Sig", text: "Best", keyword: "", tags: [], icon: "blank-document-16" };

  it("requires a name and text", () => {
    expect(validateSnippetDraft({ ...draft, name: " ", text: "" }, [])).toEqual({ name: "Name is required", text: "Snippet text is required" });
  });

  it("rejects spaces, long and duplicate keywords", () => {
    expect(validateSnippetDraft({ ...draft, keyword: "a b" }, []).keyword).toMatch(/spaces/);
    expect(validateSnippetDraft({ ...draft, keyword: "k".repeat(31) }, []).keyword).toMatch(/30/);
    expect(validateSnippetDraft({ ...draft, keyword: ";sig" }, [{ id: "other", keyword: ";sig" }]).keyword).toMatch(/Another snippet/);
    expect(validateSnippetDraft({ ...draft, keyword: ";sig" }, [{ id: "self", keyword: ";sig" }], "self")).toEqual({});
  });

  it("sends an empty keyword so updates clear it", () => {
    expect(snippetPayload({ ...draft, name: " Sig ", keyword: "  " })).toEqual({ name: "Sig", text: "Best", keyword: "", tags: [], icon: "blank-document-16" });
  });
});
