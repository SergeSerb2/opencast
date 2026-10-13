import type { ImageLike } from "@surgecast/protocol";
import { native } from "../../../bridge/native";
import { Action, ActionPanel, List, showFailureToast, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { categoryInfo, formatCount, importSummary, type ImportResult } from "./data-format";

export interface ImportResultsViewProps {
  results: ImportResult[];
  title?: string;
  icon?: ImageLike;
}

const SUCCESS: ImageLike = { source: "check-circle-16", tintColor: "raycast-green" };
const FAILURE: ImageLike = { source: "warning-16", tintColor: "raycast-red" };

/** Per-category outcome of an import; failed categories first, in red. */
export function ImportResultsView({ results, title, icon }: ImportResultsViewProps) {
  const navigation = useNavigation();
  const failed = results.filter((r) => r.error);
  const succeeded = results.filter((r) => !r.error);
  const summary = importSummary(results);

  const copyError = async (result: ImportResult) => {
    try {
      await native.call("clipboard.write", { content: { kind: "text", text: `${categoryInfo(result.category).title}: ${result.error}` } });
      showToast({ style: "success", title: "Copied Error" });
    } catch (error) {
      showFailureToast("Failed to copy", error);
    }
  };

  const actions = (result?: ImportResult) => (
    <ActionPanel title={result ? categoryInfo(result.category).title : undefined}>
      <Action title="Done" icon="check-16" shortcut={sc("return")} onAction={() => navigation.popToRoot()} />
      {result?.error && <Action title="Copy Error" icon="copy-clipboard-16" shortcut={sc("cmd", "shift", "c")} onAction={() => copyError(result)} />}
      <Action title="Import Another File" icon="download-16" shortcut={sc("cmd", "n")} onAction={() => navigation.pop()} />
    </ActionPanel>
  );

  return (
    <List navigationTitle={title} navigationIcon={icon} searchBarPlaceholder="Filter imported categories…" actions={actions()}>
      <List.Section title="Couldn't Import" subtitle={failed.length ? formatCount(failed.length, "category", "categories") : undefined}>
        {failed.map((result) => {
          const info = categoryInfo(result.category);
          return (
            <List.Item
              key={result.category}
              id={result.category}
              title={info.title}
              subtitle={{ value: result.error ?? "", tooltip: result.error }}
              icon={info.icon}
              accessories={[{ text: { value: "Failed", color: "raycast-red" }, icon: FAILURE, tooltip: result.error }]}
              actions={actions(result)}
            />
          );
        })}
      </List.Section>
      <List.Section title="Imported" subtitle={formatCount(summary.imported, "item")}>
        {succeeded.map((result) => {
          const info = categoryInfo(result.category);
          return <List.Item key={result.category} id={result.category} title={info.title} icon={info.icon} accessories={[{ text: formatCount(result.imported, "item") }, { icon: SUCCESS }]} actions={actions(result)} />;
        })}
      </List.Section>
      <List.EmptyView title="Nothing Imported" description="The file has none of the selected categories." icon="tray-16" actions={actions()} />
    </List>
  );
}
