import { expect, it } from "vitest";
import { categoryFor, isEnabled } from "../../src/services/sync/categories";
import { normalizeServerUrl } from "../../src/services/sync/http";
it("maps content and individual settings, excluding unknown and device-local data", () => {
  expect(categoryFor("notes", "a")).toBe("notes");
  expect(categoryFor("aiMessages", "a")).toBe("ai-history");
  expect(categoryFor("settings", "general.appearance")).toBe("general-settings.appearance");
  expect(categoryFor("settings", "general.globalHotkey")).toBeUndefined();
  expect(categoryFor("settings", "sync.enabled")).toBeUndefined();
  expect(categoryFor("settings", "unknown")).toBeUndefined();
  for (const collection of ["clipboard", "frecency", "localState", "unknown"]) expect(categoryFor(collection, "a")).toBeUndefined();
  expect(isEnabled("notes", "a", ["notes"])).toBe(false);
  expect(isEnabled("settings", "general.appearance", ["general-settings.appearance"])).toBe(false);
  expect(isEnabled("themes", "a", ["always"])).toBe(true);
});
it("requires HTTPS or local development and forbids URL credentials", () => {
  expect(normalizeServerUrl("https://example.com/")).toBe("https://example.com");
  expect(normalizeServerUrl("http://127.0.0.1:8787/")).toBe("http://127.0.0.1:8787");
  for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com?token=x", "https://example.com#x", "file:///tmp/server"]) expect(() => normalizeServerUrl(url)).toThrow();
});
