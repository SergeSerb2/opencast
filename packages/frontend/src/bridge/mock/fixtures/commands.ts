import type { CommandInfo, ImageLike, Quicklink, TileImage } from "@surgecast/protocol";

export const tile = (glyph: string, top: string, bottom: string): TileImage => ({ tile: { glyph, background: [top, bottom] } });

const T = {
  orange: ["#FFA24A", "#F2711C"],
  red: ["#FF6B6B", "#E5383B"],
  blue: ["#5AB8FF", "#2D7FF0"],
  indigo: ["#7C8CFF", "#4F5BEA"],
  purple: ["#B58CFF", "#8156F0"],
  pink: ["#FF7BC1", "#E2408F"],
  green: ["#5FE0A0", "#21B26B"],
  teal: ["#52D6D0", "#1A9E9E"],
  yellow: ["#FFD45C", "#F5A623"],
  gray: ["#8E95A6", "#5B6273"],
  graphite: ["#5E6270", "#34363E"],
} as const;

type Hue = keyof typeof T;
const t = (glyph: string, hue: Hue) => tile(glyph, T[hue][0], T[hue][1]);

function builtin(id: string, title: string, subtitle: string, icon: ImageLike, extra: Partial<CommandInfo> = {}): CommandInfo {
  // Core commands named like their extension show the app name instead (as Raycast shows "Raycast").
  const shown = subtitle === title ? "Surgecast" : subtitle;
  return { id: `builtin:${id}`, kind: "builtin", title, subtitle: shown, typeLabel: "Command", icon, mode: "view", enabled: true, extensionTitle: subtitle, ...extra };
}

function app(bundleId: string, title: string, icon: ImageLike, extra: Partial<CommandInfo> = {}): CommandInfo {
  return { id: `app:${bundleId}`, kind: "app", title, subtitle: undefined, typeLabel: "Application", icon, mode: "no-view", enabled: true, ...extra };
}

export const APPS: CommandInfo[] = [
  app("com.apple.Safari", "Safari", t("compass-16", "blue"), { keywords: ["browser", "web"] }),
  app("com.apple.finder", "Finder", t("finder-16", "blue")),
  app("com.figma.Desktop", "Figma", t("edit-shape-16", "graphite"), { keywords: ["design"] }),
  app("com.tinyspeck.slackmacgap", "Slack", t("hashtag-16", "purple"), { keywords: ["chat"] }),
  app("com.apple.ActivityMonitor", "Activity Monitor", t("heartbeat-16", "graphite"), { keywords: ["cpu", "processes"] }),
  app("com.apple.Terminal", "Terminal", t("terminal-16", "graphite"), { keywords: ["shell"] }),
  app("com.microsoft.VSCode", "Visual Studio Code", t("code-16", "blue"), { keywords: ["editor", "code"] }),
  app("com.apple.Notes", "Notes", t("pencil-16", "yellow")),
  app("com.apple.iCal", "Calendar", t("calendar-16", "red")),
  app("com.apple.mail", "Mail", t("envelope-16", "blue")),
  app("com.spotify.client", "Spotify", t("music-16", "green")),
  app("com.apple.systempreferences", "System Settings", t("cog-16", "gray"), { keywords: ["preferences"] }),
  app("com.apple.Preview", "Preview", t("image-16", "teal")),
  app("com.apple.AppStore", "App Store", t("store-16", "blue")),
  app("com.apple.Music", "Music", t("music-16", "pink")),
  app("com.apple.reminders", "Reminders", t("check-list-16", "orange")),
];

export const BUILTIN_COMMANDS: CommandInfo[] = [
  builtin("clipboard.clipboardHistory", "Clipboard History", "Clipboard History", t("clipboard-16", "orange"), { alias: "cl", hotkey: { modifiers: ["cmd", "shift"], key: "v" }, favorite: true, keywords: ["copy", "paste"] }),
  builtin("snippets.searchSnippets", "Search Snippets", "Snippets", t("snippets-16", "blue"), { keywords: ["text", "expand"] }),
  builtin("snippets.createSnippet", "Create Snippet", "Snippets", t("plus-square-16", "blue")),
  builtin("quicklinks.createQuicklink", "Create Quicklink", "Quicklinks", t("quicklink-16", "purple")),
  builtin("quicklinks.searchQuicklinks", "Search Quicklinks", "Quicklinks", t("link-16", "purple")),
  builtin("emoji.searchEmoji", "Search Emoji & Symbols", "Emoji & Symbols", t("emoji-16", "yellow"), { keywords: ["emoticon", "symbol"] }),
  builtin("files.searchFiles", "Search Files", "File Search", t("magnifying-glass-16", "indigo"), { acceptsFallbackText: true }),
  builtin("store.store", "Store", "Surgecast", t("store-16", "red"), { acceptsFallbackText: true }),
  builtin("ai.aiChat", "AI Chat", "Surgecast AI", t("speech-bubble-16", "pink"), { mode: "no-view", keywords: ["gpt", "claude", "llm"] }),
  builtin("ai.askAi", "Quick AI", "Surgecast AI", t("stars-16", "pink"), { acceptsFallbackText: true, keywords: ["ask"] }),
  builtin("ai.searchAiCommands", "Search AI Commands", "Surgecast AI", t("wand-16", "pink")),
  builtin("notes.searchNotes", "Search Notes", "Notes", t("blank-document-16", "yellow")),
  builtin("notes.createNote", "Create Note", "Notes", t("new-document-16", "yellow"), { mode: "no-view" }),
  builtin("calculator.calculatorHistory", "Calculator History", "Calculator", t("calculator-16", "graphite")),
  builtin("calendar.mySchedule", "My Schedule", "Calendar", t("calendar-16", "red")),
  builtin("menus.searchMenuItems", "Search Menu Bar Items", "Navigation", t("app-window-list-16", "indigo")),
  builtin("windows.leftHalf", "Left Half", "Window Management", t("app-window-sidebar-left-16", "teal"), { mode: "no-view", keywords: ["resize", "window"] }),
  builtin("windows.rightHalf", "Right Half", "Window Management", t("app-window-sidebar-right-16", "teal"), { mode: "no-view", keywords: ["resize", "window"] }),
  builtin("windows.maximize", "Maximize", "Window Management", t("maximize-16", "teal"), { mode: "no-view", keywords: ["window", "fullscreen"] }),
  builtin("windows.center", "Center", "Window Management", t("center-16", "teal"), { mode: "no-view", keywords: ["window"] }),
  builtin("system.lockScreen", "Lock Screen", "System", t("lock-16", "gray"), { mode: "no-view" }),
  builtin("system.sleep", "Sleep", "System", t("moon-16", "gray"), { mode: "no-view" }),
  builtin("system.emptyTrash", "Empty Trash", "System", t("trash-16", "gray"), { mode: "no-view" }),
  builtin("system.toggleSystemAppearance", "Toggle System Appearance", "System", t("contrast-16", "gray"), { mode: "no-view", keywords: ["dark mode", "light mode"] }),
  builtin("surgecast.confetti", "Confetti", "Surgecast", t("stars-16", "purple"), { mode: "no-view" }),
  builtin("surgecast.settings", "Settings", "Surgecast", t("cog-16", "graphite"), { mode: "no-view", keywords: ["preferences"] }),
  builtin("surgecast.extensions", "Extensions", "Surgecast", t("app-window-grid-2x2-16", "graphite")),
  builtin("scripts.searchScriptCommands", "Search Script Commands", "Script Commands", t("terminal-16", "graphite")),
  builtin("translator.translate", "Translate", "Translator", t("globe-01-16", "blue"), { arguments: [{ name: "text", type: "text", placeholder: "Text", required: true }] }),
  builtin("web.google", "Search Google", "Web Search", t("globe-01-16", "green"), { kind: "builtin", mode: "no-view", acceptsFallbackText: true, arguments: [{ name: "query", type: "text", placeholder: "Query", required: true }] }),
];

export const EXTENSION_COMMANDS: CommandInfo[] = [
  { id: "ext:github.my-pull-requests", kind: "extension", title: "My Pull Requests", subtitle: "GitHub", typeLabel: "Command", icon: t("code-block-16", "graphite"), mode: "view", enabled: true, extensionId: "github", extensionTitle: "GitHub", keywords: ["pr", "review"] },
  { id: "ext:github.create-issue", kind: "extension", title: "Create Issue", subtitle: "GitHub", typeLabel: "Command", icon: t("bug-16", "graphite"), mode: "view", enabled: true, extensionId: "github", extensionTitle: "GitHub" },
  { id: "ext:github.repository-readme", kind: "extension", title: "Repository Readme", subtitle: "GitHub", typeLabel: "Command", icon: t("book-16", "graphite"), mode: "view", enabled: true, extensionId: "github", extensionTitle: "GitHub" },
  { id: "ext:unsplash.search-photos", kind: "extension", title: "Search Photos", subtitle: "Unsplash", typeLabel: "Command", icon: t("image-16", "graphite"), mode: "view", enabled: true, extensionId: "unsplash", extensionTitle: "Unsplash", arguments: [{ name: "query", type: "text", placeholder: "Query", required: false }] },
  { id: "ext:dictionary.define-word", kind: "extension", title: "Define Word", subtitle: "Dictionary", typeLabel: "Command", icon: t("book-16", "orange"), mode: "view", enabled: true, extensionId: "dictionary", extensionTitle: "Dictionary", acceptsFallbackText: true, needsPreferences: false },
  { id: "ext:weather.forecast", kind: "extension", title: "Weather Forecast", subtitle: "Weather", typeLabel: "Command", icon: t("cloud-sun-16", "blue"), mode: "view", enabled: true, extensionId: "weather", extensionTitle: "Weather", needsPreferences: true },
];

export const SCRIPT_COMMANDS: CommandInfo[] = [
  { id: "script:/Users/me/scripts/uptime.sh", kind: "script", title: "System Uptime", subtitle: "Scripts", typeLabel: "Script Command", icon: "⏱️", mode: "view", enabled: true },
];

export const QUICKLINKS: Quicklink[] = [
  { id: "ql-github", name: "GitHub Repository", link: "https://github.com/{argument name=\"repo\" default=\"surgecast/surgecast\"}", icon: t("link-16", "graphite"), createdAt: Date.now() - 86400000 * 20, updatedAt: Date.now() - 86400000 * 2 },
  { id: "ql-mdn", name: "Search MDN", link: "https://developer.mozilla.org/search?q={query}", icon: t("globe-01-16", "blue"), createdAt: Date.now() - 86400000 * 40, updatedAt: Date.now() - 86400000 * 40 },
];

export const QUICKLINK_COMMANDS: CommandInfo[] = QUICKLINKS.map((q) => ({
  id: `quicklink:${q.id}`,
  kind: "quicklink",
  title: q.name,
  subtitle: q.link.replace(/\{[^}]+\}/g, "…"),
  typeLabel: "Quicklink",
  icon: q.icon ?? "link-16",
  mode: "no-view",
  enabled: true,
  arguments: q.link.includes("{query}") ? [{ name: "query", type: "text", placeholder: "Query", required: true }] : undefined,
}));

export const ALL_COMMANDS: CommandInfo[] = [...BUILTIN_COMMANDS, ...EXTENSION_COMMANDS, ...SCRIPT_COMMANDS, ...QUICKLINK_COMMANDS, ...APPS];

/** Recently used ids shown under "Suggestions" for an empty query. */
export const SUGGESTION_IDS = ["app:com.apple.Safari", "builtin:surgecast.settings", "ext:github.my-pull-requests", "app:com.figma.Desktop", "app:com.apple.ActivityMonitor"];

/** Apps the mock reports as running (dot under the icon). */
export const RUNNING_APP_IDS = new Set(["app:com.apple.Safari", "app:com.figma.Desktop", "app:com.apple.ActivityMonitor", "app:com.tinyspeck.slackmacgap"]);
