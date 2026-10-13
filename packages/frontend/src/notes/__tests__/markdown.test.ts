import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createNoteExtensions } from "../editor/extensions";
import { docToMarkdown, docToPlainText, htmlDocument, markdownToDoc, markdownToHtml, markdownToPlainText, titleFromMarkdown } from "../lib/convert";

const editors: Editor[] = [];
function editorWith(markdown: string): Editor {
  const editor = new Editor({ extensions: createNoteExtensions(), content: markdown, contentType: "markdown" });
  editors.push(editor);
  return editor;
}
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

/** Every node and mark the Notes editor supports, in the Markdown it stores. */
const SAMPLES: Record<string, string> = {
  "heading 1": "# Title",
  "heading 2": "## Section",
  "heading 3": "### Detail",
  paragraph: "Just a paragraph.",
  "soft line break": "First line\nsecond line",
  "empty paragraphs": "Above\n\n\n\nBelow",
  bold: "Some **bold** text",
  italic: "Some *italic* text",
  underline: "Some ++underlined++ text",
  strike: "Some ~~struck~~ text",
  "inline code": "Run `pnpm build` now",
  link: "Read [the docs](https://example.com/docs) first",
  "nested marks": "A ***bold italic*** word",
  "bullet list": "- one\n- two\n  - nested\n    - deeper",
  "ordered list": "1. first\n2. second\n3. third",
  "ordered list with start": "3. third\n4. fourth",
  "task list": "- [ ] todo\n- [x] done\n  - [ ] nested todo",
  blockquote: "> quoted\n> lines",
  "code block": "```ts\nconst a = 1;\n\nconsole.log(a);\n```",
  "code block without language": "```\nplain code\n```",
  "horizontal rule": "Above\n\n---\n\nBelow",
};

describe("Markdown round-trip", () => {
  for (const [name, markdown] of Object.entries(SAMPLES)) {
    it(`keeps ${name} through the editor`, () => {
      expect(editorWith(markdown).getMarkdown()).toBe(markdown);
    });
    it(`keeps ${name} through the headless converter`, () => {
      expect(docToMarkdown(markdownToDoc(markdown))).toBe(markdown);
    });
  }

  it("keeps a full note with every block type", () => {
    // Adjacent ordered lists would merge into one list in Markdown, so the "start" sample stays out.
    const note = Object.entries(SAMPLES)
      .filter(([name]) => name !== "ordered list with start")
      .map(([, markdown]) => markdown)
      .join("\n\n");
    expect(editorWith(note).getMarkdown()).toBe(note);
  });

  it("parses each sample into the expected node", () => {
    const first = (markdown: string) => markdownToDoc(markdown).content?.[0];
    expect(first(SAMPLES["heading 2"])).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(first(SAMPLES["task list"])).toMatchObject({
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: false } },
        { type: "taskItem", attrs: { checked: true } },
      ],
    });
    expect(first(SAMPLES["code block"])).toMatchObject({ type: "codeBlock", attrs: { language: "ts" } });
    expect(first(SAMPLES["ordered list with start"])).toMatchObject({ type: "orderedList", attrs: { start: 3 } });
    expect(first(SAMPLES.blockquote)).toMatchObject({ type: "blockquote" });
    expect(markdownToDoc(SAMPLES["horizontal rule"]).content?.[1]).toMatchObject({ type: "horizontalRule" });
    const marks = (markdownToDoc(SAMPLES.link).content?.[0].content ?? []).flatMap((node) => node.marks ?? []);
    expect(marks).toContainEqual(expect.objectContaining({ type: "link", attrs: expect.objectContaining({ href: "https://example.com/docs" }) }));
  });

  it("starts an empty note as one empty paragraph", () => {
    const editor = editorWith("");
    expect(editor.getMarkdown()).toBe("");
    expect(editor.state.doc.childCount).toBe(1);
  });
});

describe("Markdown input rules", () => {
  // Input rules run on the next tick after the text lands.
  const typed = async (text: string) => {
    const editor = editorWith("");
    editor.commands.insertContent(text, { applyInputRules: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return editor;
  };

  it("turns '# ' into a heading", async () => {
    expect((await typed("# ")).state.doc.firstChild?.type.name).toBe("heading");
  });
  it("turns '- ' into a bullet list", async () => {
    expect((await typed("- ")).state.doc.firstChild?.type.name).toBe("bulletList");
  });
  it("turns '1. ' into an ordered list", async () => {
    expect((await typed("1. ")).state.doc.firstChild?.type.name).toBe("orderedList");
  });
  it("turns '[] ' into a task list", async () => {
    expect((await typed("[] ")).state.doc.firstChild?.type.name).toBe("taskList");
  });
  it("turns '> ' into a blockquote", async () => {
    expect((await typed("> ")).state.doc.firstChild?.type.name).toBe("blockquote");
  });
  it("turns ``` into a code block", async () => {
    expect((await typed("``` ")).state.doc.firstChild?.type.name).toBe("codeBlock");
  });
});

describe("pasting Markdown", () => {
  function paste(editor: Editor, text: string, html = ""): boolean {
    const event = { clipboardData: { getData: (type: string) => (type === "text/plain" ? text : type === "text/html" ? html : "") }, preventDefault() {} } as unknown as ClipboardEvent;
    return Boolean(editor.view.someProp("handlePaste", (handler) => handler(editor.view, event, editor.state.doc.slice(0, 0))));
  }

  it("parses Markdown text into rich content", () => {
    const editor = editorWith("");
    expect(paste(editor, "## Pasted\n\n- [x] item")).toBe(true);
    expect(editor.getMarkdown()).toBe("## Pasted\n\n- [x] item");
  });

  it("leaves ordinary prose and editor slices to the default paste", () => {
    const editor = editorWith("");
    expect(paste(editor, "Just some words\nover two lines")).toBe(false);
    expect(paste(editor, "# Heading", '<h1 data-pm-slice="1 1 []">Heading</h1>')).toBe(false);
  });

  it("pastes into code blocks verbatim", () => {
    const editor = editorWith("```\ncode\n```");
    editor.commands.setTextSelection(3);
    expect(paste(editor, "# not a heading")).toBe(false);
  });
});

describe("conversions", () => {
  it("derives the title from the first line of the first block", () => {
    expect(titleFromMarkdown("# Launch plan\n\nBody")).toBe("Launch plan");
    expect(titleFromMarkdown("- [ ] **Buy** milk\n- eggs")).toBe("Buy milk");
    expect(titleFromMarkdown("First line\nsecond line")).toBe("First line");
    expect(titleFromMarkdown("```js\nconst a = 1;\n```")).toBe("const a = 1;");
    expect(titleFromMarkdown("")).toBe("Untitled");
    expect(titleFromMarkdown("   \n\n")).toBe("Untitled");
  });

  it("renders plain text without Markdown syntax", () => {
    const markdown = "# Title\n\nSome **bold** and [a link](https://x.y).\n\n- one\n  - two\n\n3. three\n\n- [x] done\n\n> quote\n\n```\ncode\n```\n\n---";
    expect(markdownToPlainText(markdown)).toBe(["Title", "Some bold and a link.", "- one", "  - two", "3. three", "[x] done", "quote", "code", "---"].join("\n"));
    expect(docToPlainText({ type: "doc", content: [] })).toBe("");
  });

  it("renders HTML and wraps it in an escaped document", () => {
    expect(markdownToHtml("# Hi\n\n- [x] done")).toContain("<h1>Hi</h1>");
    const doc = htmlDocument("Tom & Jerry <3", "<p>x</p>");
    expect(doc).toContain("<title>Tom &amp; Jerry &lt;3</title>");
    expect(doc).toContain("<body><p>x</p></body>");
  });
});
