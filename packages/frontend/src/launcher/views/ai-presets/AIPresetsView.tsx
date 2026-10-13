import type { AIPreset } from "@surgecast/protocol";
import { useBackend } from "../../../bridge/hooks";
import { EmptyView, ViewFrame } from "../../../components";
import type { LauncherViewProps } from "../registry";
import { AIPresetEditor } from "./AIPresetEditor";
import { AIPresetList } from "./AIPresetList";

export interface AIPresetsViewProps {
  action?: "create";
  query?: string;
}

/** `ai.presets`: Manage Presets, or Create Preset when launched with `action: "create"`. */
export function AIPresetsView({ props, title, icon }: LauncherViewProps<AIPresetsViewProps>) {
  if (props.action === "create") return <AIPresetEditor mode="create" navigationTitle={title} navigationIcon={icon} />;
  return <AIPresetList navigationTitle={title} navigationIcon={icon} initialQuery={props.query} />;
}

export interface AIPresetEditorViewProps {
  preset?: AIPreset;
  id?: string;
  duplicate?: boolean;
}

/** `ai.presets.create`: create, edit (`preset` or `id`) or duplicate a preset. */
export function AIPresetEditorView({ props, title, icon }: LauncherViewProps<AIPresetEditorViewProps>) {
  const lookup = !props.preset && Boolean(props.id);
  const { data: presets, isLoading } = useBackend("ai.presets.list", undefined, undefined, { enabled: lookup });
  const preset = props.preset ?? presets?.find((p) => p.id === props.id);
  const mode = props.duplicate ? "duplicate" : preset || props.id ? "edit" : "create";
  const navigationTitle = title ?? (mode === "edit" ? "Edit Preset" : mode === "duplicate" ? "Duplicate Preset" : "Create Preset");

  if (lookup && !preset) {
    if (isLoading || !presets) return <AIPresetEditor key="loading" mode="edit" navigationTitle={navigationTitle} navigationIcon={icon} isLoading />;
    return (
      <ViewFrame navigationTitle={navigationTitle} navigationIcon={icon}>
        <EmptyView title="Preset Not Found" description="It may have been deleted on this or another device." />
      </ViewFrame>
    );
  }
  return <AIPresetEditor key={preset?.id ?? "new"} mode={mode} preset={preset} navigationTitle={navigationTitle} navigationIcon={icon} />;
}
