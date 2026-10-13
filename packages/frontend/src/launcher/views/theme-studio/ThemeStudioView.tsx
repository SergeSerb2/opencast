import { useMemo } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { useBackend } from "../../../bridge/hooks";
import { useSettings } from "../../../bridge/settings";
import { useNavigation, ViewFrame } from "../../../components";
import { useTheme } from "../../../theme/ThemeProvider";
import type { LauncherViewProps } from "../registry";
import { SwitchThemeView } from "./SwitchThemeView";
import { buildThemeCatalog, themeInUse } from "./theme-catalog";
import { copyName, draftFromPalette } from "./theme-draft";
import { ThemeEditorView } from "./ThemeEditorView";

export interface ThemeStudioProps {
  /** "switch" opens the theme browser (Switch Theme); otherwise the editor for the theme in use. */
  action?: string;
}

/** `theme-studio` view: "Show Theme Studio" and "Switch Theme". */
export function ThemeStudioView({ props, title, icon }: LauncherViewProps<ThemeStudioProps>) {
  if (props.action === "switch") return <SwitchThemeView navigationTitle={title ?? "Switch Theme"} navigationIcon={icon} />;
  return <StudioEditor title={title ?? "Theme Studio"} icon={icon} />;
}

/** Opens the editor on the theme in use; a built-in theme is edited as a new copy. */
function StudioEditor({ title, icon }: { title: string; icon?: ImageLike }) {
  const navigation = useNavigation();
  const shown = useTheme();
  const { settings, loaded } = useSettings();
  const { data: themes } = useBackend("themes.list", undefined);
  const catalog = useMemo(() => (themes ? buildThemeCatalog(themes) : null), [themes]);

  if (!catalog || !loaded) return <ViewFrame isLoading navigationTitle={title} navigationIcon={icon}>{null}</ViewFrame>;

  const id = shown.appearance === "dark" ? settings["general.themeDark"] : settings["general.themeLight"];
  const entry = themeInUse(catalog, id, shown.appearance);
  const palette = entry?.palette ?? shown.palette;
  const builtin = entry?.builtin ?? true;
  const draft = builtin ? draftFromPalette(palette, { name: copyName(palette.name, catalog.map((e) => e.palette.name)) }) : draftFromPalette(palette, { id: palette.id });

  return (
    <ThemeEditorView
      initialDraft={draft}
      basePalette={palette}
      copiedFrom={builtin ? palette.name : undefined}
      navigationTitle={title}
      navigationIcon={icon}
      onBrowse={() => navigation.push(<SwitchThemeView navigationIcon={icon} />)}
    />
  );
}
