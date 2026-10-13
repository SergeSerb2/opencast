import type { CalculatorResult, CommandPrefs, RootSearchItem } from "@surgecast/protocol";
import { backend } from "../../bridge/backend";
import { native } from "../../bridge/native";
import type { ActionModel, ActionPanelModel } from "../../components/actions/model";
import { showHUD } from "../../components/feedback/hud";
import { confirmAlert } from "../../components/feedback/alert-store";
import { showFailureToast, showToast } from "../../components/feedback/toast-store";
import { sc } from "../../lib/keyboard";
import { hideLauncher, launchCommandInfo } from "../launch";
import { useNavigationStore } from "../navigation";
import { commandDeeplink, type RootRow } from "./root-items";
import { SetAliasView, SetHotkeyView } from "./CommandPrefsViews";

export interface RootActionContext {
  query: string;
  arguments: Record<string, string>;
  /** Index among favorites and their count (for Move Up/Down). */
  favoriteIndex: number;
  favoriteCount: number;
  /** Validate inline arguments; returns false (and focuses the field) when one is missing. */
  validateArguments: () => boolean;
}

async function setPrefs(item: RootSearchItem, prefs: Partial<CommandPrefs>, success?: string): Promise<void> {
  try {
    await backend.call("commands.setPrefs", { id: item.id, prefs });
    if (success) showToast({ style: "success", title: success });
  } catch (error) {
    showFailureToast("Could not update the command", error);
  }
}

function copy(text: string, hud = "Copied to Clipboard"): Promise<void> {
  return native
    .call("clipboard.write", { content: { kind: "text", text } })
    .then(() => showHUD(hud))
    .catch((error) => {
      showFailureToast("Failed to copy", error);
    });
}

const appTarget = (item: RootSearchItem) => item.id.replace(/^app:/, "");
const appPath = (item: RootSearchItem) => (item.subtitle?.startsWith("/") ? item.subtitle : undefined);

/** Actions for a root search row, mirroring Raycast's root action panel. */
export function rootActions(row: RootRow, context: RootActionContext): ActionPanelModel {
  const { item } = row;
  const isApp = item.kind === "app";
  const open: ActionModel = {
    id: "open",
    title: isApp ? "Open Application" : "Open Command",
    icon: isApp ? "app-window-16" : "arrow-ne-16",
    onAction: () => {
      if (!row.fallback && !context.validateArguments()) return;
      return launchCommandInfo(item, {
        arguments: Object.keys(context.arguments).length ? context.arguments : undefined,
        fallbackText: row.fallback ? context.query : undefined,
        source: row.fallback ? "fallback" : "root",
      });
    },
  };

  const primary: ActionModel[] = [open];
  if (isApp) {
    const path = appPath(item);
    if (path) primary.push({ id: "show-in-finder", title: "Show in Finder", icon: "finder-16", shortcut: sc("cmd", "return"), onAction: () => native.call("open.showInFinder", { path }).then(hideLauncher) });
  }

  const favorites: ActionModel[] = [];
  if (!row.fallback) {
    if (item.favorite) {
      favorites.push({ id: "unfavorite", title: "Remove from Favorites", icon: "star-disabled-16", shortcut: sc("cmd", "shift", "f"), onAction: () => setPrefs(item, { favoriteOrder: undefined }, "Removed from Favorites") });
      if (context.favoriteIndex > 0)
        favorites.push({ id: "move-up", title: "Move Up in Favorites", icon: "arrow-up-16", shortcut: sc("opt", "cmd", "arrowUp"), onAction: () => backend.call("commands.moveFavorite", { id: item.id, toIndex: context.favoriteIndex - 1 }) });
      if (context.favoriteIndex >= 0 && context.favoriteIndex < context.favoriteCount - 1)
        favorites.push({ id: "move-down", title: "Move Down in Favorites", icon: "arrow-down-16", shortcut: sc("opt", "cmd", "arrowDown"), onAction: () => backend.call("commands.moveFavorite", { id: item.id, toIndex: context.favoriteIndex + 1 }) });
    } else {
      favorites.push({ id: "favorite", title: "Add to Favorites", icon: "star-16", shortcut: sc("cmd", "shift", "f"), onAction: () => setPrefs(item, { favoriteOrder: context.favoriteCount }, "Added to Favorites") });
    }
  }

  const copyActions: ActionModel[] = [];
  if (isApp) {
    const path = appPath(item);
    if (path) copyActions.push({ id: "copy-path", title: "Copy Path", icon: "copy-clipboard-16", shortcut: sc("cmd", "shift", "."), onAction: () => copy(path) });
  } else {
    copyActions.push({ id: "copy-deeplink", title: "Copy Deeplink", icon: "link-16", shortcut: sc("cmd", "shift", "c"), onAction: () => copy(commandDeeplink(item), "Copied Deeplink") });
  }

  const nav = useNavigationStore.getState();
  const configure: ActionModel[] = [];
  if (item.kind === "extension" && item.extensionId) {
    const [extension, command] = item.id.slice(4).split(".");
    configure.push({
      id: "configure",
      title: "Configure Command",
      icon: "cog-16",
      shortcut: sc("cmd", "shift", ","),
      onAction: () => nav.push({ kind: "builtin", view: { id: "extension.preferences", title: `${item.extensionTitle ?? extension} Preferences`, props: { extensionName: extension, commandName: command } }, title: `${item.title} Preferences`, icon: item.icon }),
    });
  } else {
    configure.push({ id: "configure", title: "Configure Command", icon: "cog-16", shortcut: sc("cmd", "shift", ","), onAction: () => native.call("window.show", { kind: "settings", route: `extensions/${encodeURIComponent(item.id)}` }).then(hideLauncher) });
  }
  configure.push(
    { id: "alias", title: item.alias ? "Change Alias…" : "Set Alias…", icon: "text-input-16", onAction: () => nav.push({ kind: "element", element: <SetAliasView item={item} />, title: "Set Alias", icon: item.icon }) },
    { id: "hotkey", title: item.hotkey ? "Change Hotkey…" : "Set Hotkey…", icon: "keyboard-16", onAction: () => nav.push({ kind: "element", element: <SetHotkeyView item={item} />, title: "Set Hotkey", icon: item.icon }) },
  );

  const manage: ActionModel[] = [];
  if (isApp && item.running) {
    manage.push(
      { id: "quit", title: "Quit Application", icon: "xmark-circle-16", shortcut: sc("cmd", "q"), onAction: () => native.call("apps.quit", { bundleIdOrPath: appTarget(item) }).then(() => showToast({ style: "success", title: `Quit ${item.title}` })) },
      {
        id: "force-quit",
        title: "Force Quit Application",
        icon: "xmark-circle-filled-16",
        style: "destructive",
        shortcut: sc("opt", "cmd", "q"),
        onAction: async () => {
          if (await confirmAlert({ title: `Force Quit ${item.title}?`, message: "Unsaved changes will be lost.", primaryAction: { title: "Force Quit", style: "destructive" } }))
            await native.call("apps.quit", { bundleIdOrPath: appTarget(item), force: true });
        },
      },
    );
  }
  manage.push(
    { id: "reset-ranking", title: "Reset Ranking", icon: "arrow-counter-clockwise-16", onAction: () => backend.call("commands.resetRanking", { id: item.id }).then(() => showToast({ style: "success", title: "Ranking reset" })) },
    {
      id: "disable",
      title: isApp ? "Disable Application" : "Disable Command",
      icon: "circle-disabled-16",
      style: "destructive",
      onAction: async () => {
        if (await confirmAlert({ title: `Disable ${item.title}?`, message: "You can enable it again in Settings → Extensions.", primaryAction: { title: "Disable", style: "destructive" } }))
          await setPrefs(item, { enabled: false }, `${item.title} disabled`);
      },
    },
  );

  return {
    title: item.title,
    sections: [{ actions: primary }, { actions: favorites }, { actions: copyActions }, { title: "Configure", actions: configure }, { actions: manage }].filter((s) => s.actions.length > 0),
  };
}

/** Actions for the calculator card. */
export function calculatorActions(result: CalculatorResult): ActionPanelModel {
  const save = () => backend.call("calc.saveHistory", { result }).catch(() => undefined);
  return {
    title: result.interpreted,
    sections: [
      {
        actions: [
          { id: "copy-answer", title: "Copy Answer", icon: "copy-clipboard-16", onAction: () => save().then(() => copy(result.copyValue)) },
          { id: "paste-answer", title: "Paste Answer", icon: "clipboard-16", shortcut: sc("cmd", "return"), onAction: () => save().then(() => native.call("input.paste", { content: { kind: "text", text: result.copyValue } })) },
          { id: "copy-formatted", title: "Copy Formatted Answer", icon: "text-16", shortcut: sc("cmd", "shift", "c"), onAction: () => copy(result.result) },
          { id: "copy-question", title: "Copy Question", icon: "question-mark-circle-16", shortcut: sc("opt", "cmd", "c"), onAction: () => copy(result.input) },
        ],
      },
    ],
  };
}
