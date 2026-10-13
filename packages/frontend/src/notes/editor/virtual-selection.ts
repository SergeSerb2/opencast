import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const key = new PluginKey<DecorationSet>("notesVirtualSelection");

/**
 * Keeps a selection visible while focus is in a popover (link editor), the way
 * Raycast paints its "virtual selection" with --accent-40 (§7.5).
 */
export const VirtualSelection = Extension.create({
  name: "notesVirtualSelection",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, decorations) {
            const range = tr.getMeta(key) as { from: number; to: number } | null | undefined;
            if (range === null) return DecorationSet.empty;
            if (range) return DecorationSet.create(tr.doc, [Decoration.inline(range.from, range.to, { class: "sc-notes-virtual-selection" })]);
            return decorations.map(tr.mapping, tr.doc);
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
