import { useMemo, useState } from "react";
import type { ImageLike, Snippet } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { getSetting } from "../../../bridge/settings";
import { Action, ActionPanel, confirmAlert, EmptyView, ItemDetail, List, Metadata, showFailureToast, showHUD, showToast, useNavigation, useRegisterActions, ViewFrame } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { ArgumentsForm } from "../library/ArgumentsForm";
import { exportFileName, saveTextFile } from "../library/files";
import { copyName, formatTimestamp, groupByDate } from "../library/format";
import { colorDot, glyphTile, tagColor } from "../library/icons";
import { pasteIcon, pasteTitle, usePasteTarget } from "../library/usePasteTarget";
import type { LauncherViewProps } from "../registry";
import { DEFAULT_SNIPPET_ICON, SnippetFormView } from "./SnippetFormView";
import "./snippets.css";

const ALL_TAGS = "all";

/** Keyword as Raycast shows it in the alias tag (visible spaces). */
const keywordLabel = (keyword: string) => keyword.replace(/ /g, "␣");
const lastUsed = (s: Snippet) => s.lastUsedAt ?? s.updatedAt;

/** Search Snippets: list with a resolved preview, tag filter, and the full snippet action set. */
export function SnippetsSearchView({ props, title, icon }: LauncherViewProps<{ query?: string }>) {
  const [query, setQuery] = useState(props.query ?? "");
  const [tag, setTag] = useState(ALL_TAGS);
  const { data: snippets, isLoading } = useBackend("snippets.list", {});
  const navigation = useNavigation();
  const target = usePasteTarget();
  const navTitle = title ?? "Search Snippets";

  const tags = useMemo(() => [...new Set((snippets ?? []).flatMap((s) => s.tags ?? []))].sort((a, b) => a.localeCompare(b)), [snippets]);
  // A remembered tag that no snippet uses any more falls back to all tags.
  const activeTag = tags.includes(tag) ? tag : ALL_TAGS;
  const visible = useMemo(() => (snippets ?? []).filter((s) => activeTag === ALL_TAGS || s.tags?.includes(activeTag)), [snippets, activeTag]);
  const sections = useMemo(() => {
    if (query.trim()) return [{ title: undefined, items: visible }];
    const pinned = visible.filter((s) => s.pinned);
    const rest = visible.filter((s) => !s.pinned).sort((a, b) => lastUsed(b) - lastUsed(a));
    return [...(pinned.length ? [{ title: "Pinned", items: pinned }] : []), ...groupByDate(rest, lastUsed)];
  }, [visible, query]);

  const create = (initial?: Parameters<typeof SnippetFormView>[0]["initial"]) => navigation.push(<SnippetFormView initial={initial} navigationIcon={icon} />);

  if (snippets && snippets.length === 0) return <EmptySnippets title={navTitle} icon={icon} onCreate={() => create()} />;

  const use = async (snippet: Snippet, mode: "paste" | "copy") => {
    try {
      const { arguments: args } = await backend.call("snippets.render", { text: snippet.text });
      const run = async (values?: Record<string, string>) => {
        if (mode === "paste") await backend.call("snippets.paste", { id: snippet.id, arguments: values });
        else {
          await backend.call("snippets.copy", { id: snippet.id, arguments: values });
          await showHUD("Copied to Clipboard");
        }
      };
      if (!args.length) return await run();
      navigation.push(<ArgumentsForm args={args} submitTitle={mode === "paste" ? pasteTitle(target, "Paste Snippet") : "Copy Snippet"} navigationTitle={snippet.name} navigationIcon={icon} onSubmit={run} />);
    } catch (error) {
      showFailureToast(mode === "paste" ? "Paste failed" : "Copy failed", error);
    }
  };

  const togglePin = async (snippet: Snippet) => {
    try {
      await backend.call("snippets.update", { id: snippet.id, patch: { pinned: !snippet.pinned } });
      showToast({ title: snippet.pinned ? "Unpinned snippet" : "Pinned snippet" });
    } catch (error) {
      showFailureToast("Failed to update snippet", error);
    }
  };

  const remove = async (snippet: Snippet) => {
    if (getSetting("snippets.deleteSnippetWarning")) {
      const confirmed = await confirmAlert({ title: "Delete Snippet?", message: `“${snippet.name}” will be deleted. This can’t be undone.`, icon: "trash-16", primaryAction: { title: "Delete", style: "destructive" } });
      if (!confirmed) return;
    }
    try {
      await backend.call("snippets.delete", { id: snippet.id });
      showToast({ title: "Deleted snippet" });
    } catch (error) {
      showFailureToast("Failed to delete snippet", error);
    }
  };

  const removeAll = async () => {
    const all = snippets ?? [];
    const confirmed = await confirmAlert({ title: "Delete All Snippets?", message: `All ${all.length} snippets will be deleted. This can’t be undone.`, icon: "trash-16", primaryAction: { title: "Delete All", style: "destructive" } });
    if (!confirmed) return;
    const toast = showToast({ style: "animated", title: "Deleting snippets…" });
    try {
      for (const snippet of all) await backend.call("snippets.delete", { id: snippet.id });
      toast.update({ style: "success", title: "Deleted all snippets" });
    } catch (error) {
      toast.update({ style: "failure", title: "Failed to delete snippets", message: errorMessage(error) });
    }
  };

  const exportOne = async (snippet: Snippet) => {
    try {
      const json = JSON.stringify([{ name: snippet.name, text: snippet.text, keyword: snippet.keyword || undefined, tags: snippet.tags?.length ? snippet.tags : undefined }], null, 2);
      const saved = await saveTextFile({ title: "Export Snippet", fileName: `${snippet.name.replace(/[/\\:]/g, "-")}.json`, text: json });
      if (saved) showToast({ title: "Exported snippet", message: saved === "downloaded" ? undefined : saved });
    } catch (error) {
      showFailureToast("Failed to export snippet", error);
    }
  };

  const actionsFor = (snippet: Snippet) => (
    <ActionPanel title={snippet.name}>
      <ActionPanel.Section>
        <Action title={pasteTitle(target)} icon={pasteIcon(target)} onAction={() => use(snippet, "paste")} />
        <Action title="Copy to Clipboard" icon="copy-clipboard-16" onAction={() => use(snippet, "copy")} />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action title={snippet.pinned ? "Unpin Snippet" : "Pin Snippet"} icon={snippet.pinned ? "tack-disabled-16" : "tack-16"} shortcut={sc("cmd", ".")} onAction={() => togglePin(snippet)} />
        <Action title="Edit Snippet" icon="pencil-16" shortcut={sc("cmd", "e")} onAction={() => navigation.push(<SnippetFormView snippet={snippet} navigationIcon={icon} />)} />
        <Action
          title="Duplicate Snippet"
          icon="duplicate-16"
          shortcut={sc("cmd", "d")}
          onAction={() => create({ ...snippet, name: copyName(snippet.name, (snippets ?? []).map((s) => s.name)), keyword: "" })}
        />
        <Action title="Create Snippet" icon="blank-document-16" shortcut={sc("cmd", "n")} onAction={() => create({ text: query.trim() || undefined, tags: activeTag === ALL_TAGS ? undefined : [activeTag] })} />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action title="Export Snippet…" icon="save-document-16" shortcut={sc("cmd", "opt", "shift", "s")} onAction={() => exportOne(snippet)} />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action title="Delete Snippet" icon="trash-16" style="destructive" shortcut={sc("ctrl", "x")} onAction={() => remove(snippet)} />
        <Action title="Delete All Snippets" icon="trash-16" style="destructive" shortcut={sc("ctrl", "shift", "x")} onAction={removeAll} />
      </ActionPanel.Section>
    </ActionPanel>
  );

  return (
    <List
      searchText={query}
      onSearchTextChange={setQuery}
      filtering={{ keepSectionOrder: true }}
      isLoading={isLoading}
      isShowingDetail
      keepAccessoriesInDetail
      searchBarPlaceholder="Search snippets…"
      navigationTitle={navTitle}
      navigationIcon={icon}
      searchBarAccessory={
        tags.length > 0 ? (
          <List.Dropdown tooltip="Filter by Tag" id="snippets-tag" storeValue onChange={setTag}>
            <List.Dropdown.Section>
              <List.Dropdown.Item title="All Tags" value={ALL_TAGS} icon="tag-16" />
            </List.Dropdown.Section>
            <List.Dropdown.Section>
              {tags.map((t) => (
                <List.Dropdown.Item key={t} title={t} value={t} icon={colorDot(tagColor(t))} />
              ))}
            </List.Dropdown.Section>
          </List.Dropdown>
        ) : undefined
      }
      actions={
        <ActionPanel>
          <Action title="Create Snippet" icon="blank-document-16" shortcut={sc("cmd", "n")} onAction={() => create({ text: query.trim() || undefined })} />
        </ActionPanel>
      }
    >
      {sections.map((section) => (
        <List.Section key={section.title ?? "results"} id={section.title ?? "results"} title={section.title}>
          {section.items.map((snippet) => (
            <List.Item
              key={snippet.id}
              id={snippet.id}
              title={snippet.name}
              icon={glyphTile(snippet.icon || DEFAULT_SNIPPET_ICON)}
              keywords={[snippet.keyword ?? "", snippet.text, ...(snippet.tags ?? [])]}
              accessories={snippet.keyword ? [{ alias: keywordLabel(snippet.keyword) }] : undefined}
              detail={<SnippetDetail snippet={snippet} />}
              actions={actionsFor(snippet)}
            />
          ))}
        </List.Section>
      ))}
      <List.EmptyView title="No Snippets Found" description={query ? "Try a different search or tag." : undefined} />
    </List>
  );
}

function SnippetDetail({ snippet }: { snippet: Snippet }) {
  const { data: rendered } = useBackend("snippets.render", { text: snippet.text }, [snippet.id, snippet.text]);
  return (
    <ItemDetail
      preview={<pre className="sc-snippet-preview">{rendered?.text ?? snippet.text}</pre>}
      metadata={
        <Metadata>
          <Metadata.Label title="Name" text={snippet.name} />
          {snippet.tags?.length ? (
            <Metadata.TagList title="Tags">
              {snippet.tags.slice(0, 3).map((t) => (
                <Metadata.TagList.Item key={t} text={t} color={tagColor(t)} />
              ))}
              {snippet.tags.length > 3 && <Metadata.TagList.Item text={`+${snippet.tags.length - 3}`} />}
            </Metadata.TagList>
          ) : null}
          <Metadata.Label title="Content Type" text="Text" />
          {snippet.copyCount ? <Metadata.Label title="Times Copied" text={snippet.copyCount.toLocaleString()} /> : null}
          {snippet.lastUsedAt ? <Metadata.Label title="Last Copied" text={formatTimestamp(snippet.lastUsedAt)} /> : null}
          <Metadata.Label title="Modified" text={formatTimestamp(snippet.updatedAt)} />
          <Metadata.Label title="Created" text={formatTimestamp(snippet.createdAt)} />
        </Metadata>
      }
    />
  );
}

/** Nothing saved yet: Raycast hides the search field and offers to create the first snippet. */
function EmptySnippets({ title, icon, onCreate }: { title: string; icon?: ImageLike; onCreate: () => void }) {
  return (
    <ViewFrame navigationTitle={title} navigationIcon={icon}>
      <EmptySnippetsBody onCreate={onCreate} />
    </ViewFrame>
  );
}

function EmptySnippetsBody({ onCreate }: { onCreate: () => void }) {
  useRegisterActions(
    <ActionPanel>
      <Action title="Create Snippet" icon="blank-document-16" shortcut={sc("cmd", "n")} onAction={onCreate} />
    </ActionPanel>,
  );
  return <EmptyView title="No Snippets Found" description={"Keep the text you type most often one keystroke away.\nCreate your first snippet to get started."} action={{ title: "Create Snippet", onAction: onCreate }} />;
}
