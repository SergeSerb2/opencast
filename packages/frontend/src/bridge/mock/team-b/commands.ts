import type { CommandInfo, ImageLike } from "@opencast/protocol";
import { tile } from "../fixtures/commands";

function builtin(id: string, title: string, subtitle: string, icon: ImageLike, extra: Partial<CommandInfo> = {}): CommandInfo {
  return { id: `builtin:${id}`, kind: "builtin", title, subtitle, typeLabel: "Command", icon, mode: "view", enabled: true, extensionTitle: subtitle, ...extra };
}

const red = ["#FF6B6B", "#E5383B"] as const;
const blue = ["#5AB8FF", "#2D7FF0"] as const;
const pink = ["#FF7BC1", "#E2408F"] as const;
const graphite = ["#5E6270", "#34363E"] as const;
const purple = ["#B58CFF", "#8156F0"] as const;
const teal = ["#52D6D0", "#1A9E9E"] as const;

/** Commands for Team B views that the shared fixtures do not include (ids follow the real backend). */
export const TEAM_B_COMMANDS: CommandInfo[] = [
  builtin("windowManagement.createWindowManagementCommand", "Create Window Management Command", "Window Management", tile("app-window-16", ...teal), { keywords: ["custom", "layout", "window"] }),
  builtin("scripts.createScriptCommand", "Create Script Command", "Script Commands", tile("terminal-16", ...graphite)),
  builtin("core.showThemeStudio", "Show Theme Studio", "OpenCast", tile("swatch-16", ...purple), { keywords: ["theme", "colors"] }),
  builtin("core.switchTheme", "Switch Theme", "OpenCast", tile("brush-16", ...purple), { keywords: ["theme", "appearance"] }),
  builtin("core.importRaycastData", "Import Raycast Data", "OpenCast", tile("download-16", ...red), { keywords: ["rayconfig", "migrate"] }),
  builtin("core.importData", "Import OpenCast Data", "OpenCast", tile("download-16", ...red), { keywords: ["backup", "restore"] }),
  builtin("core.exportData", "Export Data", "OpenCast", tile("upload-16", ...red), { keywords: ["backup", "rayconfig"] }),
  builtin("core.checkStorage", "Check Storage", "OpenCast", tile("hard-drive-16", ...graphite), { keywords: ["disk", "database"] }),
  builtin("system.killProcess", "Kill Process", "System", tile("memory-stick-16", ...graphite), { keywords: ["quit", "force quit", "cpu", "memory"] }),
  builtin("ai.createAiCommand", "Create AI Command", "OpenCast AI", tile("wand-16", ...pink)),
  builtin("ai.importAiCommands", "Import AI Commands", "OpenCast AI", tile("download-16", ...pink)),
  builtin("ai.exportAiCommands", "Export AI Commands", "OpenCast AI", tile("upload-16", ...pink)),
  builtin("ai.managePresets", "Manage Presets", "OpenCast AI", tile("stars-16", ...pink), { keywords: ["agents"] }),
  builtin("ai.createPreset", "Create Preset", "OpenCast AI", tile("stars-16", ...pink), { keywords: ["agent"] }),
  builtin("translator.quickTranslate", "Translate to Spanish", "Translator", tile("globe-01-16", ...blue), { mode: "view" }),
];

/** Command id → launcher view (ids and props as the real backend sends them). */
export const TEAM_B_VIEWS: Record<string, { id: string; props?: Record<string, unknown> }> = {
  "builtin:windowManagement.createWindowManagementCommand": { id: "window-management", props: { action: "create" } },
  "builtin:menus.searchMenuItems": { id: "menu-items" },
  "builtin:calendar.mySchedule": { id: "calendar" },
  "builtin:scripts.searchScriptCommands": { id: "scripts" },
  "builtin:scripts.createScriptCommand": { id: "scripts.create" },
  "builtin:store.store": { id: "store" },
  "builtin:opencast.extensions": { id: "extensions" },
  "builtin:core.showThemeStudio": { id: "theme-studio" },
  "builtin:core.switchTheme": { id: "theme-studio", props: { action: "switch" } },
  "builtin:core.importRaycastData": { id: "data.import", props: { format: "rayconfig" } },
  "builtin:core.importData": { id: "data.import", props: { format: "opencast" } },
  "builtin:core.exportData": { id: "data.export" },
  "builtin:core.checkStorage": { id: "storage" },
  "builtin:system.killProcess": { id: "processes" },
  "builtin:translator.translate": { id: "translator" },
  "builtin:translator.quickTranslate": { id: "translator", props: { targetLanguage: "es" } },
  "builtin:ai.searchAiCommands": { id: "ai.commands" },
  "builtin:ai.createAiCommand": { id: "ai.commands", props: { action: "create" } },
  "builtin:ai.importAiCommands": { id: "ai.commands", props: { action: "import" } },
  "builtin:ai.exportAiCommands": { id: "ai.commands", props: { action: "export" } },
  "builtin:ai.managePresets": { id: "ai.presets" },
  "builtin:ai.createPreset": { id: "ai.presets", props: { action: "create" } },
};
