import { describe, expect, it, vi } from "vitest";
import type { CommandInfo, InstalledExtension } from "@opencast/protocol";
import { RpcError } from "../../../bridge/errors";
import { EXTENSION_FALLBACK_ICON } from "../store/model";
import { extensionCommandRows, groupExtensions, installedExtensionIcon, runExtensionUpdates, summarizeUpdates, tildify, updatableExtensions, withNewVersions } from "./model";

function extension(overrides: Partial<InstalledExtension> = {}): InstalledExtension {
  return {
    name: "github",
    title: "GitHub",
    author: "mira",
    source: "store",
    path: "/Users/me/Library/Application Support/OpenCast/extensions/github",
    version: "1.0.0",
    commands: [
      { name: "prs", title: "My Pull Requests", mode: "view" },
      { name: "menu", title: "Menu Bar", mode: "menu-bar", disabledByDefault: true },
    ],
    tools: [],
    preferences: [],
    enabled: true,
    installedAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function command(id: string, overrides: Partial<CommandInfo> = {}): CommandInfo {
  return { id, kind: "extension", title: id, typeLabel: "Command", icon: "star-16", mode: "view", enabled: true, extensionId: "github", ...overrides };
}

describe("groupExtensions", () => {
  const list = [extension({ name: "b", title: "Beta" }), extension({ name: "a", title: "Alpha" }), extension({ name: "dev", title: "Dev", source: "development" })];

  it("groups by source in Store, Local, Development order and sorts by title", () => {
    const sections = groupExtensions(list, "all");
    expect(sections.map((s) => s.title)).toEqual(["Store", "Development"]);
    expect(sections[0].extensions.map((e) => e.title)).toEqual(["Alpha", "Beta"]);
  });

  it("filters to one source", () => {
    expect(groupExtensions(list, "development").map((s) => s.source)).toEqual(["development"]);
    expect(groupExtensions(list, "local")).toEqual([]);
  });
});

describe("installed extension helpers", () => {
  it("abbreviates the home folder", () => {
    expect(tildify("/Users/me/Developer/x")).toBe("~/Developer/x");
    expect(tildify("/opt/x")).toBe("/opt/x");
  });

  it("resolves the manifest icon inside the install folder", () => {
    expect(installedExtensionIcon(extension({ icon: "icon.png" }))).toEqual({ source: "/Users/me/Library/Application Support/OpenCast/extensions/github/assets/icon.png", fallback: EXTENSION_FALLBACK_ICON });
    expect(installedExtensionIcon(extension({ icon: "https://example.com/i.png" }))).toEqual({ source: "https://example.com/i.png", fallback: EXTENSION_FALLBACK_ICON });
  });

  it("falls back to a command icon, then the generic glyph", () => {
    expect(installedExtensionIcon(extension(), [command("ext:github.prs", { icon: "code-16" })])).toBe("code-16");
    expect(installedExtensionIcon(extension({ path: undefined, icon: "icon.png" }))).toBe(EXTENSION_FALLBACK_ICON);
  });

  it("joins manifest commands with their effective state", () => {
    const rows = extensionCommandRows(extension(), [command("ext:github.prs", { enabled: false, alias: "pr" })], "box-16");
    expect(rows.map((r) => [r.id, r.enabled, r.info?.alias])).toEqual([
      ["ext:github.prs", false, "pr"],
      ["ext:github.menu", false, undefined],
    ]);
    expect(extensionCommandRows(extension(), [], "box-16")[0].enabled).toBe(true);
    expect(extensionCommandRows(extension({ enabled: false }), [], "box-16")[0].enabled).toBe(false);
  });

  it("only updates Store extensions installed on this Mac", () => {
    const list = [extension(), extension({ name: "local", source: "local" }), extension({ name: "synced", path: undefined })];
    expect(updatableExtensions(list).map((e) => e.name)).toEqual(["github"]);
  });
});

describe("extension updates", () => {
  const github = extension();
  const weather = extension({ name: "weather", title: "Weather", version: "2.0.0" });
  const spotify = extension({ name: "spotify", title: "Spotify" });

  it("updates one extension at a time and records each outcome", async () => {
    const update = vi.fn(async (name: string) => {
      if (name === "spotify") throw new RpcError({ code: -32010, message: "Store unavailable" });
      return { updated: name === "github" ? ["github"] : [] };
    });
    const progress = vi.fn();
    const results = await runExtensionUpdates([github, weather, spotify], update, progress);
    expect(update.mock.calls.map(([name]) => name)).toEqual(["github", "weather", "spotify"]);
    expect(results.map((r) => [r.extension.name, r.status, r.reason])).toEqual([
      ["github", "updated", "Installed the latest version"],
      ["weather", "skipped", "Already up to date"],
      ["spotify", "failed", "Store unavailable"],
    ]);
    expect(progress).toHaveBeenLastCalledWith(3, 3);
  });

  it("fills in new versions after the run", async () => {
    const results = await runExtensionUpdates([github], async () => ({ updated: ["github"] }));
    const [final] = withNewVersions(results, [extension({ version: "1.2.0" })]);
    expect(final.newVersion).toBe("1.2.0");
    expect(final.reason).toBe("Updated from 1.0.0 to 1.2.0");
  });

  it("summarizes the run for the toast", async () => {
    expect(summarizeUpdates([{ extension: github, status: "skipped", reason: "" }])).toEqual({ style: "success", title: "All Extensions Are Up to Date" });
    expect(
      summarizeUpdates([
        { extension: github, status: "updated", reason: "" },
        { extension: spotify, status: "failed", reason: "" },
      ]),
    ).toEqual({ style: "failure", title: "Update Finished", message: "1 updated, 1 failed" });
    expect(summarizeUpdates([{ extension: github, status: "updated", reason: "" }])).toEqual({ style: "success", title: "Update Finished", message: "1 updated" });
  });
});
