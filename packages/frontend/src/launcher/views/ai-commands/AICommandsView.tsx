import type { AICommand } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { useBackend } from "../../../bridge/hooks";
import { EmptyView, ViewFrame } from "../../../components";
import { launchCommandInfo } from "../../launch";
import type { LauncherViewProps } from "../registry";
import { AICommandEditor } from "./AICommandEditor";
import { AICommandList } from "./AICommandList";
import { ExportAICommands } from "./ExportAICommands";
import { ImportAICommands } from "./ImportAICommands";

const SEARCH_COMMAND_ID = "builtin:ai.searchAiCommands";

/** After importing from the "Import AI Commands" command, show the imported commands in their list. */
async function replaceWithSearch(): Promise<void> {
  const command = await backend.call("commands.get", { id: SEARCH_COMMAND_ID }).catch(() => null);
  await launchCommandInfo(command ?? { id: SEARCH_COMMAND_ID, title: "Search AI Commands", icon: "stars-16" }, { replace: true });
}

export interface AICommandsViewProps {
  action?: "create" | "import" | "export";
  /** Root search text the command was launched with. */
  query?: string;
}

/** `ai.commands`: Search AI Commands, or the create/import/export command it was launched as. */
export function AICommandsView({ props, title, icon }: LauncherViewProps<AICommandsViewProps>) {
  switch (props.action) {
    case "create":
      return <AICommandEditor mode="create" initialPrompt={props.query} navigationTitle={title} navigationIcon={icon} />;
    case "import":
      return <ImportAICommands navigationTitle={title} navigationIcon={icon} onImported={() => void replaceWithSearch()} />;
    case "export":
      return <ExportAICommands navigationTitle={title} navigationIcon={icon} />;
    default:
      return <AICommandList navigationTitle={title} navigationIcon={icon} initialQuery={props.query} />;
  }
}

export interface AICommandEditorViewProps {
  /** Command to edit (or duplicate). */
  command?: AICommand;
  /** Id of the command to edit when the full record is not passed. */
  id?: string;
  duplicate?: boolean;
  query?: string;
}

/** `ai.commands.create`: create, edit (`command` or `id`) or duplicate an AI command. */
export function AICommandEditorView({ props, title, icon }: LauncherViewProps<AICommandEditorViewProps>) {
  const lookup = !props.command && Boolean(props.id);
  const { data: commands, isLoading } = useBackend("ai.commands.list", undefined, undefined, { enabled: lookup });
  const command = props.command ?? commands?.find((c) => c.id === props.id);
  const mode = props.duplicate ? "duplicate" : command || props.id ? "edit" : "create";
  const navigationTitle = title ?? (mode === "edit" ? "Edit AI Command" : mode === "duplicate" ? "Duplicate AI Command" : "Create AI Command");

  if (lookup && !command) {
    if (isLoading || !commands) return <AICommandEditor key="loading" mode="edit" navigationTitle={navigationTitle} navigationIcon={icon} isLoading />;
    return (
      <ViewFrame navigationTitle={navigationTitle} navigationIcon={icon}>
        <EmptyView title="AI Command Not Found" description="It may have been deleted on this or another device." />
      </ViewFrame>
    );
  }
  return <AICommandEditor key={command?.id ?? "new"} mode={mode} command={command} initialPrompt={props.query} navigationTitle={navigationTitle} navigationIcon={icon} />;
}
