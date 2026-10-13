import type { CommandInfo, ImageLike, InstalledExtension, TileImage } from "@opencast/protocol";
import type { SearchablePage } from "./search";

export type PageGroup = "core" | "builtin" | "installed" | "subpage";

export interface PageEntry extends SearchablePage {
  group: PageGroup;
  icon: ImageLike;
  /** Sidebar entry highlighted while a subpage is open. */
  parent?: string;
  /** Command groups (`CommandInfo.extensionId`, or the `builtin:<group>.` prefix) listed on a built-in page. */
  commandGroups?: readonly string[];
  /** One-line summary shown in the page introduction. */
  summary?: string;
}

const tile = (glyph: string, top: string, bottom: string): TileImage => ({ tile: { glyph, background: [top, bottom] } });
const graphite = (glyph: string) => tile(glyph, "#6B6F7B", "#3C3F48");

/** Icon for installed extensions that don't ship one. */
export const EXTENSION_FALLBACK_ICON: TileImage = graphite("app-window-grid-2x2-16");

/** Top group: OpenCast's own settings pages. */
export const CORE_PAGES: readonly PageEntry[] = [
  {
    id: "general",
    title: "General",
    group: "core",
    icon: graphite("cog-16"),
    keywords: ["theme", "dark mode", "light mode", "appearance", "hotkey", "shortcut", "zoom", "compact", "login", "menu bar"],
    rows: [
      "Open at Login",
      "Show in Menu Bar",
      "OpenCast Hotkey",
      "Appearance",
      "Follow System Appearance",
      "Dark Theme",
      "Light Theme",
      "Theme",
      "Theme Studio",
      "Interface Size",
      "Window Mode",
      "Show Favorites in Compact Mode",
    ],
  },
  {
    id: "launcher",
    title: "Launcher",
    group: "core",
    icon: graphite("app-window-list-16"),
    keywords: ["root search", "fallback", "screen", "sensitivity"],
    rows: ["Show OpenCast on", "Pop to Root Search", "Root Search Sensitivity", "Search Ranking", "Customize Search", "Include Files in Root Search", "Show Recently Used", "Fallback Commands"],
  },
  {
    id: "shortcuts",
    title: "Shortcuts",
    group: "core",
    icon: graphite("command-symbol-16"),
    keywords: ["extensions", "commands", "alias", "aliases", "hotkey", "hotkeys", "enable", "disable", "store", "install", "uninstall", "applications"],
  },
  {
    id: "keyboard",
    title: "Keyboard",
    group: "core",
    icon: graphite("keyboard-16"),
    keywords: ["escape", "emacs", "vim", "hyper", "caps lock"],
    rows: ["Escape Key Closes Window", "Built-in Hotkeys Preset", "Display Hyper Key Shortcut", "Escape Key Behavior", "Navigation Bindings", "Page Navigation Keys", "Hyper Key", "Include Shift in Hyper Key"],
  },
  {
    id: "cloud-sync",
    title: "Cloud Sync",
    group: "core",
    icon: graphite("cloud-16"),
    keywords: ["sync", "cloudflare", "worker", "encryption", "devices", "backup", "self-hosted"],
    rows: [
      "Server URL",
      "Access Token",
      "Encryption Passphrase",
      "Device Name",
      "Sync Now",
      "Sync Every",
      "Synced Content",
      "Synced Devices",
      "Not Synced",
      "Danger Zone",
      "Disconnect This Mac",
      "Delete Cloud Sync Data & Devices",
    ],
  },
  {
    id: "advanced",
    title: "Advanced",
    group: "core",
    icon: graphite("wrench-screwdriver-16"),
    keywords: ["import", "export", "rayconfig", "raycast", "backup", "proxy", "favicon", "storage"],
    rows: ["Export Passphrase", "Window Activation Behavior", "Tidy Menu Bar", "Auto-Delete", "Skip on Battery", "Additional Certificate Authority", "Import from Raycast", "Export Data", "Import OpenCast Data", "Scheduled Backup", "Backup Location", "Storage", "Use System Proxy Settings", "Favicon Provider"],
  },
  {
    id: "about",
    title: "About",
    group: "core",
    icon: graphite("opencast-logo"),
    keywords: ["version", "license", "licenses", "github", "update"],
    rows: ["Website", "Release Notes", "Report an Issue", "Licenses"],
  },
];

/** Second group: one page per built-in extension, alphabetical like Raycast. */
export const BUILTIN_PAGES: readonly PageEntry[] = [
  {
    id: "ai",
    title: "AI",
    group: "builtin",
    icon: tile("stars-16", "#FF6B6B", "#D9304F"),
    summary: "Quick AI, AI Chat and AI Commands — running on your own providers and keys.",
    commandGroups: ["ai"],
    keywords: ["openai", "anthropic", "claude", "gpt", "gemini", "ollama", "openrouter", "api key", "byok", "llm", "provider", "model", "chat", "agents", "presets"],
    rows: [
      "Follow-up Behavior",
      "Background Notifications",
      "Prevent Sleep During AI Runs",
      "Show Warning Before Deleting Agents",
      "Show Warning Before Deleting AI Commands",
      "Models & Providers",
      "Agents",
      "AI Commands",
      "MCP Servers",
      "Default Models",
      "Quick AI Model",
      "AI Chat Model",
      "AI Commands Model",
      "Title Generation Model",
      "Reasoning Effort",
      "Tab to Ask AI",
      "Primary Action",
      "Send Message",
      "Start New Chat",
      "Conversation History",
      "Auto-Archive Chats",
      "Zoom",
      "Profile",
      "Memory",
      "Web Search Provider",
      "Web Search API Key",
      "Permissions",
      "Globally Allowed Tools",
      "Show Agents in Root Search",
      "Show Warning Before Deleting Chats",
      "Show Warning Before Editing Messages",
    ],
  },
  {
    id: "applications",
    title: "Applications",
    group: "builtin",
    icon: tile("app-window-grid-2x2-16", "#7C8CFF", "#4F5BEA"),
    summary: "Open, hide and quit the apps on your Mac.",
    commandGroups: ["applications"],
    keywords: ["apps"],
    rows: ["Search Scopes", "Deep Search", "Hotkey Action"],
  },
  {
    id: "calculator",
    title: "Calculator",
    group: "builtin",
    icon: tile("calculator-16", "#FFA24A", "#E66A00"),
    summary: "Math, units, currencies, dates and time zones right in root search.",
    commandGroups: ["calculator"],
    keywords: ["math", "units", "currency"],
    rows: ["Enable Flight Tracker", "Enable Weather", "Syntax Highlighting", "Enable Color Conversion", "REM/EM to Pixel Conversion", "Decimal Separator"],
  },
  {
    id: "calendar",
    title: "Calendar",
    group: "builtin",
    icon: tile("calendar-16", "#FF6B6B", "#E5383B"),
    summary: "See your schedule and join meetings.",
    commandGroups: ["calendar"],
    keywords: ["events", "schedule", "meetings"],
    rows: ["Calendar Access"],
  },
  {
    id: "clipboard-history",
    title: "Clipboard History",
    group: "builtin",
    icon: tile("clipboard-16", "#FF9F6B", "#E8663D"),
    summary: "Everything you copy, searchable — text, links, images, files and colors.",
    commandGroups: ["clipboard"],
    keywords: ["copy", "paste", "pasteboard"],
    rows: ["Recognition Mode", "Save Universal Clipboard Items Immediately", "Keep History For", "Save Images", "Save Files", "Text Recognition", "Primary Action", "Clear History", "Disabled Applications"],
  },
  {
    id: "developer",
    title: "Developer",
    group: "builtin",
    icon: tile("hammer-16", "#3FAF85", "#1E7A5A"),
    summary: "Tools for building and debugging extensions.",
    commandGroups: ["developer"],
    keywords: ["extension development", "reload"],
    rows: ["Disable Pop to Root Search", "Open OpenCast in Development Mode", "Use Node Production Environment", "Develop an Extension", "Auto-reload on Save", "Keep Window Always Visible During Development"],
  },
  {
    id: "emoji",
    title: "Emoji & Symbols",
    group: "builtin",
    icon: tile("emoji-16", "#FFD45C", "#F5A623"),
    summary: "Search and paste emoji and symbols.",
    commandGroups: ["emoji"],
    keywords: ["emoticons", "skin tone"],
    rows: ["Save AI-generated Custom Keywords", "Column Count", "Primary Action", "Emoji Skin Tone"],
  },
  {
    id: "file-search",
    title: "File Search",
    group: "builtin",
    icon: tile("magnifying-glass-16", "#5AB8FF", "#2D7FF0"),
    summary: "Find files and folders on your Mac.",
    commandGroups: ["files"],
    keywords: ["files", "folders", "finder", "index"],
    rows: ["Content Search", "Use Ignore Files", "Index Network & Removable Drives", "Keep Files from Removed Volumes", "Search Scopes", "Ignore Patterns", "Include Hidden Files", "Full Disk Access"],
  },
  {
    id: "mcp",
    title: "MCP",
    group: "builtin",
    icon: graphite("plug-16"),
    summary: "Connect Model Context Protocol servers to give AI new tools.",
    commandGroups: ["mcp"],
    keywords: ["model context protocol", "servers", "tools", "claude desktop", "import", "add server"],
    rows: ["MCP Servers"],
  },
  {
    id: "navigation",
    title: "Navigation",
    group: "builtin",
    icon: tile("app-window-list-16", "#6C8CFF", "#3D5BDB"),
    summary: "Search the menu bar items of the frontmost app.",
    commandGroups: ["menus", "navigation"],
    keywords: ["menu items", "menu bar"],
  },
  {
    id: "notes",
    title: "Notes",
    group: "builtin",
    icon: tile("blank-document-16", "#FFD45C", "#E9A100"),
    summary: "Floating notes, always one hotkey away.",
    commandGroups: ["notes"],
    keywords: ["floating notes"],
    rows: ["Show Notes Toggle Button in Menu Bar", "Escape Key Loses Focus", "Zoom", "Keep Window on Top"],
  },
  {
    id: "quicklinks",
    title: "Quicklinks",
    group: "builtin",
    icon: tile("link-16", "#B58CFF", "#8156F0"),
    summary: "Open links, files and folders with dynamic placeholders.",
    commandGroups: ["quicklinks"],
    keywords: ["links", "bookmarks"],
    rows: ["Show Link Previews", "Prefer Existing Tabs", "Pass Selected Text as Argument", "Show Warning Before Deleting Quicklinks"],
  },
  {
    id: "script-commands",
    title: "Script Commands",
    group: "builtin",
    icon: graphite("terminal-16"),
    summary: "Run your own shell, Python, Node and AppleScript scripts as commands.",
    commandGroups: ["scripts"],
    keywords: ["scripts", "bash", "shell", "create script"],
    rows: ["Script Folders", "Scripts"],
  },
  {
    id: "snippets",
    title: "Snippets",
    group: "builtin",
    icon: tile("snippets-16", "#5AB8FF", "#2D7FF0"),
    summary: "Text snippets that expand anywhere you type.",
    commandGroups: ["snippets"],
    keywords: ["text expansion", "keyword", "accessibility"],
    rows: ["Expansion Mode", "Injection Delay", "Response Time", "Completion Sound", "Override System Snippets", "Enable Snippet Expansion", "Expand within Words", "Accessibility Permission", "Disabled Applications", "Show Warning Before Deleting Snippets"],
  },
  {
    id: "system",
    title: "System",
    group: "builtin",
    icon: graphite("power-16"),
    summary: "Lock, sleep, restart, volume, appearance and more.",
    commandGroups: ["system"],
    keywords: ["lock", "sleep", "restart", "shutdown"],
  },
  {
    id: "translator",
    title: "Translator",
    group: "builtin",
    icon: tile("globe-01-16", "#52A8FF", "#1F6FE0"),
    summary: "Translate text between languages with your AI providers.",
    commandGroups: ["translator"],
    keywords: ["language", "translate"],
    rows: ["Default Source Language", "Default Target Language", "Use Selected Text as Source"],
  },
  {
    id: "web-searches",
    title: "Web Searches",
    group: "builtin",
    icon: tile("globe-01-16", "#5FE0A0", "#21B26B"),
    summary: "Search the web from root search.",
    commandGroups: ["web"],
    keywords: ["google", "duckduckgo"],
  },
  {
    id: "window-management",
    title: "Window Management",
    group: "builtin",
    icon: tile("app-window-sidebar-left-16", "#52D6D0", "#1A9E9E"),
    summary: "Move and resize windows with hotkeys.",
    commandGroups: ["windowManagement", "windows"],
    keywords: ["resize", "tiling", "halves", "gaps"],
    rows: ["Auto Close Empty Desktops", "Respect Stage Manager", "Window Gap", "Screen Gap", "Cycling", "Accessibility Permission"],
  },
];

/** Pages reached from another page; listed in search results under their parent. */
export const SUBPAGES: readonly PageEntry[] = [
  {
    id: "ai/models",
    title: "Models & Providers",
    group: "subpage",
    parent: "ai",
    icon: tile("stars-16", "#FF6B6B", "#D9304F"),
    keywords: ["api key", "base url", "openai", "anthropic", "gemini", "openrouter", "ollama", "lm studio", "cliproxyapi", "litellm", "azure", "custom provider", "local models"],
    rows: ["Providers", "Available Models"],
  },
  { id: "ai/presets", title: "Agents", group: "subpage", parent: "ai", icon: tile("stars-16", "#FF6B6B", "#D9304F"), keywords: ["presets", "instructions", "system prompt", "create agent"] },
  {
    id: "ai/commands",
    title: "AI Commands",
    group: "subpage",
    parent: "ai",
    icon: tile("stars-16", "#FF6B6B", "#D9304F"),
    keywords: ["prompts", "prompt", "create command", "import", "export"],
  },
];

/** Third group: one page per installed extension. */
export function extensionPages(extensions: readonly InstalledExtension[]): PageEntry[] {
  return [...extensions]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((extension) => ({
      id: `extensions/${extension.name}`,
      title: extension.title,
      group: "installed" as const,
      icon: extension.icon ?? EXTENSION_FALLBACK_ICON,
      keywords: [extension.name, extension.author, ...(extension.description ? [extension.description] : [])],
      rows: [...extension.preferences.map((p) => p.title ?? p.name), ...extension.commands.map((c) => c.title)],
    }));
}

/** The command group a command belongs to: its extension id, or the `builtin:<group>.` prefix. */
export function commandGroup(command: Pick<CommandInfo, "id" | "kind" | "extensionId">): string | undefined {
  if (command.extensionId) return command.extensionId;
  if (command.kind === "builtin") return command.id.slice("builtin:".length).split(".")[0];
  if (command.kind === "extension") return command.id.slice("ext:".length).split(".")[0];
  return undefined;
}

/** The sidebar entry that owns a route: subpages and providers select their parent. */
export function sidebarIdFor(route: string): string {
  if (route.startsWith("extensions/")) return route;
  if (route.startsWith("ai/")) return "ai";
  return route.split("/")[0];
}

export const ALL_STATIC_PAGES: readonly PageEntry[] = [...CORE_PAGES, ...BUILTIN_PAGES, ...SUBPAGES];
