import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { native } from "../../../bridge/native";
import { Action, ActionPanel, List, showFailureToast, showHUD } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { hideLauncher, launchCommandInfo } from "../../launch";
import type { LauncherViewProps } from "../registry";
import { formatBytes, shareOfTotal, storageRows, storageSummary } from "./data-format";

const EXPORT_COMMAND = "builtin:core.exportData";

async function openExport(): Promise<void> {
  try {
    const command = await backend.call("commands.get", { id: EXPORT_COMMAND });
    await launchCommandInfo(command ?? { id: EXPORT_COMMAND, title: "Export Data", icon: "upload-16" });
  } catch (error) {
    showFailureToast("Could not open Export Data", error);
  }
}

/** "Check Storage": disk usage of the database and clipboard images, and item counts per collection. */
export function StorageView({ title, icon }: LauncherViewProps) {
  const { data, error, isLoading, refetch } = useBackend("data.storage", undefined);

  const copySummary = async () => {
    if (!data) return;
    try {
      await native.call("clipboard.write", { content: { kind: "text", text: storageSummary(data) } });
      await showHUD("Copied Storage Summary");
    } catch (err) {
      showFailureToast("Failed to copy", err);
    }
  };

  const actions = (
    <ActionPanel title="Storage">
      {data && <Action title="Copy Summary" icon="copy-clipboard-16" shortcut={sc("cmd", "shift", "c")} onAction={copySummary} />}
      <Action title="Refresh" icon="arrow-clockwise-16" shortcut={sc("cmd", "r")} onAction={refetch} />
      <ActionPanel.Section>
        <Action title="Export Data…" icon="upload-16" shortcut={sc("cmd", "e")} onAction={openExport} />
        <Action title="Open Advanced Settings" icon="cog-16" onAction={() => native.call("window.show", { kind: "settings", route: "advanced" }).then(hideLauncher)} />
      </ActionPanel.Section>
    </ActionPanel>
  );

  const rows = data ? storageRows(data) : [];
  const items = rows.reduce((n, row) => n + row.count, 0);
  return (
    <List navigationTitle={title ?? "Check Storage"} navigationIcon={icon} searchBarPlaceholder="Filter storage…" isLoading={isLoading} actions={actions}>
      {data && (
        <List.Section title="Disk Usage" subtitle={formatBytes(data.totalBytes)}>
          <List.Item
            id="database"
            title="Database"
            subtitle="Settings, notes, snippets, AI chats and more"
            icon="hard-drive-16"
            keywords={["sqlite"]}
            accessories={[{ text: shareOfTotal(data.databaseBytes, data.totalBytes) }, { text: formatBytes(data.databaseBytes) }]}
          />
          <List.Item
            id="clipboard-files"
            title="Clipboard Images"
            subtitle="Images and files kept by Clipboard History"
            icon="image-16"
            accessories={[{ text: shareOfTotal(data.clipboardBytes, data.totalBytes) }, { text: formatBytes(data.clipboardBytes) }]}
          />
        </List.Section>
      )}
      {data && (
        <List.Section title="Items" subtitle={items.toLocaleString()}>
          {rows.map((row) => (
            <List.Item key={row.id} id={row.id} title={row.title} icon={row.icon} accessories={[{ text: row.count.toLocaleString() }]} />
          ))}
        </List.Section>
      )}
      <List.EmptyView title={error ? "Couldn't Read Storage" : "No Storage Information"} description={error ? errorMessage(error) : undefined} icon="hard-drive-16" actions={actions} />
    </List>
  );
}
