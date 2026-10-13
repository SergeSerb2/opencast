import type { ImageLike, InstalledExtension } from "@opencast/protocol";
import { showFailureToast, type ActionModel, type ActionPanelModel, type ActionSectionModel } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { copyText, openUrl, showInFinder } from "./actions-common";
import {
  developLocalExtension,
  fetchStoreUrl,
  importLocalExtension,
  installStoreExtension,
  openExtensionPreferences,
  openStore,
  setExtensionEnabled,
  uninstallExtension,
  updateExtension,
} from "./lifecycle";
import { hasPreferences, installedStoreSlug, isInstalledHere } from "./model";

export interface ManageActionHandlers {
  showCommands: (extension: InstalledExtension) => void;
  showInStore: (extension: InstalledExtension) => void;
  checkForUpdates: () => void;
}

/** Ways to add extensions; also the actions of the empty view (searching the Store for `query` when set). */
export function addExtensionActions(query = ""): ActionModel[] {
  const q = query.trim();
  return [
    q ? { id: "search-store", title: `Search Store for “${q}”`, icon: "store-16", onAction: () => openStore(q) } : { id: "browse-store", title: "Browse Store", icon: "store-16", onAction: () => openStore() },
    { id: "import", title: "Import Extension", icon: "download-16", shortcut: sc("cmd", "shift", "o"), onAction: importLocalExtension },
    { id: "develop", title: "Develop Local Extension", icon: "hammer-16", onAction: developLocalExtension },
  ];
}

function storeLinkAction(extension: InstalledExtension, run: (url: string) => Promise<void>): () => Promise<void> {
  return () =>
    fetchStoreUrl(extension).then(run, (error: unknown) => {
      showFailureToast("Could not find the extension in the Store", error);
    });
}

/** Action panel for a row in Manage Extensions. */
export function manageExtensionActions(extension: InstalledExtension, icon: ImageLike, handlers: ManageActionHandlers): ActionPanelModel {
  const installedHere = isInstalledHere(extension);
  const fromStore = extension.source === "store";

  const main: ActionModel[] = [];
  if (!installedHere && fromStore)
    main.push({ id: "install", title: "Install on This Mac", icon: "arrow-down-circle-16", onAction: () => installStoreExtension({ slug: installedStoreSlug(extension), title: extension.title }) });
  main.push({ id: "show-commands", title: "Show Commands", icon: "bullet-points-16", onAction: () => handlers.showCommands(extension) });
  if (hasPreferences(extension))
    main.push({ id: "preferences", title: "Open Preferences", icon: "cog-16", shortcut: sc("opt", "cmd", ","), onAction: () => openExtensionPreferences(extension, icon) });
  main.push(
    extension.enabled
      ? { id: "disable", title: "Disable Extension", icon: "circle-disabled-16", shortcut: sc("cmd", "shift", "d"), onAction: () => setExtensionEnabled(extension, false) }
      : { id: "enable", title: "Enable Extension", icon: "check-circle-16", shortcut: sc("cmd", "shift", "d"), onAction: () => setExtensionEnabled(extension, true) },
  );

  const updates: ActionModel[] = [{ id: "check-updates", title: "Check for Updates", icon: "arrow-clockwise-16", shortcut: sc("cmd", "u"), onAction: handlers.checkForUpdates }];
  if (fromStore && installedHere) updates.push({ id: "update", title: "Update Extension", icon: "arrow-down-circle-16", onAction: () => updateExtension(extension) });

  const store: ActionModel[] = fromStore
    ? [
        { id: "show-in-store", title: "Show in Store", icon: "store-16", onAction: () => handlers.showInStore(extension) },
        { id: "open-in-browser", title: "Open in Browser", icon: "globe-01-16", shortcut: sc("cmd", "o"), onAction: storeLinkAction(extension, openUrl) },
        { id: "copy-store-link", title: "Copy Store Link", icon: "link-16", shortcut: sc("opt", "cmd", "c"), onAction: storeLinkAction(extension, (url) => copyText(url, "Copied Store Link")) },
      ]
    : [];

  const files: ActionModel[] = [{ id: "copy-name", title: "Copy Extension Name", icon: "copy-clipboard-16", shortcut: sc("cmd", "shift", "c"), onAction: () => copyText(extension.name) }];
  if (extension.path) {
    const path = extension.path;
    files.unshift({ id: "show-in-finder", title: "Show in Finder", icon: "finder-16", shortcut: sc("cmd", "shift", "f"), onAction: () => showInFinder(path) });
  }

  const danger: ActionModel[] = [
    { id: "uninstall", title: "Uninstall Extension", icon: "trash-16", style: "destructive", shortcut: sc("ctrl", "x"), onAction: () => uninstallExtension(extension, icon) },
  ];

  const sections: ActionSectionModel[] = [
    { id: "main", actions: main },
    { id: "updates", title: "Updates", actions: updates },
    { id: "store", title: "Store", actions: store },
    { id: "files", actions: files },
    { id: "add", title: "Add Extensions", actions: addExtensionActions() },
    { id: "danger", actions: danger },
  ];
  return { title: extension.title, sections: sections.filter((s) => s.actions.length > 0) };
}
