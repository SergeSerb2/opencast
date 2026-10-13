import { useEffect, useMemo, useState } from "react";
import type { AppInfo, ClipboardItem, ImageLike } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { useBackend } from "../../../bridge/hooks";
import type { RefetchRule } from "../../../bridge/refetch";
import { native } from "../../../bridge/native";
import { useSetting } from "../../../bridge/settings";
import { Action, ActionPanel, confirmAlert, List, showFailureToast, showHUD, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { hideLauncher } from "../../launch";
import { faviconUrl } from "../library/favicon";
import { saveTextFile } from "../library/files";
import { glyphTile } from "../library/icons";
import { pasteIcon, pasteTitle, usePasteTarget } from "../library/usePasteTarget";
import type { LauncherViewProps } from "../registry";
import { QuicklinkFormView } from "../quicklinks/QuicklinkFormView";
import { SnippetFormView } from "../snippets/SnippetFormView";
import { ClipboardDetail } from "./ClipboardDetail";
import { clipboardSections, entriesSince, entryPath, entryText, formattedJson, isMailto, isTextLike, RECENT_RANGES, suggestedFileName, suggestedSnippetName, TYPE_FILTERS, type TypeFilter } from "./clipboard-model";
import { colorFormats, parseHexColor } from "./color-formats";
import "./clipboard-history.css";

const PAGE = 100;
const REFETCH: RefetchRule[] = [{ topic: "clipboard.changed" }, { topic: "clipboard.itemsChanged" }];

export interface ClipboardHistoryProps {
  /** Opened by "Paste Sequentially": the primary action queues entries from the selection on. */
  sequential?: boolean;
  query?: string;
}

/** Clipboard History: entries by recency with a type filter, rich preview, and Raycast's action set. */
export function ClipboardHistoryView({ props, title, icon }: LauncherViewProps<ClipboardHistoryProps>) {
  const [text, setText] = useState(props.query ?? "");
  const [query, setQuery] = useState(text);
  const [kind, setKind] = useState<TypeFilter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const primary = useSetting("clipboard.primaryAction");
  const faviconProvider = useSetting("advanced.faviconProvider");
  const target = usePasteTarget();
  const navigation = useNavigation();
  const sequential = Boolean(props.sequential);

  // Server-side search: debounce like Raycast's throttled search bar.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 150);
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => setLimit(PAGE), [query, kind]);
  useEffect(() => {
    native
      .call("apps.list", {})
      .then((list) => setApps([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setApps([]));
  }, []);

  const { data, isLoading } = useBackend("clipboard.list", { query, kind, limit }, undefined, { refetchOn: REFETCH, onError: (error) => showFailureToast("Failed to load clipboard history", error) });
  const items = useMemo(() => data?.items ?? [], [data]);
  const sections = useMemo(() => clipboardSections(items), [items]);
  const ordered = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  const rowIcon = (item: ClipboardItem): ImageLike => {
    switch (item.kind) {
      case "image":
        return item.imagePath ? { source: item.imagePath, fallback: "image-16" } : glyphTile("image-16");
      case "file":
        return item.filePaths?.[0] ? { fileIcon: item.filePaths[0] } : glyphTile("blank-document-16");
      case "link": {
        if (isMailto(item)) return glyphTile("at-symbol-16");
        const favicon = item.url ? faviconUrl(item.url, faviconProvider) : null;
        return favicon ? { source: favicon, fallback: "link-16" } : glyphTile("link-16");
      }
      case "color":
        return { source: "circle-filled-16", tintColor: item.color };
      default:
        return glyphTile("blank-document-16");
    }
  };

  const run = async (label: string, operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (error) {
      showFailureToast(label, error);
    }
  };
  const paste = (item: ClipboardItem, plainText = false) => run(plainText ? "Failed to paste as plain text" : "Failed to paste entry", () => backend.call("clipboard.paste", { id: item.id, plainText }));
  const copy = (item: ClipboardItem, keepOpen = false) =>
    run("Failed to copy entry", async () => {
      await backend.call("clipboard.copy", { id: item.id });
      if (keepOpen) showToast({ title: "Copied to Clipboard" });
      else await showHUD("Copied to Clipboard");
    });
  const copyText = (value: string, hud: string) =>
    run("Failed to copy", async () => {
      await native.call("clipboard.write", { content: { kind: "text", text: value } });
      await showHUD(hud);
    });

  const pasteSequence = (item: ClipboardItem) =>
    run("Failed to start paste sequence", async () => {
      const from = ordered.findIndex((i) => i.id === item.id);
      const ids = ordered.slice(Math.max(0, from), from + 1000).map((i) => i.id);
      await backend.call("clipboard.pasteSequentially", { ids });
      await showHUD(`Press ⌘V to paste ${ids.length === 1 ? "the entry" : `${ids.length} entries in order`}`);
    });

  const togglePin = (item: ClipboardItem) =>
    run("Failed to pin entry", async () => {
      await backend.call("clipboard.pin", { id: item.id, pinned: !item.pinned });
      showToast({ title: item.pinned ? "Unpinned entry" : "Pinned entry" });
    });

  const remove = (item: ClipboardItem) =>
    run("Failed to delete entry", async () => {
      await backend.call("clipboard.delete", { id: item.id });
      showToast({ title: "Deleted entry" });
    });

  /** Entries of the current type filter, beyond the loaded page. */
  const allOfKind = async () => (await backend.call("clipboard.list", { kind, limit: 1000 })).items;

  const removeRecent = (minutes: number, label: string) =>
    run("Failed to delete entries", async () => {
      const targets = entriesSince(await allOfKind(), minutes);
      for (const entry of targets) await backend.call("clipboard.delete", { id: entry.id });
      showToast({ title: targets.length ? "Deleted recent entries" : "No entries to delete", message: label });
    });

  const removeAll = async () => {
    const filter = TYPE_FILTERS.find((f) => f.value === kind);
    const confirmed = await confirmAlert({
      title: "Delete All Entries",
      message: kind === "all" ? "Every clipboard entry except pinned ones will be deleted. This can’t be undone." : `Every ${filter?.title.replace(/ Only$/, "").toLowerCase()} entry except pinned ones will be deleted. This can’t be undone.`,
      icon: "trash-16",
      primaryAction: { title: "Delete All", style: "destructive" },
    });
    if (!confirmed) return;
    await run("Failed deleting all entries", async () => {
      if (kind === "all") await backend.call("clipboard.clear", { includePinned: false });
      else for (const entry of (await allOfKind()).filter((i) => !i.pinned)) await backend.call("clipboard.delete", { id: entry.id });
      showToast({ title: "Deleted all entries" });
    });
  };

  const saveAsFile = (item: ClipboardItem) =>
    run("Failed to save file", async () => {
      const saved = await saveTextFile({ title: "Save as File", fileName: suggestedFileName(entryText(item)), text: entryText(item) });
      if (!saved) return;
      showToast({ title: "Saved file", primaryAction: saved === "downloaded" ? undefined : { title: "Show in Finder", shortcut: sc("cmd", "shift", "o"), onAction: () => native.call("open.showInFinder", { path: saved }) } });
    });

  const actionsFor = (item: ClipboardItem) => {
    const path = entryPath(item);
    const textLike = isTextLike(item);
    const json = item.kind === "text" && item.text ? formattedJson(item.text) : null;
    const color = item.kind === "color" && item.color ? parseHexColor(item.color) : null;
    const pasteAction = <Action key="paste" title={pasteTitle(target)} icon={pasteIcon(target)} onAction={() => paste(item)} />;
    const copyAction = <Action key="copy" title="Copy to Clipboard" icon="copy-clipboard-16" shortcut={primary === "copy" ? sc("cmd", "shift", "c") : undefined} onAction={() => copy(item)} />;
    return (
      <ActionPanel title={item.title}>
        <ActionPanel.Section>
          {sequential && <Action title="Paste Sequentially from Here" icon="clipboard-16" onAction={() => pasteSequence(item)} />}
          {primary === "copy" ? [copyAction, pasteAction] : [pasteAction, copyAction]}
          {primary === "copy" && <Action title="Copy and Keep Window Open" icon="copy-clipboard-16" shortcut={sc("opt", "return")} onAction={() => copy(item, true)} />}
          {textLike && <Action title={pasteTitle(target, "Paste as Plain Text")} icon={pasteIcon(target)} shortcut={sc("cmd", "ctrl", "return")} onAction={() => paste(item, true)} />}
        </ActionPanel.Section>
        <ActionPanel.Section>
          {color && (
            <ActionPanel.Submenu title="Copy Color as…" icon="copy-clipboard-16" shortcut={sc("cmd", "opt", "c")} placeholder="Search formats…">
              {colorFormats(color).map((format) => (
                <Action key={format.title} title={format.title} keywords={[format.value]} onAction={() => copyText(format.value, `Copied ${format.title} to Clipboard`)} />
              ))}
            </ActionPanel.Submenu>
          )}
          {item.kind === "link" && item.url && !isMailto(item) && <Action.OpenInBrowser url={item.url} shortcut={sc("cmd", "o")} />}
          {json && <Action title="Copy Formatted JSON" icon="copy-clipboard-16" onAction={() => copyText(json, "Copied Formatted JSON")} />}
          {path && (
            <ActionPanel.Submenu title="Open With…" icon="upload-16" shortcut={sc("cmd", "o")} placeholder="Search applications…">
              {apps.map((app) => (
                <Action key={app.path} title={app.name} icon={{ fileIcon: app.path }} onAction={() => run("Failed to open", async () => {
                  await native.call("open.path", { path, app: app.bundleId ?? app.path });
                  hideLauncher();
                })} />
              ))}
            </ActionPanel.Submenu>
          )}
          {path && <Action.ShowInFinder path={path} shortcut={sc("cmd", "shift", "o")} />}
          {path && <Action title="Quick Look" icon="eye-16" shortcut={sc("cmd", "y")} onAction={() => run("Quick Look failed", () => native.call("open.quickLook", { path }))} />}
          <Action title={item.pinned ? "Unpin Entry" : "Pin Entry"} icon={item.pinned ? "tack-disabled-16" : "tack-16"} shortcut={sc("cmd", ".")} onAction={() => togglePin(item)} />
        </ActionPanel.Section>
        <ActionPanel.Section>
          {textLike && <Action title="Save as Snippet" icon="snippets-16" shortcut={sc("cmd", "s")} onAction={() => navigation.push(<SnippetFormView initial={{ name: suggestedSnippetName(entryText(item)), text: entryText(item) }} />)} />}
          {(item.kind === "link" || item.kind === "file") && (
            <Action
              title="Save as Quicklink"
              icon="link-16"
              shortcut={sc("cmd", "shift", "s")}
              onAction={() => navigation.push(<QuicklinkFormView initial={{ name: item.kind === "file" ? item.title : hostName(item.url) ?? item.title, link: item.kind === "file" ? (path ?? item.title) : (item.url ?? item.title) }} />)}
            />
          )}
          {textLike && <Action title="Save as File…" icon="save-document-16" shortcut={sc("cmd", "opt", "shift", "s")} onAction={() => saveAsFile(item)} />}
          {item.kind === "image" && item.ocrText?.trim() && <Action title="Copy Text from Image" icon="copy-clipboard-16" shortcut={sc("cmd", "opt", "c")} onAction={() => copyText(item.ocrText!, "Text Copied to Clipboard")} />}
        </ActionPanel.Section>
        <ActionPanel.Section>
          <Action title="Delete Entry" icon="trash-16" style="destructive" shortcut={sc("ctrl", "x")} onAction={() => remove(item)} />
          <ActionPanel.Submenu title="Delete Recent Entries…" icon="clock-16" shortcut={sc("cmd", "shift", "x")}>
            {RECENT_RANGES.map((range) => (
              <Action key={range.minutes} title={range.title} icon="clock-16" style="destructive" onAction={() => removeRecent(range.minutes, range.title)} />
            ))}
          </ActionPanel.Submenu>
          <Action title="Delete All Entries" icon="trash-16" style="destructive" shortcut={sc("ctrl", "shift", "x")} onAction={removeAll} />
        </ActionPanel.Section>
      </ActionPanel>
    );
  };

  return (
    <List
      searchText={text}
      onSearchTextChange={setText}
      filtering={false}
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Type to filter entries…"
      navigationTitle={title ?? (sequential ? "Paste Sequentially" : "Clipboard History")}
      navigationIcon={icon}
      pagination={{ hasMore: (data?.total ?? 0) > items.length, onLoadMore: () => setLimit((l) => l + PAGE), pageSize: PAGE }}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by Type" id="clipboard-category" storeValue onChange={(value) => setKind(value as TypeFilter)}>
          <List.Dropdown.Section>
            <List.Dropdown.Item title={TYPE_FILTERS[0].title} value={TYPE_FILTERS[0].value} icon={TYPE_FILTERS[0].icon} />
          </List.Dropdown.Section>
          <List.Dropdown.Section>
            {TYPE_FILTERS.slice(1).map((filter) => (
              <List.Dropdown.Item key={filter.value} title={filter.title} value={filter.value} icon={filter.icon} keywords={filter.keywords} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {sections.map((section) => (
        <List.Section key={section.title} id={section.title} title={section.title}>
          {section.items.map((item) => (
            <List.Item key={item.id} id={item.id} title={item.title} icon={rowIcon(item)} detail={<ClipboardDetail item={item} />} actions={actionsFor(item)} />
          ))}
        </List.Section>
      ))}
      <List.EmptyView
        title="No Results"
        description={!query && kind === "all" ? "Anything you copy will show up here, ready to paste again." : undefined}
      />
    </List>
  );
}

function hostName(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
