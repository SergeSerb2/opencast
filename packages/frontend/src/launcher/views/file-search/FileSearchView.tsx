import { useEffect, useMemo, useState } from "react";
import type { AppInfo, FileResult } from "@opencast/protocol";
import { useBackend } from "../../../bridge/hooks";
import { native } from "../../../bridge/native";
import { setSetting, useSetting } from "../../../bridge/settings";
import { Action, ActionPanel, confirmAlert, List, showFailureToast, showHUD, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { hideLauncher } from "../../launch";
import { appleScriptString } from "../library/files";
import { basename, displayDirectory } from "../library/format";
import { pasteTitle, usePasteTarget } from "../library/usePasteTarget";
import type { LauncherViewProps } from "../registry";
import { QuicklinkFormView } from "../quicklinks/QuicklinkFormView";
import { FileDetail } from "./FileDetail";
import { FILE_TYPE_FILTERS, isFolder, matchesFileType, type FileTypeFilter } from "./file-types";
import "./file-search.css";

/** Search Files: Spotlight results (recently used files for an empty query) with preview, metadata and file actions. */
export function FileSearchView({ props, title, icon }: LauncherViewProps<{ query?: string }>) {
  const [text, setText] = useState(props.query ?? "");
  const [query, setQuery] = useState(text);
  const [type, setType] = useState<FileTypeFilter>("allTypes");
  const [showDetails, setShowDetails] = useState(true);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const includeHidden = useSetting("files.includeHiddenFiles");
  const target = usePasteTarget();
  const navigation = useNavigation();

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    native
      .call("apps.list", {})
      .then((list) => setApps([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setApps([]));
  }, []);

  const search = useBackend("files.search", { query, limit: 100 }, [query, includeHidden], { enabled: query.length > 0, onError: (error) => showFailureToast("File search failed", error) });
  const recent = useBackend("files.recent", { limit: 50 }, [includeHidden], { enabled: query.length === 0 });
  const source = query ? search : recent;
  const files = useMemo(() => (source.data ?? []).filter((f) => matchesFileType(f, type)), [source.data, type]);

  const run = async (label: string, operation: () => Promise<unknown>, hide = false) => {
    try {
      await operation();
      if (hide) hideLauncher();
    } catch (error) {
      showFailureToast(label, error);
    }
  };

  const trash = async (file: FileResult) => {
    const confirmed = await confirmAlert({ title: "Move to Trash?", message: `“${file.name}” will be moved to the Trash.`, icon: "trash-16", primaryAction: { title: "Move to Trash", style: "destructive" } });
    if (!confirmed) return;
    await run("Failed to move to Trash", async () => {
      await native.call("open.trash", { paths: [file.path] });
      showToast({ title: "Moved to Trash", message: file.name });
      source.setData((list) => (list ?? []).filter((f) => f.path !== file.path));
    });
  };

  const showInfo = (file: FileResult) =>
    run("Failed to show info", () => native.call("system.runAppleScript", { script: `tell application "Finder"\nactivate\nopen information window of (POSIX file ${appleScriptString(file.path)} as alias)\nend tell` }), true);

  const toggleHidden = () =>
    run("Failed to change setting", async () => {
      await setSetting("files.includeHiddenFiles", !includeHidden);
      showToast({ title: includeHidden ? "Hiding hidden files" : "Showing hidden files" });
    });

  const actionsFor = (file: FileResult) => {
    const folder = isFolder(file);
    return (
      <ActionPanel title={file.name}>
        <ActionPanel.Section>
          <Action.Open title="Open" icon="blank-document-16" target={file.path} />
          <Action.ShowInFinder path={file.path} />
          <Action title="Quick Look" icon="eye-16" shortcut={sc("cmd", "y")} onAction={() => run("Quick Look failed", () => native.call("open.quickLook", { path: file.path }))} />
          {folder && <Action title="Open in Terminal" icon="terminal-16" shortcut={sc("cmd", "opt", "return")} onAction={() => run("Failed to open Terminal", () => native.call("open.path", { path: file.path, app: "com.apple.Terminal" }), true)} />}
          <ActionPanel.Submenu title="Open With…" icon="upload-16" shortcut={sc("cmd", "o")} placeholder="Search applications…">
            {apps.map((app) => (
              <Action key={app.path} title={app.name} icon={{ fileIcon: app.path }} onAction={() => run("Failed to open", () => native.call("open.path", { path: file.path, app: app.bundleId ?? app.path }), true)} />
            ))}
          </ActionPanel.Submenu>
          <Action title="Show Info in Finder" icon="finder-16" shortcut={sc("cmd", "i")} onAction={() => showInfo(file)} />
          <Action title={includeHidden ? "Hide Hidden Files" : "Show Hidden Files"} icon="eye-16" shortcut={sc("cmd", "shift", ".")} onAction={toggleHidden} />
          <Action title="Toggle Info Panel" icon="app-window-sidebar-right-16" shortcut={sc("cmd", "shift", "i")} onAction={() => setShowDetails((v) => !v)} />
        </ActionPanel.Section>
        <ActionPanel.Section>
          <Action
            title="Copy File"
            icon="copy-clipboard-16"
            shortcut={sc("cmd", "shift", "c")}
            onAction={() =>
              run("Failed to copy file", async () => {
                await native.call("clipboard.write", { content: { kind: "file", paths: [file.path] } });
                await showHUD("Copied File to Clipboard");
              })
            }
          />
          <Action title={pasteTitle(target, "Paste File")} icon="clipboard-16" shortcut={sc("cmd", "shift", "v")} onAction={() => run("Failed to paste file", () => native.call("input.paste", { content: { kind: "file", paths: [file.path] } }))} />
          <Action.CopyToClipboard title="Copy Name" content={file.name} shortcut={sc("cmd", "opt", "c")} />
          <Action.CopyToClipboard title="Copy Path" content={file.path} shortcut={sc("cmd", "ctrl", "c")} />
        </ActionPanel.Section>
        <ActionPanel.Section>
          <Action title="Save as Quicklink" icon="link-16" shortcut={sc("cmd", "s")} onAction={() => navigation.push(<QuicklinkFormView initial={{ name: basename(file.path), link: file.path }} />)} />
          <Action title="Move to Trash" icon="trash-16" style="destructive" shortcut={sc("ctrl", "x")} onAction={() => trash(file)} />
        </ActionPanel.Section>
      </ActionPanel>
    );
  };

  return (
    <List
      searchText={text}
      onSearchTextChange={setText}
      filtering={false}
      isLoading={source.isLoading || text.trim() !== query}
      isShowingDetail={showDetails && files.length > 0}
      searchBarPlaceholder="Search files…"
      navigationTitle={title ?? "Search Files"}
      navigationIcon={icon}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by Type" id="file-search-type" storeValue onChange={(value) => setType(value as FileTypeFilter)}>
          <List.Dropdown.Section>
            <List.Dropdown.Item title={FILE_TYPE_FILTERS[0].title} value={FILE_TYPE_FILTERS[0].value} icon={FILE_TYPE_FILTERS[0].icon} />
          </List.Dropdown.Section>
          <List.Dropdown.Section>
            {FILE_TYPE_FILTERS.slice(1).map((filter) => (
              <List.Dropdown.Item key={filter.value} title={filter.title} value={filter.value} icon={filter.icon} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      <List.Section id="results" title={query ? undefined : "Recently Used"}>
        {files.map((file) => (
          <List.Item
            key={file.path}
            id={file.path}
            title={file.name}
            subtitle={displayDirectory(file.path)}
            icon={{ fileIcon: file.path }}
            detail={<FileDetail file={file} />}
            actions={actionsFor(file)}
          />
        ))}
      </List.Section>
      <List.EmptyView title="No Results" description={query ? "No files or folders match this search in your search scopes." : "Type to search files and folders on this Mac."} />
    </List>
  );
}
