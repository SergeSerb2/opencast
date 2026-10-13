import type { CommandMode, InstalledExtension } from "@opencast/protocol";
import { useBackend } from "../../../bridge/hooks";
import { List, useNavigation, type ActionModel, type ActionPanelModel, type ListAccessory, type NavigationApi } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { launchCommand } from "../../launch";
import { SetAliasView, SetHotkeyView } from "../../root/CommandPrefsViews";
import { commandDeeplink } from "../../root/root-items";
import { copyText } from "./actions-common";
import { openExtensionPreferences, setCommandEnabled, setExtensionEnabled } from "./lifecycle";
import { extensionCommandRows, hasPreferences, installedExtensionIcon, isInstalledHere, type ExtensionCommandRow } from "./model";
import "./extensions.css";

const MODE_LABEL: Record<CommandMode, string> = { view: "View", "no-view": "No View", "menu-bar": "Menu Bar" };

function commandAccessories(row: ExtensionCommandRow, extensionEnabled: boolean): ListAccessory[] {
  const accessories: ListAccessory[] = [];
  if (row.info?.alias) accessories.push({ alias: row.info.alias });
  if (row.info?.hotkey) accessories.push({ shortcut: { modifiers: row.info.hotkey.modifiers, key: row.info.hotkey.key } });
  if (row.info?.needsPreferences) accessories.push({ tag: { value: "Needs Setup", color: "raycast-orange" }, tooltip: "Required preferences are missing" });
  if (extensionEnabled && !row.enabled) accessories.push({ tag: "Disabled" });
  accessories.push({ text: MODE_LABEL[row.manifest.mode] });
  return accessories;
}

function commandActions(extension: InstalledExtension, row: ExtensionCommandRow, push: NavigationApi["push"]): ActionPanelModel {
  const { manifest, info } = row;
  const main: ActionModel[] = [];
  if (!extension.enabled) main.push({ id: "enable-extension", title: "Enable Extension", icon: "check-circle-16", onAction: () => setExtensionEnabled(extension, true) });
  else if (row.enabled) main.push({ id: "open", title: "Open Command", icon: "arrow-ne-16", onAction: () => launchCommand(row.id, { title: manifest.title, icon: row.icon }) });
  if (hasPreferences(extension, manifest))
    main.push({ id: "configure", title: "Configure Command", icon: "cog-16", shortcut: sc("cmd", "shift", ","), onAction: () => openExtensionPreferences(extension, row.icon, manifest) });
  if (extension.enabled && isInstalledHere(extension)) {
    main.push(
      row.enabled
        ? { id: "disable", title: "Disable Command", icon: "circle-disabled-16", shortcut: sc("cmd", "shift", "d"), onAction: () => setCommandEnabled({ id: row.id, title: manifest.title }, false) }
        : { id: "enable", title: "Enable Command", icon: "check-circle-16", shortcut: sc("cmd", "shift", "d"), onAction: () => setCommandEnabled({ id: row.id, title: manifest.title }, true) },
    );
  }

  const customize: ActionModel[] = info
    ? [
        { id: "alias", title: info.alias ? "Change Alias…" : "Set Alias…", icon: "text-input-16", onAction: () => push(<SetAliasView item={info} />, { title: "Set Alias" }) },
        { id: "hotkey", title: info.hotkey ? "Change Hotkey…" : "Set Hotkey…", icon: "keyboard-16", onAction: () => push(<SetHotkeyView item={info} />, { title: "Set Hotkey" }) },
      ]
    : [];
  const copy: ActionModel[] = [
    {
      id: "copy-deeplink",
      title: "Copy Deeplink",
      icon: "link-16",
      shortcut: sc("cmd", "shift", "c"),
      onAction: () => copyText(commandDeeplink({ id: row.id, kind: "extension", extensionId: extension.name }), "Copied Deeplink"),
    },
    { id: "copy-name", title: "Copy Command Name", icon: "copy-clipboard-16", onAction: () => copyText(manifest.name) },
  ];
  return {
    title: manifest.title,
    sections: [
      { id: "main", actions: main },
      { id: "customize", title: "Customize", actions: customize },
      { id: "copy", actions: copy },
    ].filter((s) => s.actions.length > 0),
  };
}

/** Pushed from Manage Extensions: an extension's commands (alias, hotkey, enabled) and AI tools. */
export function ExtensionCommandsView({ extensionName }: { extensionName: string }) {
  const navigation = useNavigation();
  const { data: extensions, isLoading } = useBackend("extensions.list", undefined);
  const { data: commands, isLoading: loadingCommands } = useBackend("commands.list", { includeDisabled: true });
  const extension = extensions?.find((e) => e.name === extensionName);
  const icon = extension ? installedExtensionIcon(extension, commands) : "box-16";
  const rows = extension ? extensionCommandRows(extension, commands, icon) : [];

  return (
    <div className="sc-extensions-list">
      <List searchBarPlaceholder="Search commands…" navigationTitle={extension?.title ?? "Commands"} navigationIcon={icon} isLoading={isLoading || loadingCommands}>
        {extension && (
          <List.Section title="Commands" subtitle={String(rows.length)}>
            {rows.map((row) => (
              <List.Item
                key={row.id}
                id={row.id}
                title={row.manifest.title}
                subtitle={row.manifest.subtitle ?? row.manifest.description}
                icon={row.icon}
                keywords={[row.manifest.name, ...(row.manifest.keywords ?? [])]}
                accessories={commandAccessories(row, extension.enabled)}
                actions={commandActions(extension, row, navigation.push)}
              />
            ))}
          </List.Section>
        )}
        {extension && extension.tools.length > 0 && (
          <List.Section title="AI Tools" subtitle={String(extension.tools.length)}>
            {extension.tools.map((tool) => (
              <List.Item
                key={tool.name}
                id={`tool:${tool.name}`}
                title={tool.title}
                subtitle={tool.description}
                icon="stars-16"
                accessories={tool.confirmation ? [{ tag: "Asks First", tooltip: "Asks for confirmation before running" }] : undefined}
                actions={{
                  title: tool.title,
                  sections: [{ actions: [{ id: "copy-tool", title: "Copy Tool Name", icon: "copy-clipboard-16", shortcut: sc("cmd", "shift", "c"), onAction: () => copyText(tool.name) }] }],
                }}
              />
            ))}
          </List.Section>
        )}
        {extension ? (
          <List.EmptyView title="No Commands Found" />
        ) : (
          <List.EmptyView title="Extension Not Installed" description="It may have been uninstalled. Go back to see your extensions." icon="box-16" />
        )}
      </List>
    </div>
  );
}
