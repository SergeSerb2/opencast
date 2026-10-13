import { describe, expect, it } from "vitest";
import { builtinCatalog } from "../../src/services/core/builtins";

import {
  SYSTEM_ACTIONS,
  WINDOW_COMMANDS,
} from "../../src/services/core/native-commands";
describe("built-in command catalog", () => {
  it("covers every native window and system action with unique stable IDs and command tiles", () => {
    const catalog = builtinCatalog();
    const ids = new Set(catalog.map((b) => b.command.id));
    expect(ids.size).toBe(catalog.length);
    for (const action of SYSTEM_ACTIONS)
      expect(ids.has(`builtin:system.${action}`)).toBe(true);
    for (const action of WINDOW_COMMANDS)
      expect(ids.has(`builtin:windowManagement.${action}`)).toBe(true);
    for (const { command } of catalog) {
      expect(command.typeLabel).toBe("Command");
      expect(command.icon).toHaveProperty("tile");
      expect(command.subtitle).toBeTruthy();
    }
  });
});

const catalog = builtinCatalog().map((builtin) => builtin.command);
const byId = new Map(catalog.map((command) => [command.id, command]));

describe("builtin root search metadata", () => {
  it.each([
    ["clipboard.clipboardHistory", "OpenCast", "Clipboard History"],
    ["clipboard.pasteSequentially", "OpenCast", "Clipboard History"],
    ["snippets.searchSnippets", "Snippets", "Snippets"],
    ["files.searchFiles", "File Search", "File Search"],
    ["core.openSearchStore", "OpenCast", "OpenCast"],
    ["core.openSettings", "OpenCast", "OpenCast"],
    ["ai.openAiChat", "OpenCast AI", "OpenCast AI"],
    ["emoji.searchEmoji", "OpenCast", "Emoji & Symbols"],
    ["menus.searchMenuItems", "Navigation", "Menu Search"],
    ["core.manageExtensions", "Developer", "OpenCast"],
    ["notes.search", "OpenCast Notes", "OpenCast Notes"],
    ["calendar.mySchedule", "Calendar", "Calendar"],
    ["calculator.history", "Calculator", "Calculator"],
    ["scripts.searchScriptCommands", "Script Commands", "Script Commands"],
    ["quicklinks.searchQuicklinks", "Quicklinks", "Quicklinks"],
    ["web.google", "Web Searches", "Web Searches"],
    ["system.lockScreen", "System Actions", "System Actions"],
    ["windowManagement.leftHalf", "Window Management", "Window Management"],
  ])("uses reference subtitles while preserving extension identity: %s", (id, subtitle, extensionTitle) => {
    expect(byId.get(`builtin:${id}`)).toMatchObject({ subtitle, extensionTitle });
  });
  it("never duplicates the command title in its subtitle", () => {
    for (const command of catalog) expect(command.subtitle, command.id).not.toBe(command.title);
  });
  it("names settings pages explicitly and exposes the reference pages plus AI and clipboard", () => {
    expect(catalog.filter((command) => command.extensionId === "settings").map((command) => command.title))
      .toEqual([
        "General Settings", "Launcher Settings", "Shortcuts Settings", "Keyboard Settings",
        "Cloud Sync Settings", "Advanced Settings", "About Settings", "AI Settings", "Clipboard History Settings",
      ]);
  });
});
