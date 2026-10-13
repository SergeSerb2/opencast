import { useEffect, useMemo, useState } from "react";
import type { CalculatorResult } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { useBackend } from "../../../bridge/hooks";
import { native } from "../../../bridge/native";
import { Action, ActionPanel, confirmAlert, List, showFailureToast, showHUD, showToast } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { CalculatorCard } from "../../root/CalculatorCard";
import { groupByDate } from "../library/format";
import { pasteIcon, pasteTitle, usePasteTarget } from "../library/usePasteTarget";
import type { LauncherViewProps } from "../registry";

type HistoryEntry = CalculatorResult & { id: string; createdAt: number };

const LIVE_ID = "live-result";

/** Row glyph by result kind, as Raycast: calculator, conversion, date/time, other. */
function entryIcon(entry: CalculatorResult): string {
  if (/[+\-*/×÷^%]\s*$/.test(entry.input)) return "blank-document-16";
  switch (entry.kind) {
    case "math":
    case "percentage":
    case "base":
      return "calculator-16";
    case "unit":
    case "currency":
      return "switch-16";
    case "date":
    case "timezone":
      return "clock-16";
    default:
      return "blank-document-16";
  }
}

/** Calculator History: a live result for the typed expression above the saved calculations of the last three months. */
export function CalculatorHistoryView({ props, title, icon }: LauncherViewProps<{ query?: string }>) {
  const [text, setText] = useState(props.query ?? "");
  const [query, setQuery] = useState(text.trim());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const target = usePasteTarget();
  const expression = text.trim();
  const live = useBackend("calc.evaluate", { expression }, [expression], { enabled: expression.length > 0, keepPreviousData: false });
  const history = useBackend("calc.history", { query, limit: 500 });
  const liveResult = expression && live.data?.input === expression ? live.data : null;
  useEffect(() => {
    if (liveResult) setSelectedId(LIVE_ID);
  }, [liveResult?.input]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 150);
    return () => clearTimeout(timer);
  }, [text]);

  const save = (result: CalculatorResult) => backend.call("calc.saveHistory", { result }).then(history.refetch).catch((error) => showFailureToast("Failed to save calculation", error));

  // Like Raycast, clearing the search bar keeps the calculation that was showing.
  const changeText = (next: string) => {
    if (!next.trim() && liveResult) void save(liveResult);
    setText(next);
  };

  const sections = useMemo(() => groupByDate(history.data ?? [], (e) => e.createdAt), [history.data]);

  const copy = (value: string, onDone?: () => unknown) =>
    native
      .call("clipboard.write", { content: { kind: "text", text: value } })
      .then(() => onDone?.())
      .then(() => showHUD("Copied to Clipboard"))
      .catch((error: unknown) => showFailureToast("Failed to copy", error));
  const paste = (value: string, onDone?: () => unknown) =>
    native
      .call("input.paste", { content: { kind: "text", text: value } })
      .then(() => onDone?.())
      .catch((error: unknown) => showFailureToast("Failed to paste", error));

  const clearAll = async () => {
    const confirmed = await confirmAlert({ title: "Delete All Entries", message: "Your whole calculator history will be deleted. This can’t be undone.", icon: "trash-16", primaryAction: { title: "Delete All", style: "destructive" } });
    if (!confirmed) return;
    try {
      await backend.call("calc.clearHistory");
      history.refetch();
      showToast({ title: "Deleted all entries" });
    } catch (error) {
      showFailureToast("Failed to delete entries", error);
    }
  };

  const answerActions = (result: CalculatorResult, onUse?: () => unknown) => (
    <ActionPanel.Section>
      <Action title="Copy Answer" icon="copy-clipboard-16" shortcut={sc("cmd", "shift", "c")} onAction={() => copy(result.result, onUse)} />
      <Action title={pasteTitle(target, "Paste Answer")} icon={pasteIcon(target)} onAction={() => paste(result.result, onUse)} />
      {result.copyValue !== result.result && <Action title="Copy Unformatted Answer" icon="copy-clipboard-16" shortcut={sc("cmd", "opt", "c")} onAction={() => copy(result.copyValue, onUse)} />}
      {!onUse && <Action title="Copy Question" icon="copy-clipboard-16" shortcut={sc("cmd", "ctrl", "c")} onAction={() => copy(result.input)} />}
      <Action title="Copy Question and Answer" icon="copy-clipboard-16" shortcut={sc("cmd", "opt", "shift", "c")} onAction={() => copy(`${result.input} = ${result.result}`, onUse)} />
    </ActionPanel.Section>
  );

  const entryActions = (entry: HistoryEntry) => (
    <ActionPanel title={entry.input}>
      {answerActions(entry)}
      <ActionPanel.Section>
        <Action title="Put Question in Search Bar" icon="text-16" shortcut={sc("cmd", "ctrl", "return")} onAction={() => setText(entry.input)} />
        <Action title="Put Answer in Search Bar" icon="text-16" shortcut={sc("cmd", "shift", "return")} onAction={() => setText(entry.copyValue)} />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action title="Delete All Entries" icon="trash-16" style="destructive" shortcut={sc("ctrl", "shift", "x")} onAction={clearAll} />
      </ActionPanel.Section>
    </ActionPanel>
  );

  const liveActions = (result: CalculatorResult) => (
    <ActionPanel title={result.interpreted}>
      {answerActions(result, () => save(result))}
      <ActionPanel.Section>
        <Action title="Put Answer in Search Bar" icon="text-16" shortcut={sc("cmd", "shift", "return")} onAction={() => setText(result.copyValue)} />
      </ActionPanel.Section>
    </ActionPanel>
  );

  const hasHistory = (history.data?.length ?? 0) > 0;
  return (
    <List
      searchText={text}
      onSearchTextChange={changeText}
      filtering={false}
      selectedItemId={selectedId ?? undefined}
      onSelectionChange={setSelectedId}
      isLoading={history.isLoading || live.isLoading}
      searchBarPlaceholder="Calculate, convert units, or search past calculations…"
      navigationTitle={title ?? "Calculator History"}
      navigationIcon={icon}
    >
      {liveResult && (
        <List.Section id="live">
          <List.Item id={LIVE_ID} title={liveResult.result} height={124} render={() => <CalculatorCard result={liveResult} />} actions={liveActions(liveResult)} />
        </List.Section>
      )}
      {sections.map((section) => (
        <List.Section key={section.title} id={section.title} title={section.title}>
          {section.items.map((entry) => (
            <List.Item key={entry.id} id={entry.id} title={entry.input} icon={entryIcon(entry)} accessories={[{ text: entry.result }]} actions={entryActions(entry)} />
          ))}
        </List.Section>
      ))}
      <List.EmptyView
        icon="calculator-16"
        title={query || hasHistory ? "No Results" : "No Calculations Yet"}
        description={query || hasHistory ? "Try a different expression." : "Try “9 am in Tokyo”, “17 km in mi”, or “25% of $500 in GBP”."}
      />
    </List>
  );
}
