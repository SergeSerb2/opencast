import { backend } from "../../bridge/backend";
import { useBackend } from "../../bridge/hooks";
import { Button } from "../../components/Button/Button";
import { confirmAlert } from "../../components/feedback/alert-store";
import { showFailureToast, showToast } from "../../components/feedback/toast-store";
import { AppListEditor } from "../ui/apps";
import { CommitTextField, SettingSelect, SettingSwitch, useSettingState } from "../ui/controls";
import { Row, Section } from "../ui/layout";
import { PathListEditor } from "../ui/paths";
import { PermissionRow } from "../ui/permissions";
import { chooseFiles } from "../ui/prompt";
import { BuiltinPage } from "./BuiltinPage";
import { ScriptCommandsSection } from "./ScriptCommands";

const PASTE_OR_COPY = [
  { value: "paste", title: "Paste to Active App" },
  { value: "copy", title: "Copy to Clipboard" },
] as const;

const KEEP_HISTORY = [
  { value: "5m", title: "5 Minutes" },
  { value: "1h", title: "1 Hour" },
  { value: "1d", title: "1 Day" },
  { value: "7d", title: "7 Days" },
  { value: "30d", title: "1 Month" },
  { value: "90d", title: "3 Months" },
  { value: "180d", title: "6 Months" },
  { value: "365d", title: "1 Year" },
  { value: "unlimited", title: "Unlimited" },
] as const;

async function clearClipboardHistory() {
  const confirmed = await confirmAlert({
    title: "Clear Clipboard History?",
    message: "All items except pinned ones are deleted from this Mac. This can't be undone.",
    primaryAction: { title: "Clear History", style: "destructive" },
  });
  if (!confirmed) return;
  try {
    await backend.call("clipboard.clear", { includePinned: false });
    showToast({ style: "success", title: "Clipboard history cleared" });
  } catch (error) {
    showFailureToast("Could not clear clipboard history", error);
  }
}

export function ClipboardHistoryPage() {
  const [disabledApps, setDisabledApps] = useSettingState("clipboard.disabledApplications");
  return (
    <BuiltinPage id="clipboard-history">
      <Section anchor="history">
        <Row title="Keep History For" description="Older items are deleted automatically. Pinned items are always kept.">
          <SettingSelect setting="clipboard.keepHistoryFor" options={KEEP_HISTORY} label="Keep History For" />
        </Row>
        <Row title="Save Images">
          <SettingSwitch setting="clipboard.saveImages" label="Save Images" />
        </Row>
        <Row title="Save Files">
          <SettingSwitch setting="clipboard.saveFiles" label="Save Files" />
        </Row>
        <Row title="Text Recognition" description="Text inside copied images is recognized so you can search for it.">
          <SettingSwitch setting="clipboard.textRecognitionEnabled" label="Text Recognition" />
        </Row>
        <Row title="Recognition Mode" description="Fast uses less CPU; Accurate recognizes more text.">
          <SettingSelect setting="clipboard.recognitionMode" options={[{ value: "fast", title: "Fast" }, { value: "accurate", title: "Accurate" }]} label="Recognition Mode" />
        </Row>
        <Row title="Save Universal Clipboard Items Immediately" description="Save items copied on your iPhone, iPad or other Mac as soon as they arrive.">
          <SettingSwitch setting="clipboard.captureUniversalClipboard" label="Save Universal Clipboard Items Immediately" />
        </Row>
        <Row title="Primary Action" description="What ↵ does in Clipboard History.">
          <SettingSelect setting="clipboard.primaryAction" options={PASTE_OR_COPY} label="Primary Action" />
        </Row>
        <Row title="Clear History" description="Delete every item except pinned ones.">
          <Button size="small" variant="destructive" onClick={() => void clearClipboardHistory()}>
            Clear…
          </Button>
        </Row>
      </Section>
      <Section title="Disabled Applications" description="Copies from these apps are never recorded. Password managers are on the list by default.">
        <Row title="Disabled Applications" layout="stacked" anchor="disabled-applications">
          <AppListEditor
            value={disabledApps}
            onChange={setDisabledApps}
            emptyTitle="Every app is recorded"
            emptyDescription="Add password managers or other apps whose copies should stay out of your history."
          />
        </Row>
      </Section>
    </BuiltinPage>
  );
}

export function SnippetsPage() {
  const [disabledApps, setDisabledApps] = useSettingState("snippets.disabledApplications");
  const [expansion] = useSettingState("snippets.autoExpansionEnabled");
  return (
    <BuiltinPage id="snippets">
      <Section title="Snippet Expansion">
        <Row title="Enable Snippet Expansion" description="Replace a snippet's keyword with its text as you type in any app.">
          <SettingSwitch setting="snippets.autoExpansionEnabled" label="Enable Snippet Expansion" />
        </Row>
        <Row title="Expand within Words" description="When off, a keyword expands only when typed as a separate word. When on, it also expands inside a longer word." disabled={!expansion}>
          <SettingSwitch setting="snippets.expandWithinWords" disabled={!expansion} label="Expand within Words" />
        </Row>
        <Row title="Expansion Mode" disabled={!expansion}>
          <SettingSelect setting="snippets.expansionMode" options={[{ value: "immediately", title: "Immediately" }, { value: "after-delimiter-keeping", title: "After Delimiter (keeping)" }, { value: "after-delimiter-discarding", title: "After Delimiter (discarding)" }]} label="Expansion Mode" disabled={!expansion} />
        </Row>
        <Row title="Injection Delay" description="Wait briefly so overlapping keywords and words containing a keyword can be typed." disabled={!expansion}>
          <SettingSelect setting="snippets.injectionDelay" options={[{ value: "none", title: "None" }, { value: "short", title: "Short" }, { value: "regular", title: "Regular" }, { value: "long", title: "Long" }, { value: "extra-long", title: "Extra Long" }]} label="Injection Delay" disabled={!expansion} />
        </Row>
        <Row title="Response Time" description="Slower response times may help if snippets do not expand correctly." disabled={!expansion}>
          <SettingSelect setting="snippets.responseTime" options={[{ value: "instant", title: "Instant" }, { value: "quick", title: "Quick" }, { value: "default", title: "Default" }, { value: "delayed", title: "Delayed" }, { value: "extended", title: "Extended" }]} label="Response Time" disabled={!expansion} />
        </Row>
        <Row title="Completion Sound" description="Play a sound when a snippet expands." disabled={!expansion}>
          <SettingSelect setting="snippets.completionSound" options={[{ value: "", title: "None" }, ...["Basso", "Blow", "Bottle", "Frog", "Funk", "Glass", "Hero", "Morse", "Ping", "Pop", "Purr", "Sosumi", "Submarine", "Tink"].map((value) => ({ value, title: value }))]} label="Completion Sound" disabled={!expansion} />
        </Row>
        <Row title="Override System Snippets" description="Unavailable: macOS does not expose a per-application API to override another app’s text replacements.">
          <SettingSwitch setting="snippets.overrideSystemSnippets" disabled label="Override System Snippets" />
        </Row>
        <PermissionRow kind="accessibility" title="Accessibility Permission" description="Needed to watch for keywords and type the expanded text." />
      </Section>
      <Section title="Disabled Applications" description="Snippets don't expand in these apps.">
        <Row title="Disabled Applications" layout="stacked" anchor="disabled-applications">
          <AppListEditor
            value={disabledApps}
            onChange={setDisabledApps}
            emptyTitle="Snippets expand in every app"
            emptyDescription="Add apps such as terminals or games where keywords shouldn't expand."
          />
        </Row>
      </Section>
      <Section title="Warnings">
        <Row title="Show Warning Before Deleting Snippets">
          <SettingSwitch setting="snippets.deleteSnippetWarning" label="Show Warning Before Deleting Snippets" />
        </Row>
      </Section>
    </BuiltinPage>
  );
}

export function QuicklinksPage() {
  return (
    <BuiltinPage id="quicklinks">
      <Section anchor="quicklinks">
        <Row title="Show Link Previews">
          <SettingSwitch setting="quicklinks.showLinkPreviews" label="Show Link Previews" />
        </Row>
        <Row title="Prefer Existing Tabs" description="Activate an existing browser tab for a quicklink URL when available.">
          <SettingSwitch setting="quicklinks.preferExistingTabs" label="Prefer Existing Tabs" />
        </Row>
        <Row title="Pass Selected Text as Argument" description="When a quicklink with one argument runs from its hotkey, fill the argument with the text selected in the frontmost app.">
          <SettingSwitch setting="quicklinks.passSelectedTextAsArgument" label="Pass Selected Text as Argument" />
        </Row>
        <Row title="Show Warning Before Deleting Quicklinks">
          <SettingSwitch setting="quicklinks.deleteQuicklinkWarning" label="Show Warning Before Deleting Quicklinks" />
        </Row>
      </Section>
    </BuiltinPage>
  );
}

const ZOOM = [0.8, 0.9, 1, 1.1, 1.25, 1.5].map((value) => ({ value, title: `${Math.round(value * 100)}%` }));

export function NotesPage() {
  return (
    <BuiltinPage id="notes">
      <Section anchor="notes">
        <Row title="Show Notes Toggle Button in Menu Bar" description="Add a menu bar button that shows and hides the Notes window.">
          <SettingSwitch setting="notes.showMenuBarToggle" label="Show Notes Toggle Button in Menu Bar" />
        </Row>
        <Row title="Escape Key Loses Focus" description="Pressing Escape in Notes leaves the window open and returns focus to the previous app instead of closing it.">
          <SettingSwitch setting="notes.escapeKeyLosesFocus" label="Escape Key Loses Focus" />
        </Row>
        <Row title="Keep Window on Top" description="The Notes window floats above other windows.">
          <SettingSwitch setting="notes.alwaysOnTop" label="Keep Window on Top" />
        </Row>
        <Row title="Zoom" description="Text size in notes.">
          <SettingSelect setting="notes.zoom" options={ZOOM} label="Zoom" />
        </Row>
      </Section>
    </BuiltinPage>
  );
}

const GAPS = [
  { value: 0, title: "None" },
  { value: 8, title: "Tiny" },
  { value: 16, title: "Small" },
  { value: 32, title: "Medium" },
  { value: 64, title: "Large" },
  { value: 128, title: "Extra Large" },
];

const CYCLING = [
  { value: "off", title: "None" },
  { value: "halves-thirds", title: "Cycle ½, ⅔ and ⅓" },
  { value: "halves-thirds-quarters", title: "Cycle ½, ⅔, ⅓ and ¼" },
] as const;

export function WindowManagementPage() {
  return (
    <BuiltinPage id="window-management">
      <Section anchor="window-management">
        <Row title="Window Gap" description="Space between windows.">
          <SettingSelect setting="windowManagement.innerGap" options={GAPS} label="Window Gap" />
        </Row>
        <Row title="Screen Gap" description="Space between windows and the edges of the screen.">
          <SettingSelect setting="windowManagement.outerGap" options={GAPS} label="Screen Gap" />
        </Row>
        <Row title="Cycling" description="Run a half command again to cycle through these sizes.">
          <SettingSelect setting="windowManagement.cycling" options={CYCLING} label="Cycling" />
        </Row>
        <Row title="Auto Close Empty Desktops" description="Unavailable: public macOS APIs do not support removing another app’s empty Spaces.">
          <SettingSwitch setting="windowManagement.autoCloseEmptyDesktops" disabled label="Auto Close Empty Desktops" />
        </Row>
        <Row title="Respect Stage Manager" description="Keep windows clear of the Stage Manager strip.">
          <SettingSwitch setting="windowManagement.respectStageManager" label="Respect Stage Manager" />
        </Row>
        <PermissionRow kind="accessibility" title="Accessibility Permission" description="Needed to move and resize the windows of other apps." />
      </Section>
    </BuiltinPage>
  );
}

const DECIMAL_SEPARATORS = [
  { value: "auto", title: "Automatic (from Region)" },
  { value: ".", title: "Period (1.5)" },
  { value: ",", title: "Comma (1,5)" },
] as const;

export function CalculatorPage() {
  const [rate, setRate] = useSettingState("calculator.remToPxRate");
  return (
    <BuiltinPage id="calculator">
      <Section anchor="calculator">
        <Row title="Enable Color Conversion" description="Preview and convert color values such as #FF6363 or rgb(255 99 99) in root search.">
          <SettingSwitch setting="calculator.colorConversion" label="Enable Color Conversion" />
        </Row>
        <Row title="Enable Flight Tracker" description="Unavailable: no flight-data provider is configured for OpenCast.">
          <SettingSwitch setting="calculator.flightTracker" disabled label="Enable Flight Tracker" />
        </Row>
        <Row title="Enable Weather" description="Show weather forecasts and calculations in root search.">
          <SettingSwitch setting="calculator.weather" label="Enable Weather" />
        </Row>
        <Row title="Syntax Highlighting">
          <SettingSwitch setting="calculator.syntaxHighlighting" label="Syntax Highlighting" />
        </Row>
        <Row title="REM/EM to Pixel Conversion" description="How many pixels 1 rem or em equals.">
          <CommitTextField
            value={String(rate)}
            onCommit={(value) => setRate(Number(value))}
            validate={(value) => (/^\d+(\.\d+)?$/.test(value.trim()) && Number(value) > 0 && Number(value) <= 200 ? null : "Enter a number between 1 and 200")}
            width={80}
            label="Pixels per rem"
          />
        </Row>
        <Row title="Decimal Separator" description="How numbers are read and shown.">
          <SettingSelect setting="calculator.decimalSeparator" options={DECIMAL_SEPARATORS} label="Decimal Separator" />
        </Row>
      </Section>
    </BuiltinPage>
  );
}

const COLUMNS = [6, 7, 8, 9, 10].map((value) => ({ value, title: `${value} Columns` }));
const SKIN_TONES = ["✋", "✋🏻", "✋🏼", "✋🏽", "✋🏾", "✋🏿"];
const SKIN_TONE_NAMES = ["None", "Light", "Medium Light", "Medium", "Medium Dark", "Dark"];

function SkinTonePicker() {
  const [tone, setTone] = useSettingState("emoji.skinTone");
  return (
    <div className="sc-segmented sc-s-skin-tones" role="radiogroup" aria-label="Emoji Skin Tone">
      {SKIN_TONES.map((emoji, index) => (
        <button
          key={emoji}
          type="button"
          role="radio"
          aria-checked={tone === index}
          aria-label={SKIN_TONE_NAMES[index]}
          title={SKIN_TONE_NAMES[index]}
          className="sc-segmented__item sc-s-skin-tones__item"
          data-selected={tone === index || undefined}
          onClick={() => setTone(index as 0 | 1 | 2 | 3 | 4 | 5)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function EmojiPage() {
  return (
    <BuiltinPage id="emoji">
      <Section anchor="emoji">
        <Row title="Column Count">
          <SettingSelect setting="emoji.columns" options={COLUMNS} label="Column Count" />
        </Row>
        <Row title="Primary Action">
          <SettingSelect setting="emoji.primaryAction" options={PASTE_OR_COPY} label="Primary Action" />
        </Row>
        <Row title="Save AI-generated Custom Keywords" description="Unavailable: AI emoji keyword generation is not implemented yet.">
          <SettingSwitch setting="emoji.saveAiCustomKeyword" disabled label="Save AI-generated Custom Keywords" />
        </Row>
        <Row title="Emoji Skin Tone" description="Default skin tone for emoji that have variants.">
          <SkinTonePicker />
        </Row>
      </Section>
    </BuiltinPage>
  );
}

function parsePatterns(text: string): string[] {
  return [
    ...new Set(
      text
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  ];
}

export function FileSearchPage() {
  const [directories, setDirectories] = useSettingState("files.directories");
  const [patterns, setPatterns] = useSettingState("files.ignorePatterns");
  return (
    <BuiltinPage id="file-search">
      <Section title="Search Scopes" description="Folders File Search indexes. Subfolders are included.">
        <Row title="Search Scopes" layout="stacked" anchor="search-scopes">
          <PathListEditor
            value={directories}
            onAdd={(paths) => setDirectories([...directories, ...paths])}
            onRemove={(path) => setDirectories(directories.filter((d) => d !== path))}
            emptyTitle="No folders"
            emptyDescription="Add at least one folder to search files."
          />
        </Row>
      </Section>
      <Section anchor="indexing">
        <Row title="Ignore Patterns" description="Comma-separated file or folder names to skip everywhere, in addition to .gitignore files.">
          <CommitTextField value={patterns.join(", ")} onCommit={(value) => setPatterns(parsePatterns(value))} width={240} placeholder="node_modules, .git" label="Ignore Patterns" />
        </Row>
        <Row title="Include Hidden Files" description="Also find files and folders whose names start with a dot.">
          <SettingSwitch setting="files.includeHiddenFiles" label="Include Hidden Files" />
        </Row>
        <Row title="Content Search" description="Search text inside files as well as their names.">
          <SettingSwitch setting="files.contentSearch" label="Content Search" />
        </Row>
        <Row title="Use Ignore Files" description="Respect .gitignore, .ignore and .rayignore files while indexing.">
          <SettingSwitch setting="files.useIgnoreFiles" label="Use Ignore Files" />
        </Row>
        <Row title="Index Network & Removable Drives" description="Include network shares and removable volumes mounted inside your search scopes.">
          <SettingSwitch setting="files.indexNetworkAndRemovableVolumes" label="Index Network & Removable Drives" />
        </Row>
        <Row title="Keep Files from Removed Volumes" description="Keep indexed results when their volume is disconnected.">
          <SettingSwitch setting="files.keepRemovedVolumeFiles" label="Keep Files from Removed Volumes" />
        </Row>
        <PermissionRow kind="fullDiskAccess" title="Full Disk Access" description="Lets File Search index folders macOS protects, such as Mail and Messages data." />
      </Section>
    </BuiltinPage>
  );
}

const HOTKEY_BEHAVIOR = [
  { value: "toggle", title: "Toggle Visibility" },
  { value: "open", title: "Always Bring to Front" },
] as const;

export function ApplicationsPage() {
  const [directories, setDirectories] = useSettingState("applications.directories");
  return (
    <BuiltinPage id="applications">
      <Section anchor="applications">
        <Row title="Hotkey Action" description="What an application hotkey does when the app is already in front.">
          <SettingSelect setting="applications.hotkeyBehavior" options={HOTKEY_BEHAVIOR} label="Hotkey Action" />
        </Row>
        <Row title="Search Scopes" description="Additional folders searched for applications." layout="stacked">
          <PathListEditor value={directories} onAdd={(paths) => setDirectories([...directories, ...paths])} onRemove={(path) => setDirectories(directories.filter((d) => d !== path))} emptyTitle="Only default application folders are searched" />
        </Row>
        <Row title="Deep Search" description="Search up to three levels deep inside added folders.">
          <SettingSwitch setting="applications.recursiveSearch" label="Deep Search" />
        </Row>
      </Section>
    </BuiltinPage>
  );
}

export function CalendarPage() {
  return (
    <BuiltinPage id="calendar">
      <Section anchor="calendar">
        <PermissionRow kind="calendar" title="Calendar Access" description="Needed to show your events in My Schedule and root search." />
      </Section>
    </BuiltinPage>
  );
}

const LANGUAGES: { value: string; title: string }[] = [
  ["en", "English"],
  ["de", "German"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["nl", "Dutch"],
  ["sv", "Swedish"],
  ["da", "Danish"],
  ["no", "Norwegian"],
  ["fi", "Finnish"],
  ["pl", "Polish"],
  ["cs", "Czech"],
  ["uk", "Ukrainian"],
  ["ru", "Russian"],
  ["tr", "Turkish"],
  ["el", "Greek"],
  ["ar", "Arabic"],
  ["he", "Hebrew"],
  ["hi", "Hindi"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh-Hans", "Chinese (Simplified)"],
  ["zh-Hant", "Chinese (Traditional)"],
  ["id", "Indonesian"],
  ["vi", "Vietnamese"],
  ["th", "Thai"],
].map(([value, title]) => ({ value, title }));

export function TranslatorPage() {
  return (
    <BuiltinPage id="translator">
      <Section anchor="translator">
        <Row title="Default Source Language" description="Language to translate from.">
          <SettingSelect setting="translator.defaultSourceLanguage" options={[{ value: "auto", title: "Detect Language" }, ...LANGUAGES]} label="Default Source Language" />
        </Row>
        <Row title="Default Target Language" description="Language to translate to.">
          <SettingSelect setting="translator.defaultTargetLanguage" options={LANGUAGES} label="Default Target Language" />
        </Row>
        <Row title="Primary Action" description="What ↵ does after a translation.">
          <SettingSelect setting="translator.primaryAction" options={PASTE_OR_COPY} label="Primary Action" />
        </Row>
        <Row title="Use Selected Text as Source" description="Fill in the text selected in the frontmost app when Translator opens.">
          <SettingSwitch setting="translator.prefillFromSelectedText" label="Use Selected Text as Source" />
        </Row>
      </Section>
    </BuiltinPage>
  );
}

async function developExtension() {
  try {
    const picked = await chooseFiles({ canChooseFiles: false, canChooseDirectories: true, title: "Choose an Extension Folder", prompt: "Develop" });
    if (!picked?.[0]) return;
    const extension = await backend.call("extensions.develop", { path: picked[0] });
    showToast({ style: "success", title: `Developing ${extension.title}`, message: "Changes reload automatically." });
  } catch (error) {
    showFailureToast("Could not start development mode", error);
  }
}

export function DeveloperPage() {
  return (
    <BuiltinPage id="developer">
      <Section anchor="developer">
        <Row title="Develop an Extension" description="Watch a local extension folder and reload its commands when files change, like `ray develop`.">
          <Button size="small" onClick={() => void developExtension()}>
            Choose Folder…
          </Button>
        </Row>
        <Row title="Auto-reload on Save" description="Restart the open command after a successful build so it shows your changes.">
          <SettingSwitch setting="developer.autoReloadOnSave" label="Auto-reload on Save" />
        </Row>
        <Row title="Keep Window Always Visible During Development" description="The launcher stays open while an extension is in development.">
          <SettingSwitch setting="developer.keepWindowVisibleDuringDevelopment" label="Keep Window Always Visible During Development" />
        </Row>
        <Row title="Disable Pop to Root Search" description="Keep the current command open while developing.">
          <SettingSwitch setting="developer.disablePopToRootSearch" label="Disable Pop to Root Search" />
        </Row>
        <Row title="Open OpenCast in Development Mode" description="Open OpenCast after the first successful build.">
          <SettingSwitch setting="developer.openOpenCastInDevelopmentMode" label="Open OpenCast in Development Mode" />
        </Row>
        <Row title="Use Node Production Environment" description="Set NODE_ENV to production in development workers.">
          <SettingSwitch setting="developer.useNodeProductionEnvironment" label="Use Node Production Environment" />
        </Row>
      </Section>
    </BuiltinPage>
  );
}

export function ScriptCommandsPage() {
  const [directories] = useSettingState("scripts.directories");
  const { data: scripts, refetch } = useBackend("scripts.list", undefined);
  const add = async (paths: string[]) => {
    try {
      for (const path of paths) await backend.call("scripts.directories.add", { path });
      refetch();
    } catch (error) {
      showFailureToast("Could not add folder", error);
    }
  };
  const remove = async (path: string) => {
    try {
      await backend.call("scripts.directories.remove", { path });
      refetch();
    } catch (error) {
      showFailureToast("Could not remove folder", error);
    }
  };
  return (
    <BuiltinPage id="script-commands">
      <Section title="Script Folders" description="Scripts in these folders with OpenCast (or Raycast) metadata comments become commands.">
        <Row title="Script Folders" layout="stacked" anchor="script-folders">
          <PathListEditor
            value={directories}
            onAdd={(paths) => void add(paths)}
            onRemove={(path) => void remove(path)}
            emptyTitle="No script folders"
            emptyDescription="Add a folder with script commands, or create a new script below."
          />
        </Row>
      </Section>
      <ScriptCommandsSection scripts={scripts ?? []} directories={directories} onCreated={refetch} />
    </BuiltinPage>
  );
}

export function CommandsOnlyPage({ id }: { id: string }) {
  return <BuiltinPage id={id} />;
}
