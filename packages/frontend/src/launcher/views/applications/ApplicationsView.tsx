import { useMemo, useState } from "react";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { Action, ActionPanel, List } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { launchCommandInfo } from "../../launch";
import type { LauncherViewProps } from "../registry";

/** Search Applications: use the command catalog to respect disabled apps and launch preferences. */
export function ApplicationsView({ props, title, icon }: LauncherViewProps<{ query?: string }>) {
  const [query, setQuery] = useState(props.query ?? "");
  const { data, error, isLoading, refetch } = useBackend("commands.list", {});
  const apps = useMemo(() => (data ?? []).filter((command) => command.kind === "app" && command.enabled).sort((a, b) => a.title.localeCompare(b.title)), [data]);
  const refresh = <Action title="Refresh" icon="arrow-clockwise-16" shortcut={sc("cmd", "r")} onAction={refetch} />;
  return (
    <List navigationTitle={title ?? "Search Applications"} navigationIcon={icon}
      searchText={query} onSearchTextChange={setQuery} filtering
      searchBarPlaceholder="Search applications…" isLoading={isLoading}
      actions={<ActionPanel>{refresh}</ActionPanel>}
    >
      {apps.map((app) => (
        <List.Item key={app.id} id={app.id} title={app.title} icon={app.icon} keywords={app.keywords}
          actions={<ActionPanel title={app.title}>
            <Action title="Open Application" icon="arrow-ne-16" onAction={() => launchCommandInfo(app)} />
            {refresh}
          </ActionPanel>}
        />
      ))}
      <List.EmptyView title={error ? "Could Not Load Applications" : "No Matching Applications"}
        description={error ? errorMessage(error) : "Try a different application name."}
        actions={<ActionPanel>{refresh}</ActionPanel>}
      />
    </List>
  );
}
