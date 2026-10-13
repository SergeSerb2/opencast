import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface FindMatch {
  from: number;
  to: number;
}

export interface FindState {
  query: string;
  matches: FindMatch[];
  /** Index of the active match, -1 when there is none. */
  active: number;
  decorations: DecorationSet;
}

interface FindMeta {
  query?: string;
  active?: number;
}

const findReplaceKey = new PluginKey<FindState>("notesFindReplace");

const MATCH_CLASS = "sc-notes-find-match";
const ACTIVE_CLASS = "sc-notes-find-match sc-notes-find-match--active";

/** Case-insensitive, non-overlapping matches inside each textblock (inline leaves count as one character). */
export function findMatches(doc: ProseMirrorNode, query: string): FindMatch[] {
  if (!query) return [];
  const needle = query.toLowerCase();
  const matches: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    node.forEach((child) => {
      text += child.isText ? (child.text ?? "") : "￼".repeat(child.nodeSize);
    });
    const lowered = text.toLowerCase();
    // Some characters change length when lowercased; search those blocks case-sensitively.
    const haystack = lowered.length === text.length ? lowered : text;
    const target = lowered.length === text.length ? needle : query;
    for (let index = haystack.indexOf(target); index !== -1; index = haystack.indexOf(target, index + target.length)) {
      matches.push({ from: pos + 1 + index, to: pos + 1 + index + target.length });
    }
    return false;
  });
  return matches;
}

function decorate(doc: ProseMirrorNode, matches: FindMatch[], active: number): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((match, index) => Decoration.inline(match.from, match.to, { class: index === active ? ACTIVE_CLASS : MATCH_CLASS })),
  );
}

const EMPTY: FindState = { query: "", matches: [], active: -1, decorations: DecorationSet.empty };

/** Highlights for Find in Note; driven by the commands below. */
export const FindReplace = Extension.create({
  name: "notesFindReplace",
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findReplaceKey,
        state: {
          init: () => EMPTY,
          apply(tr, previous) {
            const meta = tr.getMeta(findReplaceKey) as FindMeta | undefined;
            if (!meta && !tr.docChanged) return previous;
            const query = meta?.query ?? previous.query;
            if (!query) return EMPTY;
            const matches = findMatches(tr.doc, query);
            let active: number;
            if (meta?.active !== undefined) active = meta.active;
            else if (meta?.query !== undefined && meta.query !== previous.query) {
              // A new query starts at the first match after the caret.
              const caret = tr.selection.from;
              const next = matches.findIndex((match) => match.from >= caret);
              active = next === -1 ? 0 : next;
            } else active = previous.active;
            active = matches.length === 0 ? -1 : Math.min(Math.max(active, 0), matches.length - 1);
            return { query, matches, active, decorations: decorate(tr.doc, matches, active) };
          },
        },
        props: {
          decorations: (state) => findReplaceKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});

export function getFindState(editor: Editor): FindState {
  return findReplaceKey.getState(editor.state) ?? EMPTY;
}

export function setFindQuery(editor: Editor, query: string): void {
  editor.view.dispatch(editor.state.tr.setMeta(findReplaceKey, { query } satisfies FindMeta));
}

/** Move to the next (1) or previous (−1) match, selecting it so closing Find leaves it selected. */
export function stepFindMatch(editor: Editor, delta: 1 | -1): void {
  const { matches, active } = getFindState(editor);
  if (matches.length === 0) return;
  const next = (active + delta + matches.length) % matches.length;
  selectMatch(editor, next);
}

export function selectMatch(editor: Editor, index: number): void {
  const match = getFindState(editor).matches[index];
  if (!match) return;
  const tr = editor.state.tr.setMeta(findReplaceKey, { active: index } satisfies FindMeta);
  tr.setSelection(TextSelection.create(tr.doc, match.from, match.to));
  editor.view.dispatch(tr);
}

/** Replace the active match; the following match becomes active. Returns false without a match. */
export function replaceActiveMatch(editor: Editor, replacement: string): boolean {
  const { matches, active } = getFindState(editor);
  const match = matches[active];
  if (!match) return false;
  const tr = editor.state.tr;
  if (replacement) tr.insertText(replacement, match.from, match.to);
  else tr.delete(match.from, match.to);
  editor.view.dispatch(tr);
  const after = getFindState(editor);
  if (after.matches.length > 0) {
    const next = after.matches.findIndex((m) => m.from >= match.from + replacement.length);
    selectMatch(editor, next === -1 ? 0 : next);
  }
  return true;
}

/** Replace every match in one undoable step. Returns the number of replacements. */
export function replaceAllMatches(editor: Editor, replacement: string): number {
  const { matches } = getFindState(editor);
  if (matches.length === 0) return 0;
  const tr = editor.state.tr;
  for (const match of [...matches].reverse()) {
    if (replacement) tr.insertText(replacement, match.from, match.to);
    else tr.delete(match.from, match.to);
  }
  editor.view.dispatch(tr);
  return matches.length;
}
