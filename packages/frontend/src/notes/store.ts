import type { Note } from "@opencast/protocol";
import { create } from "zustand";
import { UNTITLED } from "./lib/text";

/** Which overlay panel is open: the ⌘K action panel (optionally at a submenu) or the note browser. */
export type NotesPanel = { kind: "actions"; submenu?: string } | { kind: "browse" } | null;

export interface NotesState {
  /** The open note as stored; null while a new note is an unsaved draft. */
  note: Note | null;
  title: string;
  characters: number;
  words: number;
  /** True when the editor holds no text. */
  empty: boolean;
  findOpen: boolean;
  panel: NotesPanel;
  linkEditing: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Bumps when the document is replaced wholesale (note switch, remote merge). */
  docVersion: number;
}

export const useNotesStore = create<NotesState>(() => ({
  note: null,
  title: UNTITLED,
  characters: 0,
  words: 0,
  empty: true,
  findOpen: false,
  panel: null,
  linkEditing: false,
  canGoBack: false,
  canGoForward: false,
  docVersion: 0,
}));

export function openPanel(panel: NotesPanel): void {
  useNotesStore.setState({ panel });
}

export function closePanel(): void {
  useNotesStore.setState({ panel: null });
}
