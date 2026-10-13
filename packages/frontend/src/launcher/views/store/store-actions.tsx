import type { CommandInfo, ImageLike, InstalledExtension, StoreExtension } from "@opencast/protocol";
import { confirmAlert, showFailureToast, type ActionModel, type ActionPanelModel, type ActionSectionModel } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { launchCommand } from "../../launch";
import { useNavigationStore } from "../../navigation";
import { ExtensionCommandsView } from "../extensions/ExtensionCommandsView";
import { copyText, openUrl } from "../extensions/actions-common";
import { fetchStoreUrl, installStoreExtension, openExtensionPreferences, uninstallExtension } from "../extensions/lifecycle";
import { extensionCommandRows, hasPreferences, installedExtensionIcon } from "../extensions/model";
import { changelogUrl, developerUrl, storeIcon, storeSlug, supportsMacOS } from "./model";

export interface StoreActionOptions {
  listing: StoreExtension;
  /** The local install, when the extension is installed on this Mac. */
  installed?: InstalledExtension;
  commands?: CommandInfo[];
  /** "Show Details" in the Store list. */
  showDetails?: () => void;
  /** Previous/Next Extension in the detail view opened from the list. */
  previous?: () => void;
  next?: () => void;
}

/**
 * Open (one command directly, several through a submenu), configure and
 * uninstall an installed extension. Without an enabled command, "Show
 * Commands" lets the user turn one on instead of landing on Uninstall.
 */
function installedActions(installed: InstalledExtension, commands: CommandInfo[] | undefined, extensionIcon: ImageLike): ActionModel[] {
  const rows = extensionCommandRows(installed, commands, installedExtensionIcon(installed, commands)).filter((row) => row.enabled);
  const open: ActionModel[] = rows.map((row) => ({
    id: `open:${row.id}`,
    title: row.manifest.title,
    icon: row.icon,
    onAction: () => launchCommand(row.id, { title: row.manifest.title, icon: row.icon }),
  }));
  const actions: ActionModel[] = [];
  if (open.length === 1) actions.push(open[0]);
  else if (open.length > 1) actions.push({ id: "open-commands", title: "Open Commands…", icon: extensionIcon, submenu: { searchPlaceholder: "Search commands…", sections: [{ actions: open }] } });
  else
    actions.push({
      id: "show-commands",
      title: "Show Commands",
      icon: "bullet-points-16",
      onAction: () => useNavigationStore.getState().push({ kind: "element", element: <ExtensionCommandsView extensionName={installed.name} />, title: installed.title }),
    });
  if (hasPreferences(installed))
    actions.push({ id: "configure", title: "Configure Extension", icon: "cog-16", shortcut: sc("opt", "cmd", ","), onAction: () => openExtensionPreferences(installed, extensionIcon) });
  actions.push({ id: "uninstall", title: "Uninstall Extension", icon: "trash-16", style: "destructive", shortcut: sc("ctrl", "x"), onAction: () => uninstallExtension(installed, extensionIcon) });
  return actions;
}

async function install(listing: StoreExtension): Promise<void> {
  if (!supportsMacOS(listing)) {
    const confirmed = await confirmAlert({
      title: "Platform Not Supported",
      message: "This extension isn't built for macOS and may not work as expected.",
      icon: storeIcon(listing.icon),
      primaryAction: { title: "Install Anyway" },
    });
    if (!confirmed) return;
  }
  await installStoreExtension({ slug: storeSlug(listing), title: listing.title });
}

/** Action panel for a Store listing (list row or detail view), following Raycast's Store actions. */
export function storeListingActions({ listing, installed, commands, showDetails, previous, next }: StoreActionOptions): ActionPanelModel {
  const main: ActionModel[] = [];
  if (showDetails) main.push({ id: "show-details", title: "Show Details", icon: "app-window-sidebar-left-16", onAction: showDetails });
  if (installed) {
    main.push(...installedActions(installed, commands, storeIcon(listing.icon)));
  } else {
    main.push({ id: "install", title: supportsMacOS(listing) ? "Install Extension" : "Install Extension Anyway", icon: "arrow-down-circle-16", onAction: () => install(listing) });
  }

  const links: ActionModel[] = [
    { id: "open-in-browser", title: "Open in Browser", icon: "globe-01-16", shortcut: sc("cmd", "o"), onAction: () => openUrl(listing.storeUrl) },
    { id: "copy-url", title: "Copy Extension URL", icon: "link-16", shortcut: sc("cmd", "shift", "c"), onAction: () => copyText(listing.storeUrl, "Copied Extension URL") },
  ];
  const developer = developerUrl(listing);
  if (developer) links.push({ id: "view-developer", title: "View Developer", icon: "person-16", shortcut: sc("opt", "shift", "cmd", "o"), onAction: () => openUrl(developer) });
  const changelog = changelogUrl(listing.sourceUrl);
  if (changelog) links.push({ id: "view-changelog", title: "View Changelog", icon: "blank-document-16", shortcut: sc("opt", "shift", "cmd", "v"), onAction: () => openUrl(changelog) });
  if (listing.sourceUrl) {
    const source = listing.sourceUrl;
    links.push({ id: "view-source", title: "View Source Code", icon: "code-16", shortcut: sc("cmd", "shift", "o"), onAction: () => openUrl(source) });
  }

  const navigation: ActionModel[] = [];
  if (previous) navigation.push({ id: "previous", title: "Previous Extension", icon: "chevron-left-16", shortcut: sc("cmd", "["), onAction: previous });
  if (next) navigation.push({ id: "next", title: "Next Extension", icon: "chevron-right-16", shortcut: sc("cmd", "]"), onAction: next });

  const sections: ActionSectionModel[] = [
    { id: "general", actions: main },
    { id: "links", actions: links },
  ];
  if (navigation.length) sections.push({ id: "navigation", actions: navigation });
  return { title: listing.title, sections };
}

/** Installed Store extensions (the "Installed" category) have no listing loaded; links resolve it on demand. */
export function installedListingActions({ installed, commands, showDetails }: { installed: InstalledExtension; commands?: CommandInfo[]; showDetails: () => void }): ActionPanelModel {
  const main: ActionModel[] = [
    { id: "show-details", title: "Show Details", icon: "app-window-sidebar-left-16", onAction: showDetails },
    ...installedActions(installed, commands, installedExtensionIcon(installed, commands)),
  ];
  const withStoreUrl = (run: (url: string) => Promise<void>) => () =>
    fetchStoreUrl(installed).then(run, (error: unknown) => {
      showFailureToast("Could not find the extension in the Store", error);
    });
  const links: ActionModel[] = [
    { id: "open-in-browser", title: "Open in Browser", icon: "globe-01-16", shortcut: sc("cmd", "o"), onAction: withStoreUrl(openUrl) },
    { id: "copy-url", title: "Copy Extension URL", icon: "link-16", shortcut: sc("cmd", "shift", "c"), onAction: withStoreUrl((url) => copyText(url, "Copied Extension URL")) },
  ];
  return {
    title: installed.title,
    sections: [
      { id: "general", actions: main },
      { id: "links", actions: links },
    ],
  };
}
