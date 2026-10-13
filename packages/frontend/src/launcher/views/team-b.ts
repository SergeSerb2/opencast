/**
 * Team B launcher views: window management, menu items, calendar, processes,
 * script commands, data import/export, store and extensions, AI commands and
 * presets, translator and theme studio.
 */
import { registerView } from "./registry";

// ---- system: window-management, menu-items, calendar, processes ----
import { WindowManagementView } from "./window-management/WindowManagementView";
registerView("window-management", WindowManagementView);
registerView("window-management.create", WindowManagementView);
import { MenuItemsView } from "./menu-items/MenuItemsView";
registerView("menu-items", MenuItemsView);
import { ScheduleView } from "./calendar/ScheduleView";
registerView("calendar", ScheduleView);
import { ProcessesView } from "./processes/ProcessesView";
registerView("processes", ProcessesView);

// ---- scripts & data: scripts, scripts.create, data.import, data.export, storage ----
import { ScriptCommandsView } from "./scripts/ScriptCommandsView";
import { CreateScriptCommandView } from "./scripts/CreateScriptCommandView";
import { ImportDataView } from "./data/ImportDataView";
import { ExportDataView } from "./data/ExportDataView";
import { StorageView } from "./data/StorageView";
registerView("scripts", ScriptCommandsView);
registerView("scripts.create", CreateScriptCommandView);
registerView("data.import", ImportDataView);
registerView("data.export", ExportDataView);
registerView("storage", StorageView);

// ---- store: store, store.extension, extensions ----
import { StoreView } from "./store/StoreView";
import { StoreExtensionView } from "./store/StoreExtensionView";
import { ManageExtensionsView } from "./extensions/ManageExtensionsView";
registerView("store", StoreView);
registerView("store.extension", StoreExtensionView);
registerView("extensions", ManageExtensionsView);

// ---- ai: ai.commands, ai.commands.create, ai.presets, ai.presets.create ----
import { AICommandEditorView, AICommandsView } from "./ai-commands/AICommandsView";
registerView("ai.commands", AICommandsView);
registerView("ai.commands.create", AICommandEditorView);
import { AIPresetEditorView, AIPresetsView } from "./ai-presets/AIPresetsView";
registerView("ai.presets", AIPresetsView);
registerView("ai.presets.create", AIPresetEditorView);

// ---- theme & translator: theme-studio, translator ----
import { ThemeStudioView } from "./theme-studio/ThemeStudioView";
registerView("theme-studio", ThemeStudioView);
import { TranslatorView } from "./translator/TranslatorView";
registerView("translator", TranslatorView);
