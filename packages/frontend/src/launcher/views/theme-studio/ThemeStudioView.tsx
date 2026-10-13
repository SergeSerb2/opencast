import { useMemo } from "react";
import type { ImageLike } from "@opencast/protocol";
import { useBackend } from "../../../bridge/hooks";
import { errorMessage } from "../../../bridge/errors";
import { useSettings } from "../../../bridge/settings";
import { EmptyView, useNavigation, ViewFrame } from "../../../components";
import { sc } from "../../../lib/keyboard";
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
  const { data: themes, error, isLoading, refetch } = useBackend("themes.list", undefined);
  const catalog = useMemo(() => (themes ? buildThemeCatalog(themes) : null), [themes]);

  if (!catalog || !loaded) return (
    <ViewFrame isLoading={isLoading || !loaded} navigationTitle={title} navigationIcon={icon} actions={error ? { sections: [{ actions: [{ id: "retry", title: "Try Again", shortcut: sc("cmd", "r"), onAction: refetch }] }] } : undefined}>
      {Boolean(error) && <EmptyView title="Could Not Load Themes" description={errorMessage(error)} icon="warning-16" />}
    </ViewFrame>
  );

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
