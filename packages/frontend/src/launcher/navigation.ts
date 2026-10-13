import type { ReactNode } from "react";
import { create } from "zustand";
import type { BuiltinView, ImageLike } from "@surgecast/protocol";

interface EntryBase {
  key: string;
  /** Command that opened the view (footer title/icon, relaunch). */
  commandId?: string;
  title?: string;
  icon?: ImageLike;
}

export type NavEntry =
  | (EntryBase & { kind: "root" })
  | (EntryBase & { kind: "builtin"; view: BuiltinView })
  | (EntryBase & { kind: "element"; element: ReactNode })
  | (EntryBase & { kind: "extension"; sessionId: string })
  | (EntryBase & { kind: "quick-ai"; prompt?: string; aiCommandId?: string; presetId?: string; arguments?: Record<string, string> });

export type NewEntry = NavEntry extends infer E ? (E extends NavEntry ? Omit<E, "key"> : never) : never;

interface NavigationState {
  stack: NavEntry[];
  /** Bumps when root search should clear its text (pop to root on reopen, escape). */
  rootResetToken: number;
  push: (entry: NewEntry) => void;
  pop: () => NavEntry | undefined;
  popToRoot: (options?: { clearSearch?: boolean }) => NavEntry[];
  replaceTop: (entry: NewEntry) => void;
  remove: (key: string) => void;
}

let counter = 0;
const keyed = (entry: NewEntry): NavEntry => ({ ...entry, key: `nav-${++counter}` }) as NavEntry;
const ROOT: NavEntry = { key: "root", kind: "root" };

/** The launcher's view stack. Index 0 is always root search. */
export const useNavigationStore = create<NavigationState>((set, get) => ({
  stack: [ROOT],
  rootResetToken: 0,
  push: (entry) => set((state) => ({ stack: [...state.stack, keyed(entry)] })),
  pop: () => {
    const { stack } = get();
    if (stack.length <= 1) return undefined;
    const top = stack[stack.length - 1];
    set({ stack: stack.slice(0, -1) });
    return top;
  },
  popToRoot: (options) => {
    const removed = get().stack.slice(1);
    set((state) => ({ stack: [ROOT], rootResetToken: options?.clearSearch ? state.rootResetToken + 1 : state.rootResetToken }));
    return removed;
  },
  replaceTop: (entry) =>
    set((state) => (state.stack.length <= 1 ? { stack: [...state.stack, keyed(entry)] } : { stack: [...state.stack.slice(0, -1), keyed(entry)] })),
  remove: (key) => set((state) => ({ stack: state.stack.filter((e) => e.key !== key || e.kind === "root") })),
}));

export function topEntry(): NavEntry {
  const { stack } = useNavigationStore.getState();
  return stack[stack.length - 1];
}
