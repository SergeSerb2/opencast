import { Extension, type AnyExtension, type NodeViewRenderer } from "@tiptap/core";
import { CodeBlock, type CodeBlockOptions } from "@tiptap/extension-code-block";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { codeHighlightPlugin } from "./code-highlight";
import { FindReplace } from "./find-replace";
import { ListItemMove } from "./list-move";
import { MarkdownPaste } from "./markdown-paste";
import { VirtualSelection } from "./virtual-selection";

export interface NoteExtensionOptions {
  /** React node view for code blocks (language menu, copy button); omitted headless. */
  codeBlockView?: NodeViewRenderer;
  /** ⌘L: open the link popover for the selection. */
  onLinkShortcut?: () => void;
}

const NoteCodeBlock = CodeBlock.extend<CodeBlockOptions & { view?: NodeViewRenderer }>({
  addOptions() {
    return { ...this.parent!(), view: undefined };
  },
  addNodeView() {
    return this.options.view ?? null;
  },
  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), codeHighlightPlugin(this.name)];
  },
});

function placeholderText({ node, editor }: { node: { type: { name: string }; attrs: Record<string, unknown> }; editor: { isEmpty: boolean } }): string {
  if (node.type.name === "heading") return `Heading ${node.attrs.level as number}`;
  return editor.isEmpty ? "Start writing…" : "";
}

/**
 * The Notes schema and behavior, shared by the window's editor and the
 * Markdown conversions/tests. Content round-trips through Markdown.
 */
export function createNoteExtensions(options: NoteExtensionOptions = {}): AnyExtension[] {
  const { codeBlockView, onLinkShortcut } = options;
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https", HTMLAttributes: { target: null, rel: "noopener noreferrer" } },
      dropcursor: { color: false, width: 2, class: "sc-notes-drop-cursor" },
      // A trailing paragraph would change the Markdown of notes that end in a block.
      trailingNode: false,
    }),
    NoteCodeBlock.configure({ view: codeBlockView, languageClassPrefix: "language-", enableTabIndentation: true, tabSize: 2 }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: placeholderText, includeChildren: false }),
    Markdown.configure({ indentation: { style: "space", size: 2 } }),
    FindReplace,
    MarkdownPaste,
    ListItemMove,
    VirtualSelection,
  ];
  if (onLinkShortcut) {
    extensions.push(
      Extension.create({
        name: "notesLinkShortcut",
        addKeyboardShortcuts: () => ({
          "Mod-l": () => {
            onLinkShortcut();
            return true;
          },
        }),
      }),
    );
  }
  return extensions;
}
