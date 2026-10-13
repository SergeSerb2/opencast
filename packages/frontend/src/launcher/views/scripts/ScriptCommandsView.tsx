import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { ScriptCommand } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { useBackend } from "../../../bridge/hooks";
import { native } from "../../../bridge/native";
import { useSetting } from "../../../bridge/settings";
import { EmptyView, ItemDetail, ListBox, ListDropdown, Metadata, ViewFrame, showFailureToast, showHUD, showToast, useNavigation } from "../../../components";
import type { ActionModel, ActionPanelModel } from "../../../components";
import type { ListItemModel, ListSectionModel } from "../../../components/List/model";
import type { SearchBarHandle } from "../../../components/SearchBar/SearchBar";
import { sc } from "../../../lib/keyboard";
import { hideLauncher, launchCommandInfo } from "../../launch";
import type { LauncherViewProps } from "../registry";
import { AddScriptDirectoryView } from "./AddScriptDirectoryView";
import { CreateScriptCommandView } from "./CreateScriptCommandView";
import { rememberLaunchArguments } from "./executions";
import {
  ALL_PACKAGES,
  argumentValues,
  basename,
  languageName,
  MODE_LABELS,
  packageNames,
  refreshLabel,
  scriptDeeplink,
  scriptIcon,
  scriptSections,
  scriptUsage,
} from "./script-list";

async function copy(text: string, hud: string): Promise<void> {
  try {
    await native.call("clipboard.write", { content: { kind: "text", text } });
    await showHUD(hud);
  } catch (error) {
    showFailureToast("Failed to copy", error);
  }
}

function detailMarkdown(script: ScriptCommand): string {
  const usage = "```sh\n" + scriptUsage(script) + "\n```";
  return script.description ? `${script.description}\n\n${usage}` : usage;
}

function ScriptDetail({ script }: { script: ScriptCommand }) {
  const language = languageName(script);
  const refresh = script.mode === "inline" ? refreshLabel(script.refreshTime) : undefined;
  return (
    <ItemDetail
      markdown={detailMarkdown(script)}
      metadata={
        <Metadata>
          <Metadata.Label title="Name" text={script.title} />
          <Metadata.Label title="Mode" text={MODE_LABELS[script.mode]} />
          {refresh && <Metadata.Label title="Refresh" text={refresh} />}
          <Metadata.Label title="Package" text={script.packageName || "None"} />
          {language && <Metadata.Label title="Language" text={language} />}
          {script.arguments.length > 0 && (
            <Metadata.TagList title="Arguments">
              {script.arguments.map((argument) => (
                <Metadata.TagList.Item key={argument.name} text={argument.placeholder || argument.name} />
              ))}
            </Metadata.TagList>
          )}
          {script.needsConfirmation && <Metadata.Label title="Confirmation" text="Asks before running" />}
          {script.author && (script.authorUrl ? <Metadata.Link title="Author" text={script.author} target={script.authorUrl} /> : <Metadata.Label title="Author" text={script.author} />)}
          <Metadata.Label title="File" text={basename(script.path)} />
        </Metadata>
      }
    />
  );
}

/** "Search Script Commands": scripts from the configured directories, grouped by package, with inline arguments. */
export function ScriptCommandsView({ props, title, icon }: LauncherViewProps<{ query?: string }>) {
  const navigation = useNavigation();
  const { data: scripts, isLoading, refetch } = useBackend("scripts.list", undefined);
  const directories = useSetting("scripts.directories");
  const [query, setQuery] = useState(props.query ?? "");
  const [packageFilter, setPackageFilter] = useState(ALL_PACKAGES);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchBarRef = useRef<SearchBarHandle>(null);

  const all = useMemo(() => scripts ?? [], [scripts]);
  const packages = useMemo(() => packageNames(all), [all]);
  const sections = useMemo(() => scriptSections(all, query, packageFilter), [all, query, packageFilter]);
  const byPath = useMemo(() => new Map(sections.flatMap((s) => s.scripts.map((script) => [script.path, script] as const))), [sections]);

  useEffect(() => {
    if (packageFilter !== ALL_PACKAGES && !packages.includes(packageFilter)) setPackageFilter(ALL_PACKAGES);
  }, [packageFilter, packages]);

  // Keep the selection while the data refreshes; otherwise select the first match.
  const firstId = sections[0]?.scripts[0]?.path ?? null;
  const selectionKey = `${query}\u0000${packageFilter}`;
  const lastSelectionKey = useRef(selectionKey);
  if (lastSelectionKey.current !== selectionKey || (selectedId !== null ? !byPath.has(selectedId) : firstId !== null)) {
    lastSelectionKey.current = selectionKey;
    if (selectedId !== firstId) setSelectedId(firstId);
  }
  const selected = selectedId ? byPath.get(selectedId) : undefined;
  const scriptArgs = selected && selected.mode !== "inline" && selected.arguments.length ? selected.arguments : undefined;

  // Arguments belong to the selected script; start fresh when it changes.
  const argsOwner = useRef<string | undefined>(undefined);
  if (argsOwner.current !== selected?.path) {
    argsOwner.current = selected?.path;
    if (Object.keys(args).length) setArgs({});
  }

  const openCreate = () => navigation.push(<CreateScriptCommandView props={{}} title="Create Script Command" icon={icon} view={{ id: "scripts.create" }} />);
  const openAddDirectory = () => navigation.push(<AddScriptDirectoryView icon={icon} />);
  const reload = async () => {
    const toast = showToast({ style: "animated", title: "Reloading script commands…" });
    try {
      await backend.call("scripts.reload");
      refetch();
      toast.update({ style: "success", title: "Reloaded Script Commands" });
    } catch (error) {
      toast.update({ style: "failure", title: "Could not reload script commands", message: error instanceof Error ? error.message : undefined });
    }
  };

  const run = async (script: ScriptCommand) => {
    const takesArguments = script.mode !== "inline" && script.arguments.length > 0;
    if (takesArguments) {
      // Arguments are typed inline for the selected row; a ⌘-number launch of another row selects it first.
      if (script.path !== selected?.path) {
        setSelectedId(script.path);
        return;
      }
      const missing = searchBarRef.current?.arguments?.validate() ?? -1;
      if (missing >= 0) {
        searchBarRef.current?.arguments?.focus(missing);
        return;
      }
    }
    const values = takesArguments ? Object.fromEntries(script.arguments.map((a) => [a.name, args[a.name] ?? ""])) : {};
    rememberLaunchArguments(script.path, argumentValues(script, values));
    await launchCommandInfo({ id: `script:${script.path}`, title: script.title, icon: scriptIcon(script) }, { arguments: takesArguments ? values : undefined });
  };

  const createAction: ActionModel = { id: "create", title: "Create Script Command", icon: "new-document-16", shortcut: sc("cmd", "n"), onAction: openCreate };
  const addDirectoryAction: ActionModel = { id: "add-directory", title: "Add Script Directory…", icon: "new-folder-16", shortcut: sc("cmd", "shift", "n"), onAction: openAddDirectory };
  const reloadAction: ActionModel = { id: "reload", title: "Reload Script Commands", icon: "arrow-clockwise-16", shortcut: sc("cmd", "r"), onAction: reload };
  const noDirectories = directories.length === 0 && all.length === 0;

  const actions: ActionPanelModel = selected
    ? {
        title: selected.title,
        sections: [
          { actions: [{ id: "run", title: "Run Script Command", icon: "terminal-16", shortcut: sc("return"), onAction: () => run(selected) }] },
          {
            actions: [
              { id: "show-in-finder", title: "Show in Finder", icon: "finder-16", shortcut: sc("cmd", "shift", "f"), onAction: () => native.call("open.showInFinder", { path: selected.path }).then(hideLauncher) },
              { id: "open", title: "Open Script", icon: "arrow-ne-16", shortcut: sc("cmd", "o"), onAction: () => native.call("open.path", { path: selected.path }).then(hideLauncher) },
              ...(selected.authorUrl ? [{ id: "author", title: "Open Author Website", icon: "globe-01-16", onAction: () => native.call("open.url", { url: selected.authorUrl! }).then(hideLauncher) }] : []),
            ],
          },
          {
            actions: [
              { id: "copy-path", title: "Copy Path", icon: "copy-clipboard-16", shortcut: sc("cmd", "shift", "."), onAction: () => copy(selected.path, "Copied Path") },
              { id: "copy-deeplink", title: "Copy Deeplink", icon: "link-16", shortcut: sc("cmd", "shift", "c"), onAction: () => copy(scriptDeeplink(selected), "Copied Deeplink") },
            ],
          },
          { actions: [createAction, addDirectoryAction, reloadAction] },
        ],
      }
    : { sections: [{ actions: noDirectories ? [addDirectoryAction, createAction, reloadAction] : [createAction, addDirectoryAction, reloadAction] }] };

  const listSections = useMemo<ListSectionModel[]>(
    () => sections.map((section) => ({ id: section.id, title: section.title, subtitle: section.subtitle, items: section.scripts.map((script): ListItemModel => ({ id: script.path, title: script.title, icon: scriptIcon(script) })) })),
    [sections],
  );

  const loaded = scripts !== undefined;
  const hasScripts = all.length > 0;
  const empty = loaded && !isLoading && !sections.length;

  let emptyView: ReactNode = null;
  if (empty) {
    emptyView = noDirectories ? (
      <EmptyView title="No Script Directories" description="Add a folder with your scripts to run them from Surgecast." action={{ title: "Add Script Directory", onAction: openAddDirectory }} />
    ) : !hasScripts ? (
      <EmptyView title="No Script Commands" description="Create a script command, or put scripts with Raycast-style metadata into one of your script directories." action={{ title: "Create Script Command", onAction: openCreate }} />
    ) : (
      <EmptyView title="No Matching Script Commands" />
    );
  }

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLElement>, field: number): boolean => {
    const fields = searchBarRef.current?.arguments;
    if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey || !scriptArgs || !fields) return false;
    const next = event.shiftKey ? field - 1 : field + 1;
    if (next >= 0 && next < scriptArgs.length) fields.focus(next);
    else searchBarRef.current?.focus();
    return true;
  };

  return (
    <ViewFrame
      searchBar={
        hasScripts || !loaded
          ? {
              value: query,
              onChange: setQuery,
              placeholder: "Search script commands…",
              args: scriptArgs,
              argValues: args,
              onArgChange: (name, value) => setArgs((prev) => ({ ...prev, [name]: value })),
            }
          : undefined
      }
      headerAccessory={
        hasScripts ? (
          <ListDropdown tooltip="Filter by Package" value={packageFilter} onChange={setPackageFilter}>
            <ListDropdown.Item value={ALL_PACKAGES} title="All Packages" />
            <ListDropdown.Section>
              {packages.map((name) => (
                <ListDropdown.Item key={name} value={name} title={name} />
              ))}
            </ListDropdown.Section>
          </ListDropdown>
        ) : undefined
      }
      isLoading={isLoading}
      navigationTitle={title}
      navigationIcon={icon}
      actions={actions}
      onSearchKeyDown={onSearchKeyDown}
      searchBarRef={searchBarRef}
    >
      {empty ? (
        emptyView
      ) : (
        <div className="sc-list-split">
          <div className="sc-list-split__master">
            <ListBox
              sections={listSections}
              selectedId={selectedId}
              onSelectedIdChange={setSelectedId}
              onActivate={(item) => {
                const script = byPath.get(item.id);
                if (script) void run(script);
              }}
              numberHints
              aria-label="Script commands"
            />
          </div>
          <div className="sc-list-split__detail">{selected && <ScriptDetail script={selected} />}</div>
        </div>
      )}
    </ViewFrame>
  );
}
