import { useState } from "react";
import { backend } from "../../../bridge/backend";
import { useBackend } from "../../../bridge/hooks";
import { List, useNavigation, type ActionModel, type ListAccessory } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { StoreExtensionDetail } from "../store/StoreExtensionView";
import { copyText } from "./actions-common";
import { installedExtensionIcon, installedStoreSlug, runExtensionUpdates, UPDATE_SECTIONS, withNewVersions, type UpdateResult } from "./model";

const STATUS_TAG: Record<UpdateResult["status"], ListAccessory> = {
  updated: { tag: { value: "Updated", color: "raycast-green" } },
  skipped: { tag: "Skipped" },
  failed: { tag: { value: "Failed", color: "raycast-red" } },
};

/** Outcome of "Check for Updates", grouped into Updated / Skipped / Failed; failed updates can be retried. */
export function UpdateResultsView({ initialResults }: { initialResults: UpdateResult[] }) {
  const navigation = useNavigation();
  const [results, setResults] = useState(initialResults);
  const [retrying, setRetrying] = useState<string | null>(null);
  const { data: commands } = useBackend("commands.list", { includeDisabled: true });

  const retry = async (result: UpdateResult) => {
    setRetrying(result.extension.name);
    try {
      const [next] = await runExtensionUpdates([result.extension], (name) => backend.call("extensions.update", { name }, { timeoutMs: 180_000 }));
      const refreshed = await backend.call("extensions.list").catch(() => undefined);
      const [final] = withNewVersions([next], refreshed);
      setResults((list) => list.map((r) => (r.extension.name === final.extension.name ? final : r)));
    } finally {
      setRetrying(null);
    }
  };

  const actionsFor = (result: UpdateResult): ActionModel[] => {
    const actions: ActionModel[] = [
      {
        id: "details",
        title: "Show Extension Details",
        icon: "app-window-sidebar-left-16",
        onAction: () => navigation.push(<StoreExtensionDetail entries={[{ idOrSlug: installedStoreSlug(result.extension) }]} />),
      },
    ];
    if (result.status === "failed") actions.push({ id: "retry", title: "Retry Update", icon: "arrow-clockwise-16", shortcut: sc("cmd", "r"), onAction: () => retry(result) });
    actions.push({ id: "copy", title: "Copy Details", icon: "copy-clipboard-16", shortcut: sc("cmd", "shift", "c"), onAction: () => copyText(`${result.extension.title}: ${result.reason}`) });
    return actions;
  };

  return (
    <List searchBarPlaceholder="Search update results…" navigationTitle="Extension Updates" navigationIcon="store-16" size="multiline" isLoading={retrying !== null}>
      {UPDATE_SECTIONS.map(({ status, title }) => {
        const items = results.filter((r) => r.status === status);
        if (items.length === 0) return null;
        return (
          <List.Section key={status} title={title} subtitle={String(items.length)}>
            {items.map((result) => (
              <List.Item
                key={result.extension.name}
                id={result.extension.name}
                title={result.extension.title}
                subtitle={result.reason}
                icon={installedExtensionIcon(result.extension, commands)}
                accessories={[STATUS_TAG[result.status]]}
                actions={{ title: result.extension.title, sections: [{ actions: actionsFor(result) }] }}
              />
            ))}
          </List.Section>
        );
      })}
      <List.EmptyView title="No Matching Results" />
    </List>
  );
}
