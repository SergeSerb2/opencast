import { create } from "zustand";
import type { AlertOptions } from "@surgecast/protocol";

export interface PendingAlert {
  id: string;
  options: AlertOptions;
  resolve: (confirmed: boolean) => void;
}

interface AlertState {
  alert: PendingAlert | null;
}

export const useAlertStore = create<AlertState>(() => ({ alert: null }));

let counter = 0;

/**
 * Ask for confirmation with the launcher's alert sheet (Raycast `confirmAlert`).
 * Resolves true for the primary action, false for dismiss/Esc.
 */
export function confirmAlert(options: AlertOptions): Promise<boolean> {
  const previous = useAlertStore.getState().alert;
  previous?.resolve(false);
  return new Promise<boolean>((resolve) => {
    const id = `alert-${++counter}`;
    useAlertStore.setState({
      alert: {
        id,
        options,
        resolve: (confirmed) => {
          useAlertStore.setState((state) => (state.alert?.id === id ? { alert: null } : state));
          resolve(confirmed);
        },
      },
    });
  });
}
