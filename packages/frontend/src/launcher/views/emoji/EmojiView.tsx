import { useEffect, useMemo, useState } from "react";
import type { EmojiItem } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { useBackend } from "../../../bridge/hooks";
import { native } from "../../../bridge/native";
import { setSetting, useSetting } from "../../../bridge/settings";
import { Action, ActionPanel, Grid, showFailureToast, showHUD, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { pasteIcon, pasteTitle, usePasteTarget } from "../library/usePasteTarget";
import type { LauncherViewProps } from "../registry";
import { SnippetFormView } from "../snippets/SnippetFormView";
import { ALL_CATEGORIES, DEFAULT_COLUMNS, EMOJI_CATEGORIES, FREQUENTLY_USED, MAX_COLUMNS, MIN_COLUMNS, SKIN_TONES, skinToneVariant, titleCase, unicodeCodePoints, visibleSections } from "./emoji-model";

const SEARCH_TITLE = "Search Emoji & Symbols";

/** Search Emoji & Symbols: an emoji grid with category filter, frequently used, skin tones and zoom. */
export function EmojiView({ props, title, icon }: LauncherViewProps<{ query?: string }>) {
  const [query, setQuery] = useState(props.query ?? "");
  const [filter, setFilter] = useState(ALL_CATEGORIES);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const columns = useSetting("emoji.columns") || DEFAULT_COLUMNS;
  const primary = useSetting("emoji.primaryAction");
  const target = usePasteTarget();
  const navigation = useNavigation();
  const category = filter === ALL_CATEGORIES || filter === FREQUENTLY_USED ? undefined : filter;
  const { data, isLoading, refetch } = useBackend("emoji.search", { query, category }, undefined, { onError: (error) => showFailureToast("Failed to load emoji", error) });
  const sections = useMemo(() => visibleSections(data?.sections ?? [], { query, filter, columns }), [data, query, filter, columns]);
  const byKey = useMemo(() => new Map<string, EmojiItem>(sections.flatMap((s) => s.items.map((item, i): [string, EmojiItem] => [`${s.title}/${i}`, item]))), [sections]);
  // The grid selects the first cell for a new query or filter without reporting it.
  useEffect(() => setSelectedKey(null), [query, filter]);
  const selected = (selectedKey ? byKey.get(selectedKey) : undefined) ?? sections[0]?.items[0] ?? null;

  const recordUse = (emoji: string) => void backend.call("emoji.recordUse", { emoji }).then(refetch).catch((error) => showFailureToast("Failed to remember emoji", error));
  const paste = async (emoji: string) => {
    try {
      await native.call("input.paste", { content: { kind: "text", text: emoji } });
      recordUse(emoji);
    } catch (error) {
      showFailureToast("Failed to paste", error);
    }
  };
  const copy = async (text: string, options: { keepOpen?: boolean; record?: string } = {}) => {
    try {
      await native.call("clipboard.write", { content: { kind: "text", text } });
      if (options.record) recordUse(options.record);
      if (options.keepOpen) showToast({ title: "Copied to Clipboard" });
      else await showHUD("Copied to Clipboard");
    } catch (error) {
      showFailureToast("Failed to copy", error);
    }
  };
  const zoom = (next: number) => void setSetting("emoji.columns", Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, next))).catch((error) => showFailureToast("Failed to change zoom", error));

  const actionsFor = (item: EmojiItem, section: { title: string; items: EmojiItem[] }) => {
    const pasteAction = <Action key="paste" title={pasteTitle(target)} icon={pasteIcon(target)} onAction={() => paste(item.emoji)} />;
    const copyAction = <Action key="copy" title="Copy to Clipboard" icon="copy-clipboard-16" shortcut={primary === "copy" ? sc("cmd", "shift", "c") : undefined} onAction={() => copy(item.emoji, { record: item.emoji })} />;
    const tones = item.skins?.length ? SKIN_TONES.map((tone, index) => ({ tone, index, emoji: skinToneVariant(item, index) })) : [];
    return (
      <ActionPanel title={titleCase(item.name)}>
        <ActionPanel.Section>
          {primary === "copy" ? [copyAction, pasteAction] : [pasteAction, copyAction]}
          {primary === "copy" && <Action title="Copy and Keep Window Open" icon="copy-clipboard-16" shortcut={sc("opt", "return")} onAction={() => copy(item.emoji, { keepOpen: true, record: item.emoji })} />}
        </ActionPanel.Section>
        {tones.length > 0 && (
          <ActionPanel.Section>
            <ActionPanel.Submenu title="Paste with Skin Tone…" icon="copy-clipboard-16" shortcut={sc("cmd", "opt", "v")}>
              {tones.map(({ tone, emoji }) => (
                <Action key={tone} title={tone} icon={emoji} onAction={() => paste(emoji)} />
              ))}
            </ActionPanel.Submenu>
            <ActionPanel.Submenu title="Copy with Skin Tone…" icon="copy-clipboard-16" shortcut={sc("cmd", "opt", "c")}>
              {tones.map(({ tone, emoji }) => (
                <Action key={tone} title={tone} icon={emoji} onAction={() => copy(emoji, { record: emoji })} />
              ))}
            </ActionPanel.Submenu>
          </ActionPanel.Section>
        )}
        <ActionPanel.Section>
          <Action title="Copy Unicode" icon="copy-clipboard-16" shortcut={sc("cmd", "opt", "shift", "c")} onAction={() => copy(unicodeCodePoints(item.emoji))} />
          <Action title="Copy All Emojis from Section" icon="copy-clipboard-16" shortcut={sc("cmd", "ctrl", "c")} onAction={() => copy(section.items.map((e) => e.emoji).join(" "))} />
          <Action title="Save as Snippet" icon="snippets-16" shortcut={sc("cmd", "s")} onAction={() => navigation.push(<SnippetFormView initial={{ name: titleCase(item.name), text: item.emoji }} />)} />
        </ActionPanel.Section>
        <ActionPanel.Section>
          <Action title="Actual Size" icon="magnifying-glass-16" shortcut={sc("cmd", "0")} onAction={() => zoom(DEFAULT_COLUMNS)} />
          <Action title="Zoom In" icon="plus-circle-16" shortcut={sc("cmd", "=")} disabled={columns <= MIN_COLUMNS} onAction={() => zoom(columns - 1)} />
          <Action title="Zoom Out" icon="minus-circle-16" shortcut={sc("cmd", "-")} disabled={columns >= MAX_COLUMNS} onAction={() => zoom(columns + 1)} />
        </ActionPanel.Section>
      </ActionPanel>
    );
  };

  return (
    <Grid
      columns={columns}
      searchText={query}
      onSearchTextChange={setQuery}
      filtering={false}
      isLoading={isLoading}
      searchBarPlaceholder={`${SEARCH_TITLE}…`}
      navigationTitle={selected ? `${title ?? SEARCH_TITLE} – ${titleCase(selected.name)}` : (title ?? SEARCH_TITLE)}
      navigationIcon={icon}
      onSelectionChange={setSelectedKey}
      searchBarAccessory={
        <Grid.Dropdown tooltip="Filter by Category" id="emoji-category" storeValue onChange={setFilter}>
          <Grid.Dropdown.Section>
            <Grid.Dropdown.Item title="All Categories" value={ALL_CATEGORIES} icon="app-window-grid-3x3-16" />
          </Grid.Dropdown.Section>
          <Grid.Dropdown.Section>
            <Grid.Dropdown.Item title={FREQUENTLY_USED} value={FREQUENTLY_USED} icon="clock-16" />
            {EMOJI_CATEGORIES.map((c) => (
              <Grid.Dropdown.Item key={c.title} title={c.title} value={c.title} icon={c.icon} />
            ))}
          </Grid.Dropdown.Section>
        </Grid.Dropdown>
      }
    >
      {sections.map((section) => (
        <Grid.Section key={section.title} id={section.title} title={section.title} subtitle={section.items.length.toLocaleString()}>
          {section.items.map((item, index) => (
            <Grid.Item key={`${section.title}/${index}`} id={`${section.title}/${index}`} content={{ value: item.emoji, tooltip: titleCase(item.name) }} actions={actionsFor(item, section)} />
          ))}
        </Grid.Section>
      ))}
      <Grid.EmptyView title="No Emojis Found" description={query ? "Try another word, or browse a category." : undefined} />
    </Grid>
  );
}
