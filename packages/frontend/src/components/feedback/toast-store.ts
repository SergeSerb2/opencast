import { create } from "zustand";
import type { KeyboardShortcut, ToastStyle } from "@surgecast/protocol";

export interface ToastAction {
  title: string;
  shortcut?: KeyboardShortcut;
  onAction: () => unknown;
}

export interface ToastOptions {
  style?: ToastStyle;
  title: string;
  message?: string;
  primaryAction?: ToastAction;
  secondaryAction?: ToastAction;
}

export interface ActiveToast extends Required<Pick<ToastOptions, "style" | "title">> {
  id: string;
  message?: string;
  primaryAction?: ToastAction;
  secondaryAction?: ToastAction;
  /** Bumps on every update so the footer restarts its auto-hide timer. */
  revision: number;
}

export interface ToastHandle {
  readonly id: string;
  update(patch: Partial<ToastOptions>): void;
  hide(): void;
}

interface ToastState {
  toast: ActiveToast | null;
}

export const useToastStore = create<ToastState>(() => ({ toast: null }));

let counter = 0;

/** Show a toast in the launcher footer (replaces the current one). */
export function showToast(options: ToastOptions): ToastHandle {
  const id = `toast-${++counter}`;
  useToastStore.setState({ toast: { id, style: options.style ?? "success", title: options.title, message: options.message, primaryAction: options.primaryAction, secondaryAction: options.secondaryAction, revision: 0 } });
  return {
    id,
    update(patch) {
      useToastStore.setState((state) => (state.toast?.id === id ? { toast: { ...state.toast, ...patch, style: patch.style ?? state.toast.style, revision: state.toast.revision + 1 } } : state));
    },
    hide() {
      hideToast(id);
    },
  };
}

/** Hide the given toast, or whichever toast is showing. */
export function hideToast(id?: string): void {
  useToastStore.setState((state) => (!id || state.toast?.id === id ? { toast: null } : state));
}

/** Convenience for failures: "<title>" + error message. */
export function showFailureToast(title: string, error?: unknown): ToastHandle {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  return showToast({ style: "failure", title, message });
}
