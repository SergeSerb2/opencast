import { useEffect } from "react";
import { create } from "zustand";
import { defaultSettings, isSettingsKey, type SettingsKey, type SettingsValues, type SettingValue } from "@surgecast/protocol";
import { backend } from "./backend";

interface SettingsState {
  values: SettingsValues;
  loaded: boolean;
  error: unknown;
}

const useSettingsStore = create<SettingsState>(() => ({ values: defaultSettings(), loaded: false, error: undefined }));

let started = false;

/** Load settings once per page and keep them in sync with `settings.changed`. */
function ensureSettingsLoaded(): void {
  if (started) return;
  started = true;
  backend.on("settings.changed", ({ key, value }) => {
    if (!isSettingsKey(key)) return;
    useSettingsStore.setState((state) => ({ values: { ...state.values, [key]: value } }));
  });
  const load = () =>
    backend
      .call("settings.getAll")
      .then((values) => useSettingsStore.setState({ values: { ...defaultSettings(), ...values }, loaded: true, error: undefined }))
      .catch((error: unknown) => useSettingsStore.setState({ loaded: true, error }));
  load();
  backend.onStateChange((state) => {
    if (state === "open") load();
  });
}

export async function setSetting<K extends SettingsKey>(key: K, value: SettingValue<K>): Promise<void> {
  const previous = useSettingsStore.getState().values[key];
  useSettingsStore.setState((state) => ({ values: { ...state.values, [key]: value } }));
  try {
    await backend.call("settings.set", { key, value });
  } catch (error) {
    useSettingsStore.setState((state) => ({ values: { ...state.values, [key]: previous } }));
    throw error;
  }
}

export interface UseSettingsResult {
  settings: SettingsValues;
  loaded: boolean;
  set: typeof setSetting;
}

/** All settings (defaults until loaded) plus an optimistic setter. */
export function useSettings(): UseSettingsResult {
  useEffect(ensureSettingsLoaded, []);
  const settings = useSettingsStore((state) => state.values);
  const loaded = useSettingsStore((state) => state.loaded);
  return { settings, loaded, set: setSetting };
}

/** One setting; re-renders only when that value changes. */
export function useSetting<K extends SettingsKey>(key: K): SettingValue<K> {
  useEffect(ensureSettingsLoaded, []);
  return useSettingsStore((state) => state.values[key]);
}

/** Non-React access (event handlers, stores). */
export function getSetting<K extends SettingsKey>(key: K): SettingValue<K> {
  ensureSettingsLoaded();
  return useSettingsStore.getState().values[key];
}
