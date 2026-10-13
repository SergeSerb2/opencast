import { useState } from "react";
import type { AICommand, AIPreset } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { useBackend } from "../../../bridge/hooks";
import { errorMessage } from "../../../bridge/errors";
import { useSetting } from "../../../bridge/settings";
import { native } from "../../../bridge/native";
import { Button, IconButton } from "../../../components/Button/Button";
import { confirmAlert } from "../../../components/feedback/alert-store";
import { showFailureToast, showToast } from "../../../components/feedback/toast-store";
import { Image } from "../../../icons/Image";
import { CardEmpty, Controls, Section } from "../../ui/layout";
import { MenuButton } from "../../ui/MenuButton";
import { PageFrame } from "../../ui/PageFrame";
import { promptForm } from "../../ui/prompt";
import { CommandEditor, OUTPUT_LABELS, PresetEditor } from "./editors";
import { useEnabledModels } from "./shared";
import { exportPresets, parsePresetImport } from "./preset-json";
import "./ai.css";

function useModelName(): (ref: string | undefined) => string | undefined {
  const { data: models } = useEnabledModels();
  return (ref) => (ref ? (models?.find((m) => m.ref === ref)?.name ?? ref.split("/").slice(1).join("/")) : undefined);
}

async function importCommands() {
  const values = await promptForm({
    title: "Import AI Commands",
    message: "Paste AI Commands exported from OpenCast or Raycast (JSON).",
    fields: [{ id: "json", label: "JSON", type: "textarea", placeholder: '[{ "title": "Summarize", "prompt": "Summarize {selection}" }]', required: true }],
    primaryTitle: "Import",
  });
  if (!values) return;
  try {
    const { imported } = await backend.call("ai.commands.import", { json: values.json });
    showToast({ style: "success", title: `Imported ${imported} AI command${imported === 1 ? "" : "s"}` });
  } catch (error) {
    showFailureToast("Could not import AI commands", error);
  }
}

async function exportCommands() {
  try {
    const { json } = await backend.call("ai.commands.export");
    await native.call("clipboard.write", { content: { kind: "text", text: json } });
    showToast({ style: "success", title: "Copied AI commands as JSON" });
  } catch (error) {
    showFailureToast("Could not export AI commands", error);
  }
}

/** Settings → AI → AI Commands. */
export function AICommandsPage() {
  const { data: commands, isLoading, error, refetch } = useBackend("ai.commands.list", undefined);
  const modelName = useModelName();
  const [editing, setEditing] = useState<AICommand | null | "new">(null);
  const warnBeforeDelete = useSetting("ai.deleteAiCommandWarning");
  const sorted = [...(commands ?? [])].sort((a, b) => Number(Boolean(a.builtin)) - Number(Boolean(b.builtin)) || a.name.localeCompare(b.name));

  const remove = async (command: AICommand) => {
    if (
      warnBeforeDelete && !(await confirmAlert({ title: `Delete “${command.name}”?`, message: "The command is removed from root search and every synced Mac.", primaryAction: { title: "Delete", style: "destructive" } }))
    )
      return;
    try {
      await backend.call("ai.commands.delete", { id: command.id });
    } catch (error) {
      showFailureToast("Could not delete command", error);
    }
  };
  const reset = async (command: AICommand) => {
    if (!(await confirmAlert({ title: `Reset “${command.name}”?`, message: "Restore its original prompt and options.", primaryAction: { title: "Reset Command" } }))) return;
    try {
      await backend.call("ai.commands.reset", { id: command.id });
      showToast({ style: "success", title: `Reset “${command.name}”` });
    } catch (error) {
      showFailureToast("Could not reset command", error);
    }
  };

  return (
    <PageFrame
      title="AI Commands"
      titleMode="always"
      actions={
        <Controls>
          <MenuButton
            icon="ellipsis-16"
            label="Import and Export"
            width={220}
            sections={[
              {
                items: [
                  { id: "import", title: "Import AI Commands…", icon: "download-16" },
                  { id: "export", title: "Export AI Commands", icon: "upload-16" },
                ],
              },
            ]}
            onSelect={(item) => void (item.id === "import" ? importCommands() : exportCommands())}
          />
          <Button size="small" icon="plus-16" onClick={() => setEditing("new")}>
            Create AI Command
          </Button>
        </Controls>
      }
    >
      <p className="sc-s-page-intro">AI Commands run a saved prompt on your selection or clipboard. Built-in commands can be edited and reset; yours sync with Cloud Sync.</p>
      <Section anchor="commands" card={false}>
        <div className="sc-s-card">
          {sorted.length ? (
            sorted.map((command) => (
              <div key={command.id} className="sc-s-item sc-s-library-row">
                <button type="button" className="sc-s-library-row__main" onClick={() => setEditing(command)}>
                  <Image source={command.icon ?? "stars-16"} size={20} />
                  <span className="sc-s-row__label">
                    <span className="sc-s-row__title sc-truncate">
                      {command.name}
                      {command.builtin && <span className="sc-s-badge">Built-in</span>}
                    </span>
                    <span className="sc-s-navrow__description sc-truncate">{[OUTPUT_LABELS[command.output], modelName(command.model) ?? "Default model"].join(" · ")}</span>
                  </span>
                </button>
                <span className="sc-s-library-row__actions">
                  {command.builtin ? (
                    <IconButton icon="arrow-counter-clockwise-16" label={`Reset ${command.name}`} onClick={() => void reset(command)} />
                  ) : (
                    <IconButton icon="trash-16" label={`Delete ${command.name}`} onClick={() => void remove(command)} />
                  )}
                </span>
              </div>
            ))
          ) : (
            <CardEmpty title={error ? "Couldn't Load AI Commands" : isLoading ? "Loading…" : "No AI Commands"} description={error ? errorMessage(error) : isLoading ? undefined : "Create one to reuse a prompt from root search."} action={Boolean(error) && <Button size="small" onClick={refetch}>Try Again</Button>} />
          )}
        </div>
      </Section>
      {editing && <CommandEditor command={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </PageFrame>
  );
}

/** Settings → AI → Agents (chat presets). */
export function PresetsPage() {
  const { data: presets, isLoading, error, refetch } = useBackend("ai.presets.list", undefined);
  const modelName = useModelName();
  const [editing, setEditing] = useState<AIPreset | null | "new">(null);
  const [importing, setImporting] = useState(false);
  const warnBeforeDelete = useSetting("ai.deleteAgentWarning");
  const importPresets = async () => {
    const values = await promptForm({
      title: "Import Agents",
      message: "Paste agents exported from OpenCast as JSON. Existing agents are kept.",
      fields: [{ id: "json", label: "JSON", type: "textarea", required: true }],
      primaryTitle: "Import",
      validate: ({ json }) => {
        try { parsePresetImport(json); return null; } catch (error) { return { json: error instanceof Error ? error.message : "Invalid agents" }; }
      },
    });
    if (!values) return;
    setImporting(true);
    let imported = 0;
    try {
      for (const preset of parsePresetImport(values.json)) {
        await backend.call("ai.presets.upsert", preset);
        imported++;
      }
      showToast({ style: "success", title: `Imported ${imported} agent${imported === 1 ? "" : "s"}` });
    } catch (error) {
      showFailureToast(`Import stopped after ${imported} agent${imported === 1 ? "" : "s"}`, error);
    } finally { setImporting(false); }
  };
  const copyPresets = async () => {
    try {
      await native.call("clipboard.write", { content: { kind: "text", text: exportPresets(presets ?? []) } });
      showToast({ style: "success", title: "Copied agents as JSON" });
    } catch (error) { showFailureToast("Could not export agents", error); }
  };
  const reset = async (preset: AIPreset) => {
    if (!(await confirmAlert({ title: `Reset “${preset.name}”?`, message: "Restore its original instructions, model and tools.", primaryAction: { title: "Reset Agent" } }))) return;
    try {
      await backend.call("ai.presets.reset", { id: preset.id });
      showToast({ style: "success", title: `Reset “${preset.name}”` });
    } catch (error) { showFailureToast("Could not reset agent", error); }
  };
  const remove = async (preset: AIPreset) => {
    if (warnBeforeDelete && !(await confirmAlert({ title: `Delete “${preset.name}”?`, message: "Chats that used this agent keep their messages.", primaryAction: { title: "Delete", style: "destructive" } }))) return;
    try {
      await backend.call("ai.presets.delete", { id: preset.id });
    } catch (error) {
      showFailureToast("Could not delete agent", error);
    }
  };
  return (
    <PageFrame
      title="Agents"
      titleMode="always"
      actions={
        <Controls>
          <MenuButton icon="ellipsis-16" label="Import and Export Agents" width={220} sections={[{ items: [
            { id: "import", title: importing ? "Importing…" : "Import Agents…", icon: "download-16", disabled: importing },
            { id: "export", title: "Export Agents", icon: "upload-16", disabled: !presets?.length },
          ] }]} onSelect={(item) => void (item.id === "import" ? importPresets() : copyPresets())} />
          <Button size="small" icon="plus-16" onClick={() => setEditing("new")}>
          Create Agent
          </Button>
        </Controls>
      }
    >
      <p className="sc-s-page-intro">Agents are reusable chat setups: instructions, a model, creativity and tools. Pick one when you start a chat, or show them in root search.</p>
      <Section anchor="agents" card={false}>
        <div className="sc-s-card">
          {presets?.length ? (
            presets.map((preset) => (
              <div key={preset.id} className="sc-s-item sc-s-library-row">
                <button type="button" className="sc-s-library-row__main" onClick={() => setEditing(preset)}>
                  <Image source={preset.icon ?? "stars-16"} size={20} />
                  <span className="sc-s-row__label">
                    <span className="sc-s-row__title sc-truncate">
                      {preset.name}
                      {preset.builtin && <span className="sc-s-badge">Built-in</span>}
                    </span>
                    <span className="sc-s-navrow__description sc-truncate">
                      {[preset.description, modelName(preset.model) ?? "Default model", preset.webSearch ? "Web Search" : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
                <span className="sc-s-library-row__actions">{preset.builtin
                  ? <IconButton icon="arrow-counter-clockwise-16" label={`Reset ${preset.name}`} onClick={() => void reset(preset)} />
                  : <IconButton icon="trash-16" label={`Delete ${preset.name}`} onClick={() => void remove(preset)} />}</span>
              </div>
            ))
          ) : (
            <CardEmpty title={error ? "Couldn't Load Agents" : isLoading ? "Loading…" : "No Agents"} description={error ? errorMessage(error) : isLoading ? undefined : "Create an agent for tasks you repeat, like reviewing code or drafting emails."} action={Boolean(error) && <Button size="small" onClick={refetch}>Try Again</Button>} />
          )}
        </div>
      </Section>
      {editing && <PresetEditor preset={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </PageFrame>
  );
}
