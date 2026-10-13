import { useState } from "react";
import type { InstalledExtension } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { List, showToast, useNavigation, type ListAccessory } from "../../../components";
import { formatVersion } from "../store/model";
import { StoreExtensionDetail } from "../store/StoreExtensionView";
import type { LauncherViewProps } from "../registry";
import { addExtensionActions, manageExtensionActions } from "./extension-actions";
import { ExtensionCommandsView } from "./ExtensionCommandsView";
import {
  EXTENSION_FILTERS,
  groupExtensions,
  installedExtensionIcon,
  installedStoreSlug,
  isInstalledHere,
  runExtensionUpdates,
  summarizeUpdates,
  tildify,
  updatableExtensions,
  withNewVersions,
  type ExtensionFilter,
} from "./model";
import { UpdateResultsView } from "./UpdateResultsView";
import "./extensions.css";

function extensionAccessories(extension: InstalledExtension): ListAccessory[] {
  const accessories: ListAccessory[] = [];
  if (!isInstalledHere(extension)) accessories.push({ tag: { value: "Not Installed", color: "raycast-orange" }, tooltip: "Synced from another Mac — install it to use it here" });
  if (!extension.enabled) accessories.push({ tag: "Disabled", tooltip: "Its commands are hidden from search" });
  if (extension.tools.length) accessories.push({ icon: "stars-16", tooltip: "AI Extension" });
  if (extension.commands.length)
    accessories.push({ icon: "computer-chip-16", text: String(extension.commands.length), tooltip: `${extension.commands.length} ${extension.commands.length === 1 ? "Command" : "Commands"}` });
  if (extension.version) accessories.push({ text: formatVersion(extension.version), tooltip: "Version" });
  return accessories;
}

function keywords(extension: InstalledExtension): string[] {
  return [extension.name, extension.author, ...(extension.path ? [tildify(extension.path)] : []), ...extension.commands.map((c) => c.title)];
}

/** `extensions` ("Manage Extensions"): installed extensions grouped by source, with their commands, preferences and updates. */
export function ManageExtensionsView({ title, icon }: LauncherViewProps) {
  const navigation = useNavigation();
  const [filter, setFilter] = useState<ExtensionFilter>("all");
  const [updating, setUpdating] = useState(false);
  const [searchText, setSearchText] = useState("");
  const { data: extensions, isLoading, error } = useBackend("extensions.list", undefined);
  const { data: commands } = useBackend("commands.list", { includeDisabled: true });
  const sections = groupExtensions(extensions ?? [], filter);

  const checkForUpdates = async () => {
    if (updating) return;
    const candidates = updatableExtensions(extensions ?? []);
    if (candidates.length === 0) {
      showToast({ style: "success", title: "No Store Extensions to Update" });
      return;
    }
    setUpdating(true);
    const toast = showToast({ style: "animated", title: "Checking for Updates…", message: `0 of ${candidates.length} extensions` });
    try {
      const results = await runExtensionUpdates(
        candidates,
        (name) => backend.call("extensions.update", { name }, { timeoutMs: 180_000 }),
        (done, total) => toast.update({ message: `${done} of ${total} extensions` }),
      );
      const refreshed = await backend.call("extensions.list").catch(() => undefined);
      const final = withNewVersions(results, refreshed);
      toast.update(summarizeUpdates(final));
      if (final.some((r) => r.status !== "skipped")) navigation.push(<UpdateResultsView initialResults={final} />);
    } finally {
      setUpdating(false);
    }
  };

  const handlers = {
    showCommands: (extension: InstalledExtension) => navigation.push(<ExtensionCommandsView extensionName={extension.name} />),
    showInStore: (extension: InstalledExtension) => navigation.push(<StoreExtensionDetail entries={[{ idOrSlug: installedStoreSlug(extension) }]} />),
    checkForUpdates: () => void checkForUpdates(),
  };
  const emptyActions = { sections: [{ actions: addExtensionActions(searchText) }] };
  const hasAny = (extensions?.length ?? 0) > 0;

  return (
    <div className="sc-extensions-list">
      <List
        searchBarPlaceholder="Search your extensions…"
        searchText={searchText}
        onSearchTextChange={setSearchText}
        filtering
        navigationTitle={title ?? "Manage Extensions"}
        navigationIcon={icon}
        isLoading={isLoading || updating}
        actions={emptyActions}
        searchBarAccessory={
          <List.Dropdown tooltip="Filter Extensions" id="manage-extensions-filter" storeValue defaultValue="all" onChange={(value) => setFilter(value as ExtensionFilter)}>
            {EXTENSION_FILTERS.map((f) => (
              <List.Dropdown.Item key={f.value} value={f.value} title={f.title} icon={f.icon} />
            ))}
          </List.Dropdown>
        }
      >
        {sections.map((section) => (
          <List.Section key={section.source} title={section.title} subtitle={String(section.extensions.length)}>
            {section.extensions.map((extension) => {
              const extensionIcon = installedExtensionIcon(extension, commands);
              return (
                <List.Item
                  key={extension.name}
                  id={extension.name}
                  title={extension.title}
                  subtitle={extension.description}
                  icon={extensionIcon}
                  keywords={keywords(extension)}
                  accessories={extensionAccessories(extension)}
                  actions={manageExtensionActions(extension, extensionIcon, handlers)}
                />
              );
            })}
          </List.Section>
        ))}
        {error ? (
          <List.EmptyView title="Couldn't Load Extensions" description={errorMessage(error)} icon="warning-16" actions={emptyActions} />
        ) : hasAny ? (
          <List.EmptyView title="No Extensions Found" description={filter === "all" ? undefined : "Try another type in the filter."} actions={emptyActions} />
        ) : (
          <List.EmptyView title="No Extensions Installed" description="Find extensions for the tools you use in the Store, or import one you built." actions={emptyActions} />
        )}
      </List>
    </div>
  );
}
