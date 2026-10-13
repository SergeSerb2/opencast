import { afterEach, expect, it, vi } from "vitest";
import type { Hotkey } from "@opencast/protocol";
import { fixture } from "./fixture";
let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => { await f?.close(); });
it.each(["global", "command"] as const)("preserves a %s hotkey on conflict, retries and removes only when requested", async (kind) => {
  f = await fixture();
  const id = kind === "global" ? "opencast.toggle" : "builtin:core.copyOpenCastVersion";
  const old: Hotkey = kind === "global" ? f.ctx.settings.get("general.globalHotkey") : { modifiers: ["opt"], key: "space" };
  const conflicting: Hotkey = { modifiers: ["cmd"], key: "space" };
  const replacement: Hotkey = { modifiers: ["cmd", "shift"], key: "v" };
  const bindings = new Map<string, Hotkey>(kind === "global" ? [[id, old]] : []);
  let conflict = true;
  f.nativeCall.mockImplementation(async (method, params: any) => {
    if (method === "hotkeys.unregister") bindings.delete(params.id);
    if (method === "hotkeys.register") {
      if (params.id === id && params.hotkey.key === "space" && params.hotkey.modifiers.includes("cmd") && conflict)
        return { ok: false, conflict: "Already in use" };
      bindings.set(params.id, params.hotkey);
      return { ok: true };
    }
    if (method === "apps.list") return [];
  });
  const set = async (hotkey: Hotkey) => {
    if (kind === "global") f.ctx.settings.set("general.globalHotkey", hotkey);
    else await f.call("commands.setPrefs", { id, prefs: { hotkey } });
  };
  if (kind === "command") {
    await set(old);
    await vi.waitFor(() => expect(bindings.get(id)).toEqual(old));
  }
  f.nativeCall.mockClear();
  await set(conflicting);
  await vi.waitFor(() => expect(f.ctx.launcher.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Hotkey Conflict" })));
  expect(bindings.get(id)).toEqual(old);
  expect(f.nativeCall).not.toHaveBeenCalledWith("hotkeys.unregister", { id });
  // Reverting to the working shortcut must use the still-valid cache entry.
  f.nativeCall.mockClear();
  await set(old);
  await new Promise(resolve => setImmediate(resolve));
  expect(f.nativeCall).not.toHaveBeenCalledWith("hotkeys.register", { id, hotkey: old });
  // Retry the failed shortcut after the conflict clears: failure was not cached.
  conflict = false;
  await set(conflicting);
  await vi.waitFor(() => expect(bindings.get(id)).toEqual(conflicting));
  await set(replacement);
  await vi.waitFor(() => expect(bindings.get(id)).toEqual(replacement));
  expect(f.nativeCall).not.toHaveBeenCalledWith("hotkeys.unregister", { id });
  if (kind === "command") {
    await f.call("commands.setPrefs", { id, prefs: {}, unset: ["hotkey"] });
    await vi.waitFor(() => expect(bindings.has(id)).toBe(false));
    expect(f.nativeCall).toHaveBeenCalledWith("hotkeys.unregister", { id });
  }
});
