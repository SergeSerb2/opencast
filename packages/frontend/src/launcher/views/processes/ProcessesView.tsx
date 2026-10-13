import { useEffect, useMemo, useState } from "react";
import type { ProcessInfo } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend, useNativeEvent } from "../../../bridge/hooks";
import { Action, ActionPanel, confirmAlert, List, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import type { LauncherViewProps } from "../registry";
import { formatCpu, formatMemory, parseFilter, PROCESS_FILTERS, processIcon, revealPath, searchProcesses, visibleProcesses } from "./process-model";

const REFRESH_MS = 3000;
/** How long a process we ended stays hidden while it shuts down (apps may refuse to quit). */
const ENDED_GRACE_MS = 5000;

/** Refetch on an interval while the view is on top and the launcher is visible. */
function useAutoRefresh(refetch: () => void) {
  const { isActive } = useNavigation();
  const [windowVisible, setWindowVisible] = useState(true);
  useNativeEvent("window.didHide", () => setWindowVisible(false));
  useNativeEvent("window.didShow", () => {
    setWindowVisible(true);
    refetch();
  });
  useEffect(() => {
    if (!isActive || !windowVisible) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [isActive, windowVisible, refetch]);
}

/** "Kill Process": running processes with CPU and memory; quit or force quit them. */
export function ProcessesView({ props, title, icon }: LauncherViewProps<{ query?: string }>) {
  const [filterValue, setFilterValue] = useState(PROCESS_FILTERS[0].value);
  const [searchText, setSearchText] = useState(props.query ?? "");
  // PID → when we ended it; hidden briefly so the row disappears right away.
  const [ended, setEnded] = useState<ReadonlyMap<number, number>>(new Map());
  const { data, error, isLoading, refetch } = useBackend("system.processes", undefined);
  useAutoRefresh(refetch);

  const { scope, sort } = parseFilter(filterValue);
  const matches = useMemo(() => {
    const cutoff = Date.now() - ENDED_GRACE_MS;
    const running = (data ?? []).filter((p) => (ended.get(p.pid) ?? 0) < cutoff);
    return searchProcesses(visibleProcesses(running, scope, sort), searchText);
  }, [data, ended, scope, sort, searchText]);

  const terminate = async (process: ProcessInfo, force: boolean) => {
    if (force) {
      const confirmed = await confirmAlert({
        title: `Force Quit “${process.name}”?`,
        message: process.app ? "Unsaved changes in the app will be lost." : "The process stops immediately without cleaning up.",
        primaryAction: { title: "Force Quit", style: "destructive" },
      });
      if (!confirmed) return;
    }
    const toast = showToast({ style: "animated", title: force ? `Force quitting ${process.name}…` : `Quitting ${process.name}…` });
    try {
      await backend.call("system.killProcess", { pid: process.pid, force });
      setEnded((current) => new Map(current).set(process.pid, Date.now()));
      toast.update({ style: "success", title: force ? `Force quit ${process.name}` : `Quit ${process.name}` });
      refetch();
    } catch (err) {
      toast.update({ style: "failure", title: `Couldn’t quit ${process.name}`, message: errorMessage(err) });
    }
  };

  const refresh = <Action title="Refresh" icon="arrow-clockwise-16" shortcut={sc("cmd", "r")} onAction={refetch} />;
  const sectionTitle = scope === "apps" ? "Applications" : "Processes";

  return (
    <List
      navigationTitle={title}
      navigationIcon={icon}
      searchBarPlaceholder="Search processes by name or PID…"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      isLoading={isLoading && !data}
      filtering={false}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter and Sort Processes" id="processes-filter" storeValue onChange={setFilterValue}>
          {[...new Set(PROCESS_FILTERS.map((f) => f.section))].map((section) => (
            <List.Dropdown.Section key={section} title={section}>
              {PROCESS_FILTERS.filter((f) => f.section === section).map((f) => (
                <List.Dropdown.Item key={f.value} value={f.value} title={f.title} icon={f.sort === "cpu" ? "computer-chip-16" : "memory-stick-16"} />
              ))}
            </List.Dropdown.Section>
          ))}
        </List.Dropdown>
      }
      actions={<ActionPanel>{refresh}</ActionPanel>}
    >
      <List.Section title={sectionTitle} subtitle={data ? String(matches.length) : undefined}>
        {matches.map(({ process, titleRanges }) => {
          const kind = process.app ? "Application" : "Process";
          const path = revealPath(process);
          return (
            <List.Item
              key={process.pid}
              id={String(process.pid)}
              icon={processIcon(process)}
              title={process.name}
              titleRanges={titleRanges}
              subtitle={`PID ${process.pid}`}
              accessories={[
                { text: { value: formatCpu(process.cpuPercent), color: sort === "cpu" ? "raycast-primary-text" : undefined }, tooltip: "CPU" },
                { text: { value: formatMemory(process.memoryBytes), color: sort === "memory" ? "raycast-primary-text" : undefined }, tooltip: "Memory" },
              ]}
              actions={
                <ActionPanel title={process.name}>
                  <Action title={`Quit ${kind}`} icon="x-mark-circle-16" onAction={() => terminate(process, false)} />
                  {path && <Action.ShowInFinder path={path} shortcut={sc("cmd", "shift", "f")} />}
                  <ActionPanel.Section>
                    <Action.CopyToClipboard title="Copy PID" content={String(process.pid)} shortcut={sc("cmd", "shift", "c")} />
                    <Action.CopyToClipboard title="Copy Name" content={process.name} shortcut={sc("cmd", "opt", "c")} />
                    {process.executable.startsWith("/") && <Action.CopyToClipboard title="Copy Executable Path" content={process.executable} shortcut={sc("cmd", "ctrl", "c")} />}
                  </ActionPanel.Section>
                  <ActionPanel.Section>{refresh}</ActionPanel.Section>
                  <ActionPanel.Section>
                    <Action title={`Force Quit ${kind}`} icon="x-mark-circle-filled-16" style="destructive" shortcut={sc("opt", "cmd", "q")} onAction={() => terminate(process, true)} />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
      {error ? (
        <List.EmptyView icon="warning-16" title="Could Not Load Processes" description={errorMessage(error)} actions={<ActionPanel>{refresh}</ActionPanel>} />
      ) : (
        <List.EmptyView title="No Matching Processes" description="Try a different name or process ID." actions={<ActionPanel>{refresh}</ActionPanel>} />
      )}
    </List>
  );
}
