import { useCallback } from "react";
import type { CommandId, CommandInfo, CommandPrefs, Hotkey } from "@surgecast/protocol";
import { backend } from "../bridge/backend";
import { useBackend } from "../bridge/hooks";
import { useSetting } from "../bridge/settings";
import { showFailureToast } from "../components/feedback/toast-store";
import { findHotkeyConflict } from "./hotkeys";

/** Every command, including disabled ones (Shortcuts and extension pages). */
export function useAllCommands() {
  return useBackend("commands.list", { includeDisabled: true });
}

/** Conflict checker for the hotkey of `ownerId` (a command id or GLOBAL_HOTKEY_OWNER). */
export function useHotkeyConflict(ownerId: string, commands: readonly CommandInfo[] | undefined): (hotkey: Hotkey) => string | null {
  const globalHotkey = useSetting("general.globalHotkey");
  return useCallback((hotkey: Hotkey) => findHotkeyConflict(hotkey, ownerId, commands ?? [], globalHotkey), [ownerId, commands, globalHotkey]);
}

/**
 * Update a command's alias/hotkey/enabled state. Clearing a value uses
 * `unset` because `undefined` does not survive JSON.
 */
export async function updateCommand(id: CommandId, prefs: Partial<CommandPrefs>, unset?: (keyof CommandPrefs)[]): Promise<CommandInfo | null> {
  try {
    return await backend.call("commands.setPrefs", unset?.length ? { id, prefs, unset } : { id, prefs });
  } catch (error) {
    showFailureToast("Could not update command", error);
    return null;
  }
}

/** Throwing variant for the hotkey recorder, which shows the error inline. */
export async function setCommandHotkey(id: CommandId, hotkey: Hotkey | null): Promise<void> {
  await backend.call("commands.setPrefs", hotkey ? { id, prefs: { hotkey } } : { id, prefs: {}, unset: ["hotkey"] });
}
