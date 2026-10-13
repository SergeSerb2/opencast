import { create } from "zustand";

interface LauncherState {
  /** Current root search text (window height in compact mode depends on it). */
  rootQuery: string;
  setRootQuery: (query: string) => void;
}

export const useLauncherStore = create<LauncherState>((set) => ({
  rootQuery: "",
  setRootQuery: (rootQuery) => set({ rootQuery }),
}));
