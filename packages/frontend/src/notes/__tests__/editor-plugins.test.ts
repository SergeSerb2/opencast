import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createNoteExtensions } from "../editor/extensions";
import { highlightCode, languageLabel, tokensFromHighlightHtml } from "../editor/code-highlight";
import { findMatches, getFindState, replaceActiveMatch, replaceAllMatches, setFindQuery, stepFindMatch } from "../editor/find-replace";
import { showVirtualSelection } from "../editor/virtual-selection";

const editors: Editor[] = [];
function editorWith(markdown: string): Editor {
  const editor = new Editor({ extensions: createNoteExtensions(), content: markdown, contentType: "markdown" });
  editors.push(editor);
  return editor;
}
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

describe("virtual selection", () => {
  it("paints selected text and retains the range while a popover is focused", () => {
    const editor = editorWith("Select this text");
    editor.commands.setTextSelection({ from: 1, to: 7 });
    expect(editor.view.dom.querySelector(".sc-notes-virtual-selection")?.textContent).toBe("Select");
    showVirtualSelection(editor, { from: 8, to: 12 });
    expect(editor.view.dom.querySelector(".sc-notes-virtual-selection")?.textContent).toBe("this");
    showVirtualSelection(editor, null);
    expect(editor.view.dom.querySelector(".sc-notes-virtual-selection")?.textContent).toBe("Select");
    editor.commands.setTextSelection(1);
    expect(editor.view.dom.querySelector(".sc-notes-virtual-selection")).toBeNull();
  });
});

describe("find & replace", () => {
  it("finds case-insensitive matches inside textblocks", () => {
    const editor = editorWith("The cat\n\nthe **Cat** and THE dog");
    const matches = findMatches(editor.state.doc, "the");
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => editor.state.doc.textBetween(m.from, m.to))).toEqual(["The", "the", "THE"]);
    expect(findMatches(editor.state.doc, "cat").map((m) => editor.state.doc.textBetween(m.from, m.to))).toEqual(["cat", "Cat"]);
    expect(findMatches(editor.state.doc, "")).toEqual([]);
  });

  it("tracks the active match and wraps around", () => {
    const editor = editorWith("one two one two one");
    setFindQuery(editor, "one");
    expect(getFindState(editor)).toMatchObject({ active: 0 });
    stepFindMatch(editor, 1);
    stepFindMatch(editor, 1);
    expect(getFindState(editor).active).toBe(2);
    stepFindMatch(editor, 1);
    expect(getFindState(editor).active).toBe(0);
    stepFindMatch(editor, -1);
    expect(getFindState(editor).active).toBe(2);
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe("one");
  });

  it("replaces the active match, then all matches in one step", () => {
    const editor = editorWith("cat cat cat");
    setFindQuery(editor, "cat");
    expect(replaceActiveMatch(editor, "dog")).toBe(true);
    expect(editor.getMarkdown()).toBe("dog cat cat");
    expect(getFindState(editor).matches).toHaveLength(2);
    expect(replaceAllMatches(editor, "cow")).toBe(2);
    expect(editor.getMarkdown()).toBe("dog cow cow");
    editor.commands.undo();
    expect(editor.getMarkdown()).toBe("dog cat cat");
  });

  it("clears highlights with an empty query", () => {
    const editor = editorWith("abc");
    setFindQuery(editor, "b");
    expect(getFindState(editor).matches).toHaveLength(1);
    setFindQuery(editor, "");
    expect(getFindState(editor)).toMatchObject({ query: "", matches: [], active: -1 });
  });
});

describe("list item move", () => {
  it("swaps list items up and down", () => {
    const editor = editorWith("- one\n- two\n- three");
    const posOf = (text: string) => {
      let found = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text === text) found = pos;
      });
      return found;
    };
    editor.commands.setTextSelection(posOf("two") + 1);
    expect(editor.commands.moveListItem("up")).toBe(true);
    expect(editor.getMarkdown()).toBe("- two\n- one\n- three");
    expect(editor.commands.moveListItem("up")).toBe(false);
    expect(editor.commands.moveListItem("down")).toBe(true);
    expect(editor.commands.moveListItem("down")).toBe(true);
    expect(editor.getMarkdown()).toBe("- one\n- three\n- two");
    expect(editor.commands.moveListItem("down")).toBe(false);
  });

  it("moves task items and does nothing outside lists", () => {
    const editor = editorWith("- [ ] a\n- [x] b\n\nplain");
    editor.commands.setTextSelection(4);
    expect(editor.commands.moveListItem("down")).toBe(true);
    expect(editor.getMarkdown()).toBe("- [x] b\n- [ ] a\n\nplain");
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(editor.commands.moveListItem("up")).toBe(false);
  });
});

describe("code highlighting", () => {
  it("turns highlight.js HTML into ranges, counting entities as one character", () => {
    const html = '<span class="hljs-keyword">if</span> (a &lt; b &amp;&amp; <span class="hljs-string">&quot;x <span class="hljs-subst">y</span>&quot;</span>)';
    expect(tokensFromHighlightHtml(html)).toEqual([
      { from: 0, to: 2, className: "hljs-keyword" },
      { from: 16, to: 17, className: "hljs-subst" },
      { from: 13, to: 18, className: "hljs-string" },
    ]);
  });

  it("highlights known languages, detects others, and skips empty code", () => {
    expect(highlightCode('const a = "b";', "typescript").map((t) => t.className)).toEqual(expect.arrayContaining(["hljs-keyword", "hljs-string"]));
    expect(highlightCode("def f():\n    return 1", null).length).toBeGreaterThan(0);
    expect(highlightCode("   ", "typescript")).toEqual([]);
  });

  it("labels languages", () => {
    expect(languageLabel("")).toBe("Auto");
    expect(languageLabel("typescript")).toBe("TypeScript");
    expect(languageLabel("ts")).toBe("TypeScript");
    expect(languageLabel("brainfuck-ish")).toBe("brainfuck-ish");
  });
});
