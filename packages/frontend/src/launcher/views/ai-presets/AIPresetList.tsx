import { useMemo, useState } from "react";
import type { AIPreset, ImageLike } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { useSetting } from "../../../bridge/settings";
import { Action, ActionPanel, confirmAlert, List, showFailureToast, showToast } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { handleLaunchResult } from "../../launch";
import { DEFAULT_AI_ICON } from "../ai-shared/options";
import { AIPresetEditor } from "./AIPresetEditor";
import { presetMetadata, presetSections } from "./preset-form";

export interface AIPresetListProps {
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  initialQuery?: string;
}

/**
 * Opens AI Chat with the preset. Routed like the backend's `ai-preset:` command
 * result, which only exists while presets are shown in root search.
 */
function startChat(preset: AIPreset) {
  handleLaunchResult({ kind: "ai", target: "chat", presetId: preset.id }, { title: preset.name, icon: preset.icon ?? DEFAULT_AI_ICON });
}

async function deletePreset(preset: AIPreset) {
  const confirmed = await confirmAlert({
    title: `Delete “${preset.name}”?`,
    message: "Chats you started with this preset are kept.",
    icon: preset.icon ?? DEFAULT_AI_ICON,
    primaryAction: { title: "Delete", style: "destructive" },
  });
  if (!confirmed) return;
  try {
    await backend.call("ai.presets.delete", { id: preset.id });
    showToast({ style: "success", title: "Preset deleted", message: preset.name });
  } catch (error) {
    showFailureToast("Couldn't delete the preset", error);
  }
}

/** Manage Presets: reusable chat setups (Raycast calls them agents) with an instructions preview. */
export function AIPresetList({ navigationTitle, navigationIcon, initialQuery = "" }: AIPresetListProps) {
  const { data: presets, error, isLoading, refetch } = useBackend("ai.presets.list", undefined);
  const { data: models } = useBackend("ai.models.list", {});
  const { data: tools } = useBackend("ai.tools.list", undefined);
  const chatModel = useSetting("ai.chatModel");
  const [query, setQuery] = useState(initialQuery);
  const sections = useMemo(() => presetSections(presets ?? [], query), [presets, query]);

  const create = <Action.Push title="Create Preset" icon="plus-square-16" shortcut={sc("cmd", "n")} target={<AIPresetEditor mode="create" navigationTitle="Create Preset" navigationIcon={navigationIcon} />} />;
  const emptyActions = <ActionPanel>{error ? <Action title="Try Again" shortcut={sc("cmd", "r")} onAction={refetch} /> : create}</ActionPanel>;

  return (
    <List
      searchText={query}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search presets…"
      isLoading={isLoading}
      isShowingDetail={sections.some((section) => section.items.length > 0)}
      navigationTitle={navigationTitle}
      navigationIcon={navigationIcon}
      actions={emptyActions}
    >
      {sections.map((section) => (
        <List.Section key={section.id} id={section.id} title={section.title}>
          {section.items.map(({ preset, ranges }) => (
            <List.Item
              key={preset.id}
              id={preset.id}
              title={preset.name}
              titleRanges={ranges}
              icon={preset.icon ?? DEFAULT_AI_ICON}
              detail={<List.Item.Detail markdown={preset.instructions.trim() || "_No instructions yet._"} metadata={presetMetadata(preset, models, chatModel, tools)} />}
              actions={
                <ActionPanel title={preset.name}>
                  <ActionPanel.Section>
                    <Action title="Start Chat" icon="speech-bubble-16" onAction={() => startChat(preset)} />
                    {!preset.builtin && <Action.Push title="Edit Preset" icon="pencil-16" shortcut={sc("cmd", "e")} target={<AIPresetEditor key={preset.id} mode="edit" preset={preset} navigationTitle="Edit Preset" navigationIcon={navigationIcon} />} />}
                    <Action.Push title="Duplicate Preset" icon="duplicate-16" shortcut={sc("cmd", "d")} target={<AIPresetEditor key={preset.id} mode="duplicate" preset={preset} navigationTitle="Duplicate Preset" navigationIcon={navigationIcon} />} />
                  </ActionPanel.Section>
                  <ActionPanel.Section>{create}</ActionPanel.Section>
                  {preset.instructions.trim() && (
                    <ActionPanel.Section>
                      <Action.CopyToClipboard title="Copy Instructions" content={preset.instructions} shortcut={sc("cmd", "shift", "c")} />
                    </ActionPanel.Section>
                  )}
                  {!preset.builtin && (
                    <ActionPanel.Section>
                      <Action title="Delete Preset" icon="trash-16" style="destructive" shortcut={sc("ctrl", "x")} onAction={() => deletePreset(preset)} />
                    </ActionPanel.Section>
                  )}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
      <List.EmptyView
        title={error ? "Could Not Load Presets" : "No Presets Found"}
        description={error ? errorMessage(error) : query ? undefined : "Save instructions, a model and tools as a preset to start focused chats in one step."}
        icon={error ? "warning-16" : query ? undefined : DEFAULT_AI_ICON}
        actions={emptyActions}
      />
    </List>
  );
}
