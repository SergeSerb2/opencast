import { useEffect, useMemo, useState } from "react";
import { RpcErrorCode, type ImageLike } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage, RpcError } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { native } from "../../../bridge/native";
import { Action, ActionPanel, List, showHUD } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { hideLauncher } from "../../launch";
import type { LauncherViewProps } from "../registry";
import { menuEntries, menuSections, type MenuEntry } from "./menu-model";

/** Icon of the app whose menus are listed (the app that was frontmost before the launcher). */
function useMenuOwnerIcon(): ImageLike {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const app = (await native.call("apps.previous").catch(() => null)) ?? (await native.call("apps.frontmost").catch(() => null));
      if (!cancelled && app?.path) setPath(app.path);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return path ? { fileIcon: path } : "app-window-16";
}

function shortcutText(entry: MenuEntry): string | undefined {
  return entry.item.shortcut?.trim() || undefined;
}

/** "Search Menu Bar Items": every pressable menu item of the frontmost app. */
export function MenuItemsView({ props, title, icon }: LauncherViewProps<{ query?: string }>) {
  const [searchText, setSearchText] = useState(props.query ?? "");
  const { data, error, isLoading, refetch } = useBackend("menus.list", undefined);
  const appIcon = useMenuOwnerIcon();
  const entries = useMemo(() => menuEntries(data?.items ?? []), [data]);
  const sections = useMemo(() => menuSections(entries, searchText), [entries, searchText]);
  const appName = data?.app || "the active app";

  const press = async (path: string[], label: string) => {
    // Like Raycast: give focus back to the app first, then press the item.
    hideLauncher();
    try {
      await backend.call("menus.press", { path });
    } catch (err) {
      await showHUD(`Couldn’t open “${label}”: ${errorMessage(err)}`);
    }
  };

  const refresh = <Action title="Refresh Menu Items" icon="arrow-clockwise-16" shortcut={sc("cmd", "r")} onAction={refetch} />;
  const needsPermission = error instanceof RpcError && error.code === RpcErrorCode.PermissionDenied;

  return (
    <List
      navigationTitle={title}
      navigationIcon={icon}
      searchBarPlaceholder="Filter menu items by title…"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      isLoading={isLoading}
      actions={<ActionPanel>{refresh}</ActionPanel>}
    >
      {sections.map((section) => (
        <List.Section key={section.id} id={section.id} title={section.title} subtitle={section.subtitle}>
          {section.entries.map((entry) => {
            const shortcut = shortcutText(entry);
            const menu = entry.item.path[0];
            return (
              <List.Item
                key={entry.id}
                id={entry.id}
                icon={appIcon}
                title={entry.item.title}
                titleRanges={entry.titleRanges}
                subtitle={entry.pathLabel}
                disabled={!entry.item.enabled}
                accessories={[
                  ...(entry.item.checked ? [{ icon: "checkmark-16", tooltip: "Checked" }] : []),
                  ...(entry.shortcut ? [{ shortcut: entry.shortcut, tooltip: shortcut }] : []),
                ]}
                actions={
                  <ActionPanel title={entry.item.title}>
                    <Action title="Open Menu Item" icon="arrow-right-circle-16" onAction={() => press(entry.item.path, entry.item.title)} />
                    {entry.item.path.length > 1 && <Action title={`Show “${menu}” Menu`} icon="app-window-list-16" shortcut={sc("cmd", "return")} onAction={() => press([menu], menu)} />}
                    <ActionPanel.Section>
                      <Action.CopyToClipboard title="Copy Menu Path" content={entry.item.path.join(" → ")} shortcut={sc("cmd", "shift", "c")} />
                      {shortcut && <Action.CopyToClipboard title="Copy Keyboard Shortcut" content={shortcut} shortcut={sc("cmd", "opt", "c")} />}
                    </ActionPanel.Section>
                    <ActionPanel.Section>{refresh}</ActionPanel.Section>
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ))}
      {needsPermission ? (
        <List.EmptyView
          icon="lock-16"
          title="Accessibility Access Needed"
          description="OpenCast reads menu bar items through the Accessibility API. Allow it in System Settings → Privacy & Security → Accessibility."
          actions={
            <ActionPanel>
              <Action title="Open System Settings" icon="cog-16" onAction={() => native.call("permissions.openSettings", { kind: "accessibility" })} />
              {refresh}
            </ActionPanel>
          }
        />
      ) : entries.length === 0 ? (
        <List.EmptyView icon="app-window-list-16" title="No Menu Items" description={error ? errorMessage(error) : `OpenCast couldn’t find any menu items it can open in ${appName}.`} actions={<ActionPanel>{refresh}</ActionPanel>} />
      ) : (
        <List.EmptyView title="No Matching Menu Items" description={`Nothing in ${appName}’s menus matches “${searchText.trim()}”.`} actions={<ActionPanel>{refresh}</ActionPanel>} />
      )}
    </List>
  );
}
