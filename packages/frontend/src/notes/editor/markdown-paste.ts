import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { looksLikeMarkdown } from "../lib/text";

/**
 * Paste plain-text Markdown as rich content. HTML copied from an editor
 * (ProseMirror slices) and text pasted into code blocks keep the default path.
 */
export const MarkdownPaste = Extension.create({
  name: "notesMarkdownPaste",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("notesMarkdownPaste"),
        props: {
          handlePaste(view, event) {
            const data = event.clipboardData;
            const text = data?.getData("text/plain");
            if (!data || !text) return false;
            if (data.getData("text/html").includes("data-pm-slice")) return false;
            if (view.state.selection.$from.parent.type.spec.code) return false;
            if (!looksLikeMarkdown(text)) return false;
            return editor.commands.insertContent(text, { contentType: "markdown" });
          },
        },
      }),
    ];
  },
});
