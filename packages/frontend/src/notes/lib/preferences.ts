import { create } from "zustand";

/** Per-device Notes window preferences kept in localStorage (as Raycast does). */
export type CountMode = "characters" | "words";

interface NotesPreferences {
  formatBarVisible: boolean;
  autoSize: boolean;
  countMode: CountMode;
}

const KEYS: Record<keyof NotesPreferences, string> = {
  formatBarVisible: "opencast-notes-format-bar-visible",
  autoSize: "opencast-notes-window-auto-size-enabled",
  countMode: "opencast-notes-count-mode",
};

function read<K extends keyof NotesPreferences>(key: K, fallback: NotesPreferences[K]): NotesPreferences[K] {
  try {
    const raw = localStorage.getItem(KEYS[key]);
    return raw === null ? fallback : (JSON.parse(raw) as NotesPreferences[K]);
  } catch {
    return fallback;
  }
}

export const useNotesPreferences = create<NotesPreferences>(() => ({
  formatBarVisible: read("formatBarVisible", false),
  autoSize: read("autoSize", true),
  countMode: read("countMode", "characters"),
}));

export function setNotesPreference<K extends keyof NotesPreferences>(key: K, value: NotesPreferences[K]): void {
  useNotesPreferences.setState({ [key]: value } as Pick<NotesPreferences, K>);
  try {
    localStorage.setItem(KEYS[key], JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the preference then lasts for this session.
  }
}
