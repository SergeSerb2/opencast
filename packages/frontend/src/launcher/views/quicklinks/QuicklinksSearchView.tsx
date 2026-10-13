import { useEffect, useMemo, useState } from "react";
import type { AppInfo, ImageLike, Quicklink } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { native } from "../../../bridge/native";
import { getSetting, useSetting } from "../../../bridge/settings";
import { Action, ActionPanel, confirmAlert, ItemDetail, List, Metadata, showFailureToast, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { hideLauncher } from "../../launch";
import { ArgumentsForm } from "../library/ArgumentsForm";
import { copyName, formatTimestamp } from "../library/format";
import { colorDot, tagColor } from "../library/icons";
import type { LauncherViewProps } from "../registry";
import { tokenizeTemplate } from "../snippets/placeholders";
import { QuicklinkFormView } from "./QuicklinkFormView";
import { isPathLink, openedLabel, quicklinkIcon } from "./quicklink-model";
import "./quicklinks.css";

const ALL_TAGS = "all";

/** Search Quicklinks: list with link preview, tag filter, open / open with, edit, duplicate, copy and delete. */
export function QuicklinksSearchView({ props, title, icon }: LauncherViewProps<{ query?: string }>) {
  const [query, setQuery] = useState(props.query ?? "");
  const [tag, setTag] = useState(ALL_TAGS);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const { data: quicklinks, isLoading } = useBackend("quicklinks.list", {}, undefined, { onError: (error) => showFailureToast("Failed to load quicklinks", error) });
  const faviconProvider = useSetting("advanced.faviconProvider");
  const navigation = useNavigation();
  const navTitle = title ?? "Search Quicklinks";

  useEffect(() => {
    native
      .call("apps.list", {})
      .then((list) => setApps([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setApps([]));
  }, []);

  const tags = useMemo(() => [...new Set((quicklinks ?? []).flatMap((q) => q.tags ?? []))].sort((a, b) => a.localeCompare(b)), [quicklinks]);
  const activeTag = tags.includes(tag) ? tag : ALL_TAGS;
  const visible = useMemo(() => (quicklinks ?? []).filter((q) => activeTag === ALL_TAGS || q.tags?.includes(activeTag)).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.name.localeCompare(b.name)), [quicklinks, activeTag]);
  const appName = (id?: string) => (id ? (apps.find((a) => a.bundleId === id || a.path === id)?.name ?? id) : undefined);

  const create = (initial?: Parameters<typeof QuicklinkFormView>[0]["initial"], mode: "create" | "duplicate" = "create") => navigation.push(<QuicklinkFormView initial={initial} mode={mode} navigationIcon={icon} />);

  /** Resolve placeholders (asking for arguments first) and open, optionally with another app. */
  const open = async (quicklink: Quicklink, app?: string) => {
    try {
      const { arguments: args } = await backend.call("quicklinks.resolve", { link: quicklink.link });
      const run = async (values?: Record<string, string>) => {
        if (!app) {
          await backend.call("quicklinks.open", { id: quicklink.id, arguments: values });
        } else {
          const { url } = await backend.call("quicklinks.resolve", { link: quicklink.link, arguments: values });
          if (isPathLink(url)) await native.call("open.path", { path: url.replace(/^file:\/\//i, ""), app });
          else await native.call("open.url", { url, app });
        }
        hideLauncher();
      };
      if (!args.length) return await run();
      navigation.push(<ArgumentsForm args={args} submitTitle="Open Quicklink" navigationTitle={quicklink.name} navigationIcon={icon} onSubmit={run} />);
    } catch (error) {
      showFailureToast("Failed to open quicklink", error);
    }
  };

  const remove = async (quicklink: Quicklink) => {
    if (getSetting("quicklinks.deleteQuicklinkWarning")) {
      const confirmed = await confirmAlert({ title: `Delete “${quicklink.name}”?`, message: "This can’t be undone.", icon: "trash-16", primaryAction: { title: "Delete", style: "destructive" } });
      if (!confirmed) return;
    }
    try {
      await backend.call("quicklinks.delete", { id: quicklink.id });
      showToast({ title: "Quicklink deleted" });
    } catch (error) {
      showFailureToast("Failed to delete quicklink", error);
    }
  };

  const removeAll = async () => {
    const all = quicklinks ?? [];
    const confirmed = await confirmAlert({ title: "Delete All Quicklinks?", message: `All ${all.length} quicklinks will be deleted. This can’t be undone.`, icon: "trash-16", primaryAction: { title: "Delete All", style: "destructive" } });
    if (!confirmed) return;
    const toast = showToast({ style: "animated", title: "Deleting quicklinks…" });
    try {
      for (const quicklink of all) await backend.call("quicklinks.delete", { id: quicklink.id });
      toast.update({ style: "success", title: "All quicklinks deleted" });
    } catch (error) {
      toast.update({ style: "failure", title: "Failed to delete quicklinks", message: errorMessage(error) });
    }
  };

  const actionsFor = (quicklink: Quicklink, rowIcon: ImageLike) => {
    const isPath = isPathLink(quicklink.link);
    return (
      <ActionPanel title={quicklink.name}>
        <ActionPanel.Section>
          <Action title="Open Quicklink" icon={rowIcon} onAction={() => open(quicklink)} />
          {isPath && <Action title="Show in Finder" icon="finder-16" onAction={() => native.call("open.showInFinder", { path: quicklink.link }).then(hideLauncher)} />}
          <ActionPanel.Submenu title="Open With…" icon="upload-16" shortcut={sc("cmd", "shift", "o")} placeholder="Search applications…">
            {apps.map((app) => (
              <Action key={app.path} title={app.name} icon={{ fileIcon: app.path }} onAction={() => open(quicklink, app.bundleId ?? app.path)} />
            ))}
          </ActionPanel.Submenu>
          <Action title="Edit Quicklink" icon="pencil-16" shortcut={sc("cmd", "e")} onAction={() => navigation.push(<QuicklinkFormView quicklink={quicklink} navigationIcon={icon} />)} />
          <Action title="Duplicate Quicklink" icon="duplicate-16" shortcut={sc("cmd", "d")} onAction={() => create({ ...quicklink, name: copyName(quicklink.name, (quicklinks ?? []).map((q) => q.name)) }, "duplicate")} />
        </ActionPanel.Section>
        <ActionPanel.Section>
          <Action title={quicklink.pinned ? "Unpin Quicklink" : "Pin Quicklink"} icon={quicklink.pinned ? "tack-disabled-16" : "tack-16"} shortcut={sc("cmd", "shift", "p")} onAction={async () => {
            try {
              await backend.call("quicklinks.update", { id: quicklink.id, patch: { pinned: !quicklink.pinned } });
              showToast({ style: "success", title: quicklink.pinned ? "Unpinned quicklink" : "Pinned quicklink" });
            } catch (error) {
              showFailureToast("Failed to update quicklink", error);
            }
          }} />
          <Action.CopyToClipboard title="Copy Name" content={quicklink.name} shortcut={sc("cmd", "opt", "c")} />
          <Action.CopyToClipboard title="Copy Link" content={quicklink.link} shortcut={sc("cmd", "ctrl", "c")} />
        </ActionPanel.Section>
        <ActionPanel.Section>
          <Action title="Create Quicklink" icon="plus-16" shortcut={sc("cmd", "n")} onAction={() => create()} />
        </ActionPanel.Section>
        <ActionPanel.Section>
          <Action title="Delete Quicklink" icon="trash-16" style="destructive" shortcut={sc("ctrl", "x")} onAction={() => remove(quicklink)} />
          <Action title="Delete All Quicklinks" icon="trash-16" style="destructive" shortcut={sc("ctrl", "shift", "x")} onAction={removeAll} />
        </ActionPanel.Section>
      </ActionPanel>
    );
  };

  const empty = quicklinks !== undefined && quicklinks.length === 0;
  return (
    <List
      searchText={query}
      onSearchTextChange={setQuery}
      filtering
      isLoading={isLoading}
      isShowingDetail={!empty}
      keepAccessoriesInDetail
      searchBarPlaceholder="Search for Quicklinks…"
      navigationTitle={navTitle}
      navigationIcon={icon}
      searchBarAccessory={
        tags.length > 0 ? (
          <List.Dropdown tooltip="Filter by Tag" id="quicklinks-tag" storeValue onChange={setTag}>
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
          <Action title="Create Quicklink" icon="plus-16" shortcut={sc("cmd", "n")} onAction={() => create()} />
        </ActionPanel>
      }
    >
      <List.Section title="Quicklinks">
        {visible.map((quicklink) => {
          const rowIcon = quicklinkIcon(quicklink, faviconProvider, apps);
          return (
            <List.Item
              key={quicklink.id}
              id={quicklink.id}
              title={quicklink.name}
              icon={rowIcon}
              keywords={[quicklink.link, ...(quicklink.tags ?? [])]}
              accessories={quicklink.pinned ? [{ icon: "tack-16", tooltip: "Pinned" }] : undefined}
              detail={<QuicklinkDetail quicklink={quicklink} application={appName(quicklink.openWith)} />}
              actions={actionsFor(quicklink, rowIcon)}
            />
          );
        })}
      </List.Section>
      <List.EmptyView
        title="No Quicklinks Found"
        description={empty ? "Save the links you open most and reach them in a keystroke." : undefined}
        icon={empty ? "link-16" : undefined}
      />
    </List>
  );
}

function QuicklinkDetail({ quicklink, application }: { quicklink: Quicklink; application?: string }) {
  return (
    <ItemDetail
      preview={
        <p className="sc-quicklink-preview">
          {tokenizeTemplate(quicklink.link).map((token, i) =>
            token.kind === "placeholder" ? (
              <span key={i} className="sc-quicklink-preview__chip">
                {token.text}
              </span>
            ) : (
              <span key={i}>{token.text}</span>
            ),
          )}
        </p>
      }
      metadata={
        <Metadata>
          <Metadata.Label title="Name" text={quicklink.name} />
          <Metadata.Label title="Link" text={quicklink.link} />
          {application && <Metadata.Label title="Application" text={application} />}
          {quicklink.tags?.length ? (
            <Metadata.TagList title="Tags">
              {quicklink.tags.map((t) => (
                <Metadata.TagList.Item key={t} text={t} color={tagColor(t)} />
              ))}
            </Metadata.TagList>
          ) : null}
          <Metadata.Label title="Created" text={formatTimestamp(quicklink.createdAt)} />
          <Metadata.Label title="Last Updated" text={formatTimestamp(quicklink.updatedAt)} />
          <Metadata.Label title="Opened" text={openedLabel(quicklink.openCount)} />
        </Metadata>
      }
    />
  );
}
