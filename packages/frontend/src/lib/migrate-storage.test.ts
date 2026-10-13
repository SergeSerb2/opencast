import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateLegacyStorage } from "./migrate-storage";

afterEach(() => localStorage.clear());

describe("OpenCast storage upgrade", () => {
  it("migrates before a window's module-level preferences are read", async () => {
    localStorage.clear();
    localStorage.setItem("surgecast-notes-count-mode", '"words"');
    localStorage.setItem("surgecast-notes-window-auto-size-enabled", "false");
    vi.resetModules();
    await import("../app/mount");
    const { useNotesPreferences } = await import("../notes/lib/preferences");
    expect(useNotesPreferences.getState()).toMatchObject({ countMode: "words", autoSize: false });
  });
  it("copies legacy notes, AI, translator, and form values and preserves current values", () => {
    localStorage.clear();
    const values = {
      "surgecast-notes-count-mode": '"words"',
      "surgecast.ai.sidebarOpen": "false",
      "surgecast.translator.languages": '{"source":"de","target":"en"}',
      "surgecast.form.project": '"old-project"',
      "surgecast.dropdown.project": "saved",
    };
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    localStorage.setItem("opencast.form.project", '"new-project"');
    localStorage.setItem("other-app.setting", "unchanged");
    migrateLegacyStorage(localStorage);
    for (const [key, value] of Object.entries(values)) {
      expect(localStorage.getItem(key)).toBe(value);
      expect(localStorage.getItem(key.replace("surgecast", "opencast")))
        .toBe(key.endsWith("form.project") ? '"new-project"' : value);
    }
    expect(localStorage.getItem("other-app.setting")).toBe("unchanged");
    localStorage.removeItem("opencast.ai.sidebarOpen");
    migrateLegacyStorage(localStorage);
    expect(localStorage.getItem("opencast.ai.sidebarOpen")).toBeNull();
  });

  it("retries an interrupted migration without replacing current preferences", () => {
    localStorage.clear();
    localStorage.setItem("surgecast.ai.sidebarOpen", "false");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("quota"); });
    migrateLegacyStorage(localStorage);
    setItem.mockRestore();
    expect(localStorage.getItem("opencast.storageMigration.v1")).toBeNull();
    migrateLegacyStorage(localStorage);
    expect(localStorage.getItem("opencast.ai.sidebarOpen")).toBe("false");
    expect(localStorage.getItem("opencast.storageMigration.v1")).toBe("done");
  });
});
