import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AICommand, ImageLike } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { useSetting } from "../../../bridge/settings";
import { Action, ActionPanel, confirmAlert, Dropdown, EmptyView, ListBox, showFailureToast, showToast, useRegisterActions, useViewController, ViewFrame } from "../../../components";
import { primaryActions } from "../../../components/actions/model";
import type { ListSectionModel } from "../../../components/List/model";
import type { SearchBarHandle } from "../../../components/SearchBar/SearchBar";
import { sc } from "../../../lib/keyboard";
import { launchCommand } from "../../launch";
import { DEFAULT_AI_ICON, tagColor } from "../ai-shared/options";
import { AICommandDetail } from "./AICommandDetail";
import { AICommandEditor } from "./AICommandEditor";
import { commandTags } from "./command-form";
import { ALL_TAGS, commandDeeplink, commandSections } from "./command-list";
import { ExportAICommands } from "./ExportAICommands";
import { ImportAICommands } from "./ImportAICommands";
import { promptArguments } from "./placeholders";
import "./ai-commands.css";

export interface AICommandListProps {
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  initialQuery?: string;
}

/**
 * Search AI Commands: custom and built-in commands with a prompt preview,
 * a tag filter, and argument fields for the selected command next to the
 * search text (as in root search).
 */
export function AICommandList({ navigationTitle, navigationIcon, initialQuery = "" }: AICommandListProps) {
  const { data: commands, error, isLoading, refetch } = useBackend("ai.commands.list", undefined);
  const [query, setQuery] = useState(initialQuery);
  const [tag, setTag] = useState(ALL_TAGS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [args, setArgs] = useState<Record<string, string>>({});
  const searchBarRef = useRef<SearchBarHandle>(null);

  const tags = useMemo(() => commandTags(commands ?? []), [commands]);
  const activeTag = tags.includes(tag) ? tag : ALL_TAGS;
  const sections = useMemo(() => commandSections(commands ?? [], query, activeTag), [commands, query, activeTag]);
  const visible = useMemo(() => sections.flatMap((s) => s.items.map((i) => i.command)), [sections]);

  // Keep the selection while it is visible; a new query or filter selects the first result.
  const filterKey = `${query}\u0000${activeTag}`;
  const lastFilter = useRef(filterKey);
  let selected = visible.find((c) => c.id === selectedId);
  if (lastFilter.current !== filterKey || !selected) {
    lastFilter.current = filterKey;
    selected = visible[0];
    if ((selected?.id ?? null) !== selectedId) setSelectedId(selected?.id ?? null);
  }

  const commandArgs = useMemo(() => (selected ? promptArguments(selected.prompt) : []), [selected]);
  const argsOwner = useRef<string | undefined>(undefined);
  if (argsOwner.current !== selected?.id) {
    argsOwner.current = selected?.id;
    if (Object.keys(args).length) setArgs({});
  }

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLElement>, field: number): boolean => {
    const fields = searchBarRef.current?.arguments;
    if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey || !commandArgs.length || !fields) return false;
    const next = event.shiftKey ? field - 1 : field + 1;
    if (next >= 0 && next < commandArgs.length) fields.focus(next);
    else searchBarRef.current?.focus();
    return true;
  };

  const launch = (command: AICommand, values: Record<string, string>) => {
    const filled = Object.fromEntries(Object.entries(values).filter(([, value]) => value));
    return launchCommand(`ai-command:${command.id}`, { title: command.name, icon: command.icon ?? DEFAULT_AI_ICON, arguments: Object.keys(filled).length ? filled : undefined });
  };

  const run = (command: AICommand) => {
    if (command.id !== selected?.id) {
      // ⌘1–9 on another row: commands with arguments are selected so their fields can be filled in.
      setSelectedId(command.id);
      return promptArguments(command.prompt).length ? undefined : launch(command, {});
    }
    const fields = searchBarRef.current?.arguments;
    const missing = commandArgs.length && fields ? fields.validate() : -1;
    if (missing >= 0) {
      fields?.focus(missing);
      return;
    }
    return launch(command, args);
  };

  return (
    <ViewFrame
      searchBar={{
        value: query,
        onChange: setQuery,
        placeholder: "Search AI commands…",
        args: commandArgs.length ? commandArgs : undefined,
        argValues: args,
        onArgChange: (name, value) => setArgs((current) => ({ ...current, [name]: value })),
      }}
      headerAccessory={tags.length > 0 ? <TagFilter tags={tags} value={activeTag} onChange={setTag} /> : undefined}
      isLoading={isLoading}
      navigationTitle={navigationTitle}
      navigationIcon={navigationIcon}
      onSearchKeyDown={onSearchKeyDown}
      searchBarRef={searchBarRef}
    >
      <CommandListContent
        sections={sections}
        selected={selected}
        onSelect={setSelectedId}
        isLoading={isLoading}
        error={error}
        retry={refetch}
        searching={Boolean(query) || activeTag !== ALL_TAGS}
        navigationIcon={navigationIcon}
        run={run}
      />
    </ViewFrame>
  );
}

function TagFilter({ tags, value, onChange }: { tags: string[]; value: string; onChange: (tag: string) => void }) {
  return (
    <Dropdown
      variant="nav"
      aria-label="Filter by Tag"
      value={value}
      placeholder="Select Tags…"
      searchPlaceholder="Search tags…"
      sections={[
        { items: [{ value: ALL_TAGS, title: "All Commands", icon: "stars-16" }] },
        { title: "Tags", items: tags.map((tag) => ({ value: tag, title: tag, icon: { source: "circle-filled-16", tintColor: tagColor(tag) } })) },
      ]}
      onChange={onChange}
    />
  );
}

interface ContentProps {
  sections: ReturnType<typeof commandSections>;
  selected: AICommand | undefined;
  onSelect: (id: string | null) => void;
  isLoading: boolean;
  error: unknown;
  retry: () => void;
  searching: boolean;
  navigationIcon?: ImageLike;
  run: (command: AICommand) => unknown;
}

function CommandListContent({ sections, selected, onSelect, isLoading, error, retry, searching, navigationIcon, run }: ContentProps) {
  const view = useViewController();
  const { data: models } = useBackend("ai.models.list", {});
  const commandsModel = useSetting("ai.commandsModel");
  const registered = useRegisterActions(error ? <ActionPanel><Action title="Try Again" shortcut={sc("cmd", "r")} onAction={retry} /></ActionPanel> : commandActions(selected, run, navigationIcon));
  const primary = primaryActions(registered).primary;

  const listSections = useMemo<ListSectionModel[]>(
    () => sections.map((s) => ({ id: s.id, title: s.title, items: s.items.map(({ command, ranges }) => ({ id: command.id, title: command.name, icon: command.icon ?? DEFAULT_AI_ICON, titleRanges: ranges })) })),
    [sections],
  );

  if (!listSections.length) {
    if (isLoading) return null;
    return (
      <EmptyView
        title={error ? "Could Not Load AI Commands" : "No AI Commands Found"}
        icon={error ? "warning-16" : undefined}
        description={error ? errorMessage(error) : searching ? undefined : "Turn prompts you use often into commands you can run from anywhere."}
        action={primary ? { title: primary.title, onAction: () => view.runAction(primary) } : undefined}
      />
    );
  }

  return (
    <div className="sc-list-split">
      <div className="sc-list-split__master">
        <ListBox
          sections={listSections}
          selectedId={selected?.id ?? null}
          onSelectedIdChange={onSelect}
          onActivate={(item) => {
            const command = sections.flatMap((s) => s.items).find((i) => i.command.id === item.id)?.command;
            if (command) void run(command);
          }}
          numberHints
          aria-label="AI Commands"
        />
      </div>
      <div className="sc-list-split__detail">{selected && <AICommandDetail command={selected} models={models} commandsModel={commandsModel} />}</div>
    </div>
  );
}

async function deleteCommand(command: AICommand) {
  const confirmed = await confirmAlert({
    title: `Delete “${command.name}”?`,
    message: "This AI command will be removed for good.",
    icon: command.icon ?? DEFAULT_AI_ICON,
    primaryAction: { title: "Delete", style: "destructive" },
  });
  if (!confirmed) return;
  try {
    await backend.call("ai.commands.delete", { id: command.id });
    showToast({ style: "success", title: "AI command deleted", message: command.name });
  } catch (error) {
    showFailureToast("Couldn't delete the AI command", error);
  }
}

async function resetCommand(command: AICommand) {
  const confirmed = await confirmAlert({
    title: `Reset “${command.name}”?`,
    message: "Your changes to this built-in command will be replaced with the original prompt and settings.",
    icon: command.icon ?? DEFAULT_AI_ICON,
    primaryAction: { title: "Reset", style: "destructive" },
  });
  if (!confirmed) return;
  try {
    await backend.call("ai.commands.reset", { id: command.id });
    showToast({ style: "success", title: "AI command reset", message: command.name });
  } catch (error) {
    showFailureToast("Couldn't reset the AI command", error);
  }
}

function commandActions(selected: AICommand | undefined, run: (command: AICommand) => unknown, icon?: ImageLike) {
  const create = <Action.Push title="Create AI Command" icon="plus-square-16" shortcut={sc("cmd", "n")} target={<AICommandEditor mode="create" navigationTitle="Create AI Command" navigationIcon={icon} />} />;
  const transfer = (
    <ActionPanel.Section>
      <Action.Push title="Import AI Commands" icon="download-16" target={<ImportAICommands navigationTitle="Import AI Commands" navigationIcon={icon} />} />
      <Action.Push title="Export AI Commands" icon="upload-16" target={<ExportAICommands navigationTitle="Export AI Commands" navigationIcon={icon} />} />
    </ActionPanel.Section>
  );
  if (!selected) {
    return (
      <ActionPanel>
        {create}
        {transfer}
      </ActionPanel>
    );
  }
  return (
    <ActionPanel title={selected.name}>
      <ActionPanel.Section>
        <Action title="Run AI Command" icon="stars-16" onAction={() => run(selected)} />
        <Action.Push title="Edit AI Command" icon="pencil-16" shortcut={sc("cmd", "e")} target={<AICommandEditor key={selected.id} mode="edit" command={selected} navigationTitle="Edit AI Command" navigationIcon={icon} />} />
        <Action.Push title="Duplicate AI Command" icon="duplicate-16" shortcut={sc("cmd", "d")} target={<AICommandEditor key={selected.id} mode="duplicate" command={selected} navigationTitle="Duplicate AI Command" navigationIcon={icon} />} />
      </ActionPanel.Section>
      <ActionPanel.Section>{create}</ActionPanel.Section>
      <ActionPanel.Section>
        <Action.CopyToClipboard title="Copy Prompt" content={selected.prompt} shortcut={sc("cmd", "shift", "c")} />
        <Action.CopyToClipboard title="Copy Deeplink" icon="link-16" content={commandDeeplink(selected)} shortcut={sc("cmd", "shift", "l")} />
      </ActionPanel.Section>
      {transfer}
      <ActionPanel.Section>
        {selected.builtin ? (
          <Action title="Reset to Default" icon="arrow-counter-clockwise-16" onAction={() => resetCommand(selected)} />
        ) : (
          <Action title="Delete AI Command" icon="trash-16" style="destructive" shortcut={sc("ctrl", "x")} onAction={() => deleteCommand(selected)} />
        )}
      </ActionPanel.Section>
    </ActionPanel>
  );
}

