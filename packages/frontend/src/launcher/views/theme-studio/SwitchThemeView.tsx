import { useMemo, useState } from "react";
import type { ImageLike, Theme } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { useBackend } from "../../../bridge/hooks";
import { useSettings } from "../../../bridge/settings";
import { Action, ActionPanel, confirmAlert, List, showFailureToast, showToast, useNavigation, type ListAccessory } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { ThemeScope, useTheme } from "../../../theme/ThemeProvider";
import { defaultPalette, type Palette } from "../../../theme/palettes";
import { applyThemeSettings, themeSettingsUpdate } from "./apply-theme";
import { copyWithToast, readClipboardText } from "./clipboard";
import { useLiveThemePreview } from "./live-preview";
import { appearanceLabel, buildThemeCatalog, catalogSections, currentMark, filterCatalog, themeInUse, themeSwatchIcon, type AppearanceFilter, type CatalogTheme, type CurrentMark } from "./theme-catalog";
import { copyName, draftFromPalette, draftToUpsert, parseThemeJson, themeToJson, type ThemeDraft } from "./theme-draft";
import { ThemeEditorView } from "./ThemeEditorView";

export interface SwitchThemeViewProps {
  navigationTitle?: string;
  navigationIcon?: ImageLike;
}

const FILTERS: { value: AppearanceFilter; title: string; icon: string }[] = [
  { value: "all", title: "All", icon: "bullet-points-16" },
  { value: "dark", title: "Dark", icon: "moon-16" },
  { value: "light", title: "Light", icon: "sun-16" },
];

function markAccessory(mark: CurrentMark): ListAccessory[] {
  if (mark === "current") return [{ icon: { source: "checkmark-16", tintColor: "raycast-secondary-text" }, text: "Current", tooltip: "Current Theme" }];
  if (mark === "dark") return [{ icon: { source: "moon-16", tintColor: "raycast-blue" }, text: "Dark", tooltip: "Current Dark Theme" }];
  if (mark === "light") return [{ icon: { source: "sun-16", tintColor: "raycast-yellow" }, text: "Light", tooltip: "Current Light Theme" }];
  return [];
}

/**
 * "Switch Theme": built-in and user themes by appearance. The selected row is
 * previewed on the whole launcher; leaving without choosing restores the theme.
 */
export function SwitchThemeView({ navigationTitle = "Switch Theme", navigationIcon }: SwitchThemeViewProps) {
  const navigation = useNavigation();
  const { settings } = useSettings();
  const shown = useTheme();
  const { data: themes, isLoading, setData } = useBackend("themes.list", undefined);
  const catalog = useMemo(() => buildThemeCatalog(themes ?? []), [themes]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AppearanceFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const themeSettings = { appearance: settings["general.appearance"], themeDark: settings["general.themeDark"], themeLight: settings["general.themeLight"] };
  const sections = useMemo(() => catalogSections(filterCatalog(catalog, query, filter)), [catalog, query, filter]);
  const visible = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const inUse = themeInUse(catalog, shown.appearance === "dark" ? themeSettings.themeDark : themeSettings.themeLight, shown.appearance);
  const selected = visible.find((e) => e.palette.id === selectedId) ?? (selectedId === null && inUse && visible.includes(inUse) ? inUse : visible[0]);

  useLiveThemePreview(themes && selected ? selected.palette : null);

  const resetSelection = (nextQuery: string, nextFilter: AppearanceFilter) => {
    setSelectedId(catalogSections(filterCatalog(catalog, nextQuery, nextFilter))[0]?.items[0]?.palette.id ?? null);
  };

  const apply = async (entry: CatalogTheme, mode: "current" | "appearance") => {
    try {
      await applyThemeSettings(themeSettingsUpdate(entry.palette.id, entry.palette.appearance, mode, themeSettings.appearance, shown.appearance));
      showToast({ style: "success", title: mode === "current" ? `Switched to ${entry.palette.name}` : `${entry.palette.name} is now the ${appearanceLabel(entry.palette.appearance).toLowerCase()} theme` });
    } catch (error) {
      showFailureToast("Failed to switch theme", error);
    }
  };

  const openEditor = (draft: ThemeDraft, base: Palette, copiedFrom?: string) => {
    navigation.push(
      <ThemeEditorView
        initialDraft={draft}
        basePalette={base}
        copiedFrom={copiedFrom}
        navigationIcon={navigationIcon}
        onSaved={(theme) => {
          setData((previous) => [...(previous ?? []).filter((t) => t.id !== theme.id), theme]);
          setSelectedId(theme.id);
          setQuery("");
          setFilter("all");
          navigation.pop();
        }}
      />,
    );
  };

  const names = catalog.map((e) => e.palette.name);
  const edit = (entry: CatalogTheme) => {
    if (entry.builtin) openEditor(draftFromPalette(entry.palette, { name: copyName(entry.palette.name, names) }), entry.palette, entry.palette.name);
    else openEditor(draftFromPalette(entry.palette, { id: entry.palette.id }), entry.palette);
  };

  const create = (base: Palette) => openEditor(draftFromPalette(base, { name: "" }), base);

  const duplicate = async (entry: CatalogTheme) => {
    try {
      const theme = await backend.call("themes.upsert", draftToUpsert(draftFromPalette(entry.palette, { name: copyName(entry.palette.name, names) })));
      setData((previous) => [...(previous ?? []), theme]);
      setSelectedId(theme.id);
      showToast({ style: "success", title: `Duplicated as “${theme.name}”` });
    } catch (error) {
      showFailureToast("Failed to duplicate theme", error);
    }
  };

  const remove = async (entry: CatalogTheme) => {
    const confirmed = await confirmAlert({
      title: `Delete “${entry.palette.name}”?`,
      message: "The theme will be removed for good. Windows using it switch back to the default theme.",
      primaryAction: { title: "Delete Theme", style: "destructive" },
    });
    if (!confirmed) return;
    const index = visible.indexOf(entry);
    const neighbor = visible[index + 1] ?? visible[index - 1];
    try {
      await backend.call("themes.delete", { id: entry.palette.id });
      setData((previous) => (previous ?? []).filter((t: Theme) => t.id !== entry.palette.id));
      setSelectedId(neighbor?.palette.id ?? null);
      const fallback = defaultPalette(entry.palette.appearance).id;
      if (entry.palette.appearance === "dark" && themeSettings.themeDark === entry.palette.id) await applyThemeSettings({ "general.themeDark": fallback });
      if (entry.palette.appearance === "light" && themeSettings.themeLight === entry.palette.id) await applyThemeSettings({ "general.themeLight": fallback });
      showToast({ style: "success", title: "Theme deleted" });
    } catch (error) {
      showFailureToast("Failed to delete theme", error);
    }
  };

  const importFromClipboard = async () => {
    try {
      const text = await readClipboardText();
      const draft = text ? parseThemeJson(text, defaultPalette(shown.appearance).colors.accent) : null;
      if (!draft) {
        showToast({ style: "failure", title: "No theme in the clipboard", message: "Copy a theme's JSON, then try again." });
        return;
      }
      openEditor(draft, defaultPalette(draft.appearance));
    } catch (error) {
      showFailureToast("Failed to read the clipboard", error);
    }
  };

  const generalActions = (base: Palette) => (
    <>
      <Action title="Create Theme" icon="plus-16" shortcut={sc("cmd", "n")} onAction={() => create(base)} />
      <Action title="Import Theme from Clipboard" icon="download-16" shortcut={sc("cmd", "shift", "v")} onAction={importFromClipboard} />
    </>
  );

  const rowActions = (entry: CatalogTheme) => (
    <ActionPanel title={entry.palette.name}>
      <Action title="Set as Current Theme" icon="check-circle-16" shortcut={sc("return")} onAction={() => apply(entry, "current")} />
      <Action
        title={`Set as ${appearanceLabel(entry.palette.appearance)} Theme`}
        icon={entry.palette.appearance === "dark" ? "moon-16" : "sun-16"}
        shortcut={sc("cmd", "return")}
        onAction={() => apply(entry, "appearance")}
      />
      <ActionPanel.Section>
        <Action title={entry.builtin ? "Duplicate and Edit…" : "Edit Theme…"} icon="pencil-16" shortcut={sc("cmd", "e")} onAction={() => edit(entry)} />
        <Action title="Duplicate Theme" icon="duplicate-16" shortcut={sc("cmd", "d")} onAction={() => duplicate(entry)} />
        {generalActions(entry.palette)}
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action title="Copy Theme JSON" icon="copy-clipboard-16" shortcut={sc("cmd", "shift", "c")} onAction={() => copyWithToast(themeToJson(draftFromPalette(entry.palette)), "Copied theme JSON")} />
      </ActionPanel.Section>
      {!entry.builtin && (
        <ActionPanel.Section>
          <Action title="Delete Theme" icon="trash-16" style="destructive" shortcut={sc("ctrl", "x")} onAction={() => remove(entry)} />
        </ActionPanel.Section>
      )}
    </ActionPanel>
  );

  return (
    <ThemeScope appearance={selected?.palette.appearance ?? shown.appearance}>
      <List
        navigationTitle={navigationTitle}
        navigationIcon={navigationIcon}
        searchBarPlaceholder="Search themes…"
        searchText={query}
        onSearchTextChange={(text) => {
          setQuery(text);
          resetSelection(text, filter);
        }}
        filtering={false}
        isLoading={isLoading && !themes}
        selectedItemId={selected?.palette.id}
        onSelectionChange={(id) => id && setSelectedId(id)}
        searchBarAccessory={
          <List.Dropdown
            tooltip="Filter by Appearance"
            value={filter}
            onChange={(value) => {
              const next = value as AppearanceFilter;
              setFilter(next);
              resetSelection(query, next);
            }}
          >
            {FILTERS.map((f) => (
              <List.Dropdown.Item key={f.value} value={f.value} title={f.title} icon={f.icon} />
            ))}
          </List.Dropdown>
        }
        actions={<ActionPanel>{generalActions(shown.palette)}</ActionPanel>}
      >
        {sections.map((section) => (
          <List.Section key={section.id} id={section.id} title={section.title} subtitle={String(section.items.length)}>
            {section.items.map((entry) => (
              <List.Item
                key={entry.palette.id}
                id={entry.palette.id}
                title={entry.palette.name}
                icon={themeSwatchIcon(entry.palette)}
                keywords={[appearanceLabel(entry.palette.appearance)]}
                accessories={markAccessory(currentMark(entry, catalog, themeSettings))}
                actions={rowActions(entry)}
              />
            ))}
          </List.Section>
        ))}
        <List.EmptyView title="No Themes Found" description={query.trim() ? "No theme matches your search. Create one with ⌘N." : "Create a theme with ⌘N to see it here."} actions={<ActionPanel>{generalActions(shown.palette)}</ActionPanel>} />
      </List>
    </ThemeScope>
  );
}
