import { useState } from "react";
import type { ImageLike, WindowLayout } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { Action, ActionPanel, confirmAlert, List, Metadata, showFailureToast, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { hideLauncher } from "../../launch";
import { describeRect } from "./geometry";
import { LayoutPreview } from "./LayoutPreview";
import { layoutThumbnail } from "./thumbnail";
import { useMainScreen } from "./useMainScreen";
import { WindowLayoutEditor, type LayoutTemplate } from "./WindowLayoutEditor";
import "./window-management.css";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Saved custom window commands: apply, edit, duplicate, delete, create. */
export function WindowLayoutsList({ navigationTitle, navigationIcon }: { navigationTitle?: string; navigationIcon?: ImageLike }) {
  const navigation = useNavigation();
  const screen = useMainScreen();
  const [searchText, setSearchText] = useState("");
  const { data, error, isLoading } = useBackend("windows.layouts.list", undefined);
  const layouts = [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const openEditor = (layout?: LayoutTemplate) => navigation.push(<WindowLayoutEditor layout={layout} navigationIcon={navigationIcon} />);

  const apply = async (layout: WindowLayout) => {
    try {
      await backend.call("windows.layouts.apply", { id: layout.id });
      hideLauncher();
    } catch (err) {
      showFailureToast(`Could not apply “${layout.name}”`, err);
    }
  };

  const remove = async (layout: WindowLayout) => {
    const confirmed = await confirmAlert({
      title: `Delete “${layout.name}”?`,
      message: "You can’t undo this action.",
      primaryAction: { title: "Delete", style: "destructive" },
    });
    if (!confirmed) return;
    try {
      await backend.call("windows.layouts.delete", { id: layout.id });
      showToast({ style: "success", title: "Window command deleted" });
    } catch (err) {
      showFailureToast("Could not delete the window command", err);
    }
  };

  const createAction = <Action title="Create Window Command" icon="plus-16" shortcut={sc("cmd", "n")} onAction={() => openEditor()} />;

  return (
    <List
      navigationTitle={navigationTitle}
      navigationIcon={navigationIcon}
      searchBarPlaceholder="Search window commands…"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering
      isLoading={isLoading && !data}
      isShowingDetail={layouts.length > 0}
      actions={<ActionPanel>{createAction}</ActionPanel>}
    >
      <List.Section title="Custom Commands" subtitle={layouts.length && !searchText.trim() ? String(layouts.length) : undefined}>
        {layouts.map((layout) => {
          const summary = describeRect(layout.rect);
          return (
            <List.Item
              key={layout.id}
              id={layout.id}
              title={layout.name}
              icon={layout.icon ?? layoutThumbnail(layout.rect)}
              keywords={[summary.position, "window", "layout"]}
              detail={
                <List.Item.Detail
                  preview={
                    <div className="sc-wm-detail-preview">
                      <LayoutPreview rect={layout.rect} screen={screen} />
                    </div>
                  }
                  metadata={
                    <Metadata>
                      <Metadata.Label title="Position" text={summary.position} />
                      <Metadata.Label title="Size" text={summary.size} />
                      <Metadata.Label title="Offset" text={summary.offset ?? "None"} />
                      <Metadata.Label title="Modified" text={dateFormat.format(new Date(layout.updatedAt))} />
                    </Metadata>
                  }
                />
              }
              actions={
                <ActionPanel title={layout.name}>
                  <Action title="Apply Window Command" icon="app-window-16" onAction={() => apply(layout)} />
                  <Action title="Edit Window Command" icon="pencil-16" shortcut={sc("cmd", "e")} onAction={() => openEditor(layout)} />
                  <ActionPanel.Section>
                    {createAction}
                    <Action title="Duplicate Window Command" icon="duplicate-16" shortcut={sc("cmd", "d")} onAction={() => openEditor({ name: `${layout.name} Copy`, icon: layout.icon, rect: layout.rect })} />
                    <Action.CopyToClipboard title="Copy Name" content={layout.name} shortcut={sc("cmd", "shift", "c")} />
                  </ActionPanel.Section>
                  <ActionPanel.Section>
                    <Action title="Delete Window Command" icon="trash-16" style="destructive" shortcut={sc("ctrl", "x")} onAction={() => remove(layout)} />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
      {error ? (
        <List.EmptyView icon="warning-16" title="Could Not Load Window Commands" description={errorMessage(error)} actions={<ActionPanel>{createAction}</ActionPanel>} />
      ) : layouts.length ? (
        <List.EmptyView title="No Matching Window Commands" description="Try a different name or position." actions={<ActionPanel>{createAction}</ActionPanel>} />
      ) : (
        <List.EmptyView title="No Window Commands" description="Create commands that move the focused window to a position and size you choose." actions={<ActionPanel>{createAction}</ActionPanel>} />
      )}
    </List>
  );
}
