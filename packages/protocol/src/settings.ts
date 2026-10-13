/**
 * Every OpenCast setting, its default, and whether it syncs.
 *
 * Keys are "<page>.<field>" and mirror Raycast's settings pages so the
 * Settings window can be laid out the same way. Values must be JSON.
 * Secrets (API keys, passphrases) are NOT settings — they live in the
 * Keychain via the secrets service.
 */

import type { AIChatFolder } from "./models";
import type { Hotkey } from "./ui";

export type SyncCategory =
  | "general-settings.appearance"
  | "general-settings.ui-zoom"
  | "general-settings.open-at-login"
  | "general-settings.show-in-menu-bar"
  | "general-settings.window-mode"
  | "always";

export interface SettingDef<T> {
  default: T;
  /** "device" settings never leave this Mac. */
  scope: "synced" | "device";
  /** For synced settings, the Cloud Sync category toggle that controls them. */
  category?: SyncCategory;
}

const synced = <T>(value: T, category: SyncCategory = "always"): SettingDef<T> => ({ default: value, scope: "synced", category });
const device = <T>(value: T): SettingDef<T> => ({ default: value, scope: "device" });

export type Appearance = "system" | "light" | "dark";
export type Duration = "never" | "immediately" | `${number}s` | `${number}m` | `${number}h` | `${number}d`;

export const SETTINGS = {
  // ---- General ---------------------------------------------------------------
  "general.appearance": synced<Appearance>("system", "general-settings.appearance"),
  "general.themeDark": synced("opencast-dark", "general-settings.appearance"),
  "general.themeLight": synced("opencast-light", "general-settings.appearance"),
  /** 1 = default, 1.15 = large. */
  "general.uiZoom": synced(1, "general-settings.ui-zoom"),
  "general.windowMode": synced<"expanded" | "compact">("expanded", "general-settings.window-mode"),
  "general.showFavoritesInCompactMode": synced(true, "general-settings.window-mode"),
  "general.openAtLogin": device(true),
  "general.showInMenuBar": synced(true, "general-settings.show-in-menu-bar"),
  "general.globalHotkey": device<Hotkey>({ modifiers: ["opt"], key: "space", keyCode: 49 }),

  // ---- Launcher ----------------------------------------------------------------
  "launcher.windowPresentationMode": synced<"mouse-screen" | "active-window-screen" | "primary-screen">("mouse-screen"),
  /** Seconds before the launcher resets to root search when reopened. -1 = never, 0 = immediately. */
  "launcher.popToRootTimeout": synced(90),
  "launcher.rootSearchSensitivity": synced<"low" | "medium" | "high">("high"),
  "launcher.includeFilesInRootSearch": synced(false),
  "launcher.showRecentlyUsed": synced(true),
  /** Ordered command ids shown when root search has no match (e.g. "builtin:ai.ask", "builtin:file-search", "quicklink:google"). */
  "launcher.fallbackCommands": synced<string[]>(["builtin:ai.askAi", "builtin:files.searchFiles", "builtin:web.google"]),

  // ---- Keyboard ------------------------------------------------------------------
  "keyboard.escapeKeyBehavior": synced<"pop-back-or-close" | "close-window">("pop-back-or-close"),
  "keyboard.navigationBindings": synced<"macos" | "emacs" | "vim">("emacs"),
  "keyboard.pageNavigationKeys": synced<"square-brackets" | "page-keys">("square-brackets"),
  "keyboard.hyperKey": device<"none" | "caps-lock" | "right-cmd" | "right-opt">("none"),
  "keyboard.hyperKeyIncludeShift": device(true),
  "keyboard.escapeKeyClosesWindow": synced(true),
  "keyboard.builtinHotkeysPreset": synced<"improved" | "original">("improved"),
  "keyboard.hyperKeyDisplayShortcut": device(true),

  // ---- Advanced ------------------------------------------------------------------
  "advanced.faviconProvider": synced<"google" | "duckduckgo" | "none">("google"),
  "advanced.useSystemProxySettings": device(false),
  "advanced.backupFrequency": device<"never" | "daily" | "weekly" | "monthly">("never"),
  "advanced.backupLocation": device<string | null>(null),
  "advanced.backupAutoDelete": device<"never" | 1 | 5 | 10>("never"),
  "advanced.backupSkipOnBattery": device(true),
  "advanced.additionalCertificateAuthorities": device<string[]>([]),
  "advanced.windowActivationBehavior": synced<"move-to-active-space" | "switch-space">("move-to-active-space"),
  "advanced.tidyMenuBar": device(false),

  // ---- AI ------------------------------------------------------------------------
  /** "<providerId>/<modelId>" or null = first enabled model. */
  "ai.quickAiModel": synced<string | null>(null),
  "ai.chatModel": synced<string | null>(null),
  "ai.commandsModel": synced<string | null>(null),
  "ai.titleModel": synced<string | null>(null),
  "ai.quickAiReasoningEffort": synced<"none" | "low" | "medium" | "high">("medium"),
  "ai.tabToAskAi": synced(true),
  "ai.primaryAction": synced<"continue-in-chat" | "copy" | "paste">("continue-in-chat"),
  "ai.conversationHistory": synced<"combined" | "separate">("combined"),
  "ai.startNewChat": synced<Duration>("15m"),
  "ai.sendMessage": synced<"enter" | "cmd-enter">("enter"),
  "ai.zoom": synced(1),
  "ai.autoArchiveChats": synced<Duration>("never"),
  "ai.runningSendAction": synced<"queue" | "steer">("queue"),
  "ai.backgroundNotifications": device(false),
  "ai.preventIdleSleep": device(false),
  "ai.toolConfirmationMode": synced<"ask" | "auto-read-only" | "always-allow">("ask"),
  "ai.alwaysAllowedTools": synced<string[]>([]),
  "ai.deleteChatWarning": synced(true),
  "ai.deleteAgentWarning": synced(true),
  "ai.deleteAiCommandWarning": synced(true),
  "ai.editMessageWarning": synced(true),
  /** Show saved agents in root search (Raycast Search Agents). */
  "ai.searchAgents": synced(false),
  /** Folders of the AI Chat sidebar. */
  "ai.chatFolders": synced<AIChatFolder[]>([]),
  /** Personal context added to every chat (not to AI Commands). */
  "ai.profile": synced(""),
  "ai.memoryEnabled": synced(false),
  "ai.webSearchProvider": synced<"none" | "tavily" | "brave" | "exa" | "searxng" | "jina">("none"),
  "ai.webSearchBaseUrl": synced<string | null>(null),

  // ---- Clipboard History -------------------------------------------------------
  "clipboard.keepHistoryFor": synced<Duration | "unlimited">("90d"),
  "clipboard.disabledApplications": synced<string[]>([
    "com.1password.1password",
    "com.agilebits.onepassword7",
    "com.bitwarden.desktop",
    "com.apple.keychainaccess",
    "com.apple.Passwords",
  ]),
  "clipboard.saveImages": synced(true),
  "clipboard.saveFiles": synced(true),
  "clipboard.textRecognitionEnabled": synced(true),
  "clipboard.recognitionMode": synced<"fast" | "accurate">("accurate"),
  "clipboard.captureUniversalClipboard": device(false),
  "clipboard.primaryAction": synced<"paste" | "copy">("paste"),

  // ---- Snippets ---------------------------------------------------------------
  "snippets.autoExpansionEnabled": device(true),
  "snippets.expandWithinWords": synced(true),
  "snippets.expansionMode": synced<"immediately" | "after-delimiter-keeping" | "after-delimiter-discarding">("immediately"),
  "snippets.overrideSystemSnippets": device(false),
  "snippets.injectionDelay": synced<"none" | "short" | "regular" | "long" | "extra-long">("none"),
  "snippets.responseTime": device<"instant" | "quick" | "default" | "delayed" | "extended">("default"),
  "snippets.completionSound": synced(""),
  "snippets.disabledApplications": synced<string[]>([]),
  "snippets.deleteSnippetWarning": synced(true),

  // ---- Quicklinks -------------------------------------------------------------
  "quicklinks.passSelectedTextAsArgument": synced(false),
  "quicklinks.showLinkPreviews": synced(true),
  "quicklinks.preferExistingTabs": synced(false),
  "quicklinks.deleteQuicklinkWarning": synced(true),

  // ---- Notes ------------------------------------------------------------------
  "notes.showMenuBarToggle": synced(false),
  "notes.escapeKeyLosesFocus": synced(true),
  "notes.zoom": synced(1),
  "notes.alwaysOnTop": device(true),

  // ---- Window Management ------------------------------------------------------
  "windowManagement.innerGap": synced(0),
  "windowManagement.outerGap": synced(0),
  "windowManagement.autoCloseEmptyDesktops": device(false),
  "windowManagement.respectStageManager": device(true),
  "windowManagement.cycling": synced<"off" | "halves-thirds" | "halves-thirds-quarters">("halves-thirds"),

  // ---- Calculator -------------------------------------------------------------
  "calculator.colorConversion": synced(true),
  "calculator.flightTracker": synced(true),
  "calculator.weather": synced(true),
  "calculator.syntaxHighlighting": synced(true),
  "calculator.remToPxRate": synced(16),
  "calculator.decimalSeparator": synced<"auto" | "." | ",">("auto"),

  // ---- Emoji ------------------------------------------------------------------
  "emoji.columns": synced(8),
  "emoji.primaryAction": synced<"paste" | "copy">("paste"),
  "emoji.saveAiCustomKeyword": synced(true),
  "emoji.skinTone": synced<0 | 1 | 2 | 3 | 4 | 5>(0),

  // ---- File Search ------------------------------------------------------------
  "files.directories": device<string[]>(["~"]),
  "files.ignorePatterns": synced<string[]>(["node_modules", ".git", "Library"]),
  "files.includeHiddenFiles": synced(false),
  "files.contentSearch": synced(false),
  "files.useIgnoreFiles": synced(true),
  "files.indexNetworkAndRemovableVolumes": device(false),
  "files.keepRemovedVolumeFiles": device(false),

  // ---- Applications -----------------------------------------------------------
  "applications.hotkeyBehavior": synced<"open" | "toggle">("toggle"),
  "applications.directories": device<string[]>([]),
  "applications.recursiveSearch": device(false),

  // ---- Script Commands ---------------------------------------------------------
  "scripts.directories": device<string[]>([]),

  // ---- Translator --------------------------------------------------------------
  "translator.defaultSourceLanguage": synced("auto"),
  "translator.defaultTargetLanguage": synced("en"),
  "translator.prefillFromSelectedText": synced(true),
  "translator.primaryAction": synced<"copy" | "paste">("copy"),

  // ---- Developer ---------------------------------------------------------------
  "developer.autoReloadOnSave": device(true),
  "developer.keepWindowVisibleDuringDevelopment": device(false),
  "developer.disablePopToRootSearch": device(false),
  "developer.openOpenCastInDevelopmentMode": device(true),
  "developer.useNodeProductionEnvironment": device(false),

  // ---- Cloud Sync (device-local configuration; secrets are in the Keychain) -----
  "sync.enabled": device(false),
  "sync.serverUrl": device<string | null>(null),
  "sync.deviceName": device<string | null>(null),
  "sync.intervalSeconds": device(300),
  /** Sync category ids that are turned off (see SYNC_CATEGORIES). */
  "sync.disabledCategories": device<string[]>([]),
} satisfies Record<string, SettingDef<unknown>>;

export type SettingsKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingsKey> = (typeof SETTINGS)[K]["default"];
export type SettingsValues = { [K in SettingsKey]: SettingValue<K> };

export function defaultSettings(): SettingsValues {
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(SETTINGS)) out[key] = JSON.parse(JSON.stringify(def.default));
  return out as SettingsValues;
}

export function isSettingsKey(key: string): key is SettingsKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, key);
}

/**
 * Cloud Sync categories (Settings → Cloud Sync → Synced Content).
 * `collections` lists the EntityStore collections each category covers.
 */
export const SYNC_CATEGORIES = [
  { id: "ai-presets-commands", title: "AI Commands & Presets", collections: ["aiCommands", "aiPresets", "aiProviders"] },
  { id: "ai-history", title: "AI Chat History", collections: ["aiChats", "aiMessages"] },
  { id: "mcp-servers", title: "MCP Servers", collections: ["mcpServers"] },
  { id: "quicklinks", title: "Quicklinks", collections: ["quicklinks"] },
  { id: "notes", title: "Notes", collections: ["notes"] },
  { id: "snippets", title: "Snippets", collections: ["snippets"] },
  { id: "window-management-layouts", title: "Window Management Layouts", collections: ["windowLayouts"] },
  { id: "extensions", title: "Extensions", collections: ["extensions"] },
  { id: "general-settings.appearance", title: "Appearance", collections: [] },
  { id: "general-settings.ui-zoom", title: "Interface Size", collections: [] },
  { id: "general-settings.open-at-login", title: "Open at Login", collections: [] },
  { id: "general-settings.show-in-menu-bar", title: "Show in Menu Bar", collections: [] },
  { id: "general-settings.window-mode", title: "Window Mode", collections: [] },
] as const;

/** Collections that always sync while Cloud Sync is on (no toggle). */
export const ALWAYS_SYNCED_COLLECTIONS = ["settings", "commandPrefs", "themes", "translatorCommands"] as const;
