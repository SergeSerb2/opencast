import { defaultSettings, type Hotkey } from "@surgecast/protocol";
import { native } from "../../bridge/native";
import { useSetting } from "../../bridge/settings";
import { Button, IconButton } from "../../components/Button/Button";
import { Switch } from "../../components/Switch/Switch";
import { Tooltip } from "../../components/Tooltip/Tooltip";
import { showFailureToast } from "../../components/feedback/toast-store";
import { useTheme } from "../../theme/ThemeProvider";
import { useAllCommands, useHotkeyConflict } from "../data";
import { GLOBAL_HOTKEY_OWNER, sameHotkey } from "../hotkeys";
import { themeIcon, useThemeOptions, type ThemeOption } from "../themes";
import { saveSetting, Select, SettingSwitch, useSettingState } from "../ui/controls";
import { HotkeyRecorder } from "../ui/HotkeyRecorder";
import { Controls, Row, Section } from "../ui/layout";
import { PageFrame } from "../ui/PageFrame";
import "./general.css";

const ZOOM_LEVELS = [
  { value: 1, title: "Default", size: 11 },
  { value: 1.1, title: "Large", size: 13 },
  { value: 1.2, title: "Larger", size: 15 },
] as const;

function InterfaceSize() {
  const [zoom, setZoom] = useSettingState("general.uiZoom");
  const selected = ZOOM_LEVELS.reduce((best, level) => (Math.abs(level.value - zoom) < Math.abs(best.value - zoom) ? level : best), ZOOM_LEVELS[0]);
  return (
    <div className="sc-segmented sc-s-zoom" role="radiogroup" aria-label="Interface Size">
      {ZOOM_LEVELS.map((level) => (
        <Tooltip key={level.value} content={`${level.title} (${Math.round(level.value * 100)}%)`}>
          <button
            type="button"
            role="radio"
            aria-checked={level === selected}
            aria-label={level.title}
            className="sc-segmented__item sc-s-zoom__item"
            data-selected={level === selected || undefined}
            onClick={() => setZoom(level.value)}
          >
            <span style={{ fontSize: level.size }}>Aa</span>
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

function themeOptionsFor(themes: ThemeOption[], appearance: "dark" | "light") {
  return themes.filter((t) => t.appearance === appearance).map((t) => ({ value: t.id, title: t.name, icon: themeIcon(t) }));
}

function AppearanceSection() {
  const [appearance, setAppearance] = useSettingState("general.appearance");
  const [themeDark, setThemeDark] = useSettingState("general.themeDark");
  const [themeLight, setThemeLight] = useSettingState("general.themeLight");
  const resolved = useTheme().appearance;
  const themes = useThemeOptions();
  const followSystem = appearance === "system";
  const darkOptions = themeOptionsFor(themes, "dark");
  const lightOptions = themeOptionsFor(themes, "light");

  const chooseFixedTheme = (id: string) => {
    const theme = themes.find((t) => t.id === id);
    if (!theme) return;
    if (theme.appearance === "dark") setThemeDark(id);
    else setThemeLight(id);
    setAppearance(theme.appearance);
  };

  const openThemeStudio = () => native.call("window.show", { kind: "theme-studio" }).catch((error: unknown) => showFailureToast("Could not open Theme Studio", error));

  return (
    <Section title="Appearance">
      <Row title="Follow System Appearance">
        <Switch checked={followSystem} onChange={(on) => setAppearance(on ? "system" : resolved)} label="Follow System Appearance" />
      </Row>
      {followSystem ? (
        <>
          <Row title="Dark Theme">
            <Select value={themeDark} onChange={setThemeDark} options={darkOptions} label="Dark Theme" />
          </Row>
          <Row title="Light Theme">
            <Select value={themeLight} onChange={setThemeLight} options={lightOptions} label="Light Theme" />
          </Row>
        </>
      ) : (
        <Row title="Theme">
          <Select
            value={appearance === "light" ? themeLight : themeDark}
            onChange={chooseFixedTheme}
            sections={[
              { title: "Dark Themes", options: darkOptions },
              { title: "Light Themes", options: lightOptions },
            ]}
            label="Theme"
          />
        </Row>
      )}
      <Row title="Theme Studio" description="Create and edit your own themes.">
        <Button size="small" onClick={openThemeStudio}>
          Open Theme Studio
        </Button>
      </Row>
      <Row title="Interface Size" description="Adjust the size of the Surgecast interface.">
        <InterfaceSize />
      </Row>
    </Section>
  );
}

function WindowModePreview({ mode }: { mode: "compact" | "expanded" }) {
  return (
    <span className="sc-s-window-mode__art" data-mode={mode} aria-hidden="true">
      <span className="sc-s-window-mode__window">
        <span className="sc-s-window-mode__search">
          <span className="sc-s-window-mode__dot" />
          <span className="sc-s-window-mode__line" style={{ width: "42%" }} />
          {mode === "compact" && (
            <span className="sc-s-window-mode__favorites">
              <span />
              <span />
              <span />
            </span>
          )}
        </span>
        {mode === "expanded" &&
          [64, 52, 58, 46].map((width, index) => (
            <span key={index} className="sc-s-window-mode__row" data-selected={index === 0 || undefined}>
              <span className="sc-s-window-mode__icon" />
              <span className="sc-s-window-mode__line" style={{ width: `${width}%` }} />
            </span>
          ))}
      </span>
    </span>
  );
}

function WindowModeSection() {
  const [mode, setMode] = useSettingState("general.windowMode");
  return (
    <Section title="Window Mode" description="Choose your preferred mode when opening Surgecast.">
      <div className="sc-s-item sc-s-window-mode" role="radiogroup" aria-label="Window Mode">
        {(["compact", "expanded"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mode === option}
            className="sc-s-window-mode__option"
            data-selected={mode === option || undefined}
            onClick={() => setMode(option)}
          >
            <WindowModePreview mode={option} />
            <span className="sc-s-window-mode__label">{option === "compact" ? "Compact" : "Expanded"}</span>
          </button>
        ))}
      </div>
      <Row title="Show Favorites in Compact Mode" description="Show your favorites as icons in the compact window." disabled={mode !== "compact"}>
        <SettingSwitch setting="general.showFavoritesInCompactMode" disabled={mode !== "compact"} label="Show Favorites in Compact Mode" />
      </Row>
    </Section>
  );
}

function SurgecastHotkey() {
  const hotkey = useSetting("general.globalHotkey");
  const { data: commands } = useAllCommands();
  const conflict = useHotkeyConflict(GLOBAL_HOTKEY_OWNER, commands);
  const fallback = defaultSettings()["general.globalHotkey"];
  const save = async (next: Hotkey | null) => {
    if (!next) throw new Error("Surgecast needs a hotkey to open");
    await saveSetting("general.globalHotkey", next);
  };
  return (
    <Controls>
      <HotkeyRecorder value={hotkey} onChange={save} conflict={conflict} appearance="button" removable={false} label="Surgecast Hotkey" />
      {!sameHotkey(hotkey, fallback) && <IconButton icon="arrow-counter-clockwise-16" label="Reset to ⌥ Space" onClick={() => void saveSetting("general.globalHotkey", fallback)} />}
    </Controls>
  );
}

/** Settings → General (§8.3, §13.5). */
export function GeneralPage() {
  return (
    <PageFrame title="General">
      <Section anchor="startup">
        <Row title="Open at Login">
          <SettingSwitch setting="general.openAtLogin" label="Open at Login" />
        </Row>
        <Row title="Show in Menu Bar">
          <SettingSwitch setting="general.showInMenuBar" label="Show in Menu Bar" />
        </Row>
        <Row title="Surgecast Hotkey">
          <SurgecastHotkey />
        </Row>
      </Section>
      <AppearanceSection />
      <WindowModeSection />
    </PageFrame>
  );
}
