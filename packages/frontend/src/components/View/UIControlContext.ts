import { createContext, useContext, useEffect, useRef } from "react";
import type { BackendEvents } from "@surgecast/protocol";

export type UIControl = BackendEvents["ext.ui.control"];

/** Each extension session owns a bus; only its active navigation layer subscribes. */
export function createUIControls() {
  const listeners = new Set<(control: UIControl) => void>();
  return {
    subscribe(listener: (control: UIControl) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    emit(control: UIControl) { for (const listener of listeners) listener(control); },
  };
}
export const UIControlContext = createContext<ReturnType<typeof createUIControls> | null>(null);

export function useUIControl(listener: (control: UIControl) => void) {
  const controls = useContext(UIControlContext);
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => controls?.subscribe((control) => latest.current(control)), [controls]);
}
