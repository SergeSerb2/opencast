import { Extension, type Editor } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, type Selection } from "@tiptap/pm/state";
import type { Node } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const key = new PluginKey<DecorationSet>("notesVirtualSelection");

function selectionDecorations(doc: Node, selection: Selection): DecorationSet {
  if (selection.empty) return DecorationSet.empty;
  const decoration = selection instanceof NodeSelection
    ? Decoration.node(selection.from, selection.to, { class: "sc-notes-virtual-block-selection" })
    : Decoration.inline(selection.from, selection.to, { class: "sc-notes-virtual-selection" });
  return DecorationSet.create(doc, [decoration]);
}

/**
 * Paint the editor's selection with --accent-40 (§7.5) while the browser's
 * native highlight is transparent. Popovers can retain an explicit range.
 */
export const VirtualSelection = Extension.create({
  name: "notesVirtualSelection",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => selectionDecorations(state.doc, state.selection),
          apply(tr, decorations) {
            const range = tr.getMeta(key) as { from: number; to: number } | null | undefined;
            if (range === null) return selectionDecorations(tr.doc, tr.selection);
            if (range) return DecorationSet.create(tr.doc, [Decoration.inline(range.from, range.to, { class: "sc-notes-virtual-selection" })]);
            if (tr.docChanged || tr.selectionSet) return selectionDecorations(tr.doc, tr.selection);
            return decorations;
          },
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});

export function showVirtualSelection(editor: Editor, range: { from: number; to: number } | null): void {
  if (range && range.from === range.to) range = null;
  editor.view.dispatch(editor.state.tr.setMeta(key, range).setMeta("addToHistory", false));
}
