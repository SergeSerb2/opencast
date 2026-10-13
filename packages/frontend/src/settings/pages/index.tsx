import type { ComponentType } from "react";
import { AboutPage } from "./AboutPage";
import { AdvancedPage } from "./AdvancedPage";
import { AIPage } from "./ai/AIPage";
import { AICommandsPage, PresetsPage } from "./ai/LibraryPages";
import { MCPPage } from "./ai/MCPPage";
import { ModelsPage } from "./ai/ModelsPage";
import { ProviderPage } from "./ai/ProviderPage";
import { CloudSyncPage } from "./CloudSyncPage";
import { ExtensionPage } from "./ExtensionPage";
import {
  ApplicationsPage,
  CalculatorPage,
  CalendarPage,
  ClipboardHistoryPage,
  CommandsOnlyPage,
  DeveloperPage,
  EmojiPage,
  FileSearchPage,
  NotesPage,
  QuicklinksPage,
  ScriptCommandsPage,
  SnippetsPage,
  TranslatorPage,
  WindowManagementPage,
} from "./FeaturePages";
import { GeneralPage } from "./GeneralPage";
import { KeyboardPage } from "./KeyboardPage";
import { LauncherPage } from "./LauncherPage";
import { ShortcutsPage } from "./ShortcutsPage";

const PAGES: Record<string, ComponentType> = {
  general: GeneralPage,
  launcher: LauncherPage,
  shortcuts: ShortcutsPage,
  keyboard: KeyboardPage,
  "cloud-sync": CloudSyncPage,
  advanced: AdvancedPage,
  about: AboutPage,
  ai: AIPage,
  "ai/models": ModelsPage,
  "ai/commands": AICommandsPage,
  "ai/presets": PresetsPage,
  mcp: MCPPage,
  applications: ApplicationsPage,
  calculator: CalculatorPage,
  calendar: CalendarPage,
  "clipboard-history": ClipboardHistoryPage,
  developer: DeveloperPage,
  emoji: EmojiPage,
  "file-search": FileSearchPage,
  notes: NotesPage,
  quicklinks: QuicklinksPage,
  "script-commands": ScriptCommandsPage,
  snippets: SnippetsPage,
  translator: TranslatorPage,
  "window-management": WindowManagementPage,
  navigation: () => <CommandsOnlyPage id="navigation" />,
  system: () => <CommandsOnlyPage id="system" />,
  "web-searches": () => <CommandsOnlyPage id="web-searches" />,
};

/** The page component for a normalized route; unknown routes show General. */
export function PageForRoute({ route }: { route: string }) {
  if (route.startsWith("extensions/")) return <ExtensionPage name={route.slice("extensions/".length)} />;
  if (route.startsWith("ai/providers/new/")) return <ProviderPage templateId={route.slice("ai/providers/new/".length)} />;
  if (route.startsWith("ai/providers/")) return <ProviderPage id={route.slice("ai/providers/".length)} />;
  const Page = PAGES[route] ?? GeneralPage;
  return <Page />;
}
