import { Extension, type CommandProps } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

const ITEM_TYPES = new Set(["listItem", "taskItem"]);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    notesListMove: {
      /** Swap the list item around the selection with its previous or next sibling. */
      moveListItem: (direction: "up" | "down") => ReturnType;
    };
  }
}

function moveListItem(direction: "up" | "down") {
  return ({ state, tr, dispatch }: CommandProps): boolean => {
    const { $from, from, to } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      const item = $from.node(depth);
      if (!ITEM_TYPES.has(item.type.name)) continue;
      const list = $from.node(depth - 1);
      const index = $from.index(depth - 1);
      const start = $from.before(depth);
      const end = $from.after(depth);
      if (to > end) return false;
      let newStart: number;
      if (direction === "up") {
        if (index === 0) return false;
        const previous = list.child(index - 1);
        newStart = start - previous.nodeSize;
        if (dispatch) tr.replaceWith(newStart, end, Fragment.from([item, previous]));
      } else {
        if (index >= list.childCount - 1) return false;
        const next = list.child(index + 1);
        newStart = start + next.nodeSize;
        if (dispatch) tr.replaceWith(start, end + next.nodeSize, Fragment.from([next, item]));
      }
      if (dispatch) {
        tr.setSelection(TextSelection.create(tr.doc, newStart + (from - start), newStart + (to - start)));
        tr.scrollIntoView();
      }
      return true;
    }
    return false;
  };
}

/** Move List Item Up/Down (⌃⌘↑ / ⌃⌘↓). */
export const ListItemMove = Extension.create({
  name: "notesListMove",
  addCommands() {
    return { moveListItem: (direction) => moveListItem(direction) };
  },
  addKeyboardShortcuts() {
    return {
      "Ctrl-Mod-ArrowUp": () => this.editor.commands.moveListItem("up"),
      "Ctrl-Mod-ArrowDown": () => this.editor.commands.moveListItem("down"),
    };
  },
});
