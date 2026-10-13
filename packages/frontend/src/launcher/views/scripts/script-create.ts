import type { BackendParams, ScriptCommand } from "@opencast/protocol";
import { abbreviateHome } from "./script-list";

export type ScriptLanguage = BackendParams<"scripts.create">["language"];

/** Templates the backend can generate, with the file extension it uses. */
export const SCRIPT_LANGUAGES: { value: ScriptLanguage; title: string; extension: string }[] = [
  { value: "bash", title: "Shell (Bash)", extension: "sh" },
  { value: "applescript", title: "AppleScript", extension: "applescript" },
  { value: "swift", title: "Swift", extension: "swift" },
  { value: "python", title: "Python", extension: "py" },
  { value: "node", title: "JavaScript (Node.js)", extension: "js" },
  { value: "typescript", title: "TypeScript", extension: "ts" },
  { value: "go", title: "Go", extension: "go" },
  { value: "ruby", title: "Ruby", extension: "rb" },
  { value: "csharp", title: "C# (.NET)", extension: "cs" },
];

export const SCRIPT_MODES: { value: ScriptCommand["mode"]; title: string }[] = [
  { value: "compact", title: "Compact" },
  { value: "silent", title: "Silent" },
  { value: "fullOutput", title: "Full Output" },
  { value: "inline", title: "Inline" },
];

export const REFRESH_INTERVALS = [
  { value: "30s", title: "Every 30 Seconds" },
  { value: "1m", title: "Every Minute" },
  { value: "15m", title: "Every 15 Minutes" },
  { value: "1h", title: "Every Hour" },
  { value: "3h", title: "Every 3 Hours" },
];

export const MODE_HELP =
  "Compact shows the last line of output in a HUD. Silent closes the window first and shows the last line in a HUD. Full Output shows everything the script prints in its own view. Inline shows the first line as the command's subtitle and refreshes it every minute.";

export interface CreateScriptValues {
  language: ScriptLanguage;
  mode: ScriptCommand["mode"];
  title: string;
  packageName: string;
  icon: string;
  directory: string;
  needsConfirmation: boolean;
  refreshTime: string;
}

/** File name the backend derives from the title (`My Script!` → `my-script.sh`). */
export function scriptFileName(title: string, language: ScriptLanguage): string {
  const slug =
    title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "script";
  const extension = SCRIPT_LANGUAGES.find((l) => l.value === language)?.extension ?? "sh";
  return `${slug}.${extension}`;
}

/** Where the new script will be written, for the form's hint. */
export function scriptDestination(values: Pick<CreateScriptValues, "title" | "language" | "directory">): string | undefined {
  if (!values.directory || !values.title.trim()) return undefined;
  return `${abbreviateHome(values.directory.replace(/\/+$/, ""))}/${scriptFileName(values.title.trim(), values.language)}`;
}

export type CreateScriptErrors = Partial<Record<keyof CreateScriptValues, string>>;

export function validateCreateScript(values: CreateScriptValues, directories: string[]): CreateScriptErrors {
  const errors: CreateScriptErrors = {};
  if (!values.title.trim()) errors.title = "Title is required";
  if (!SCRIPT_LANGUAGES.some((language) => language.value === values.language)) errors.language = "Choose a script template";
  if (!SCRIPT_MODES.some((mode) => mode.value === values.mode)) errors.mode = "Choose an output mode";
  if (values.mode === "inline" && !REFRESH_INTERVALS.some((interval) => interval.value === values.refreshTime)) errors.refreshTime = "Choose a refresh interval";
  if (!values.directory) errors.directory = directories.length ? "Choose a directory" : "Add a script directory first";
  else if (!directories.includes(values.directory)) errors.directory = "Choose one of your script directories";
  return errors;
}

/** RPC params with optional metadata omitted when empty. */
export function createScriptParams(values: CreateScriptValues): BackendParams<"scripts.create"> {
  return {
    directory: values.directory,
    title: values.title.trim(),
    mode: values.mode,
    language: values.language,
    packageName: values.packageName.trim() || undefined,
    icon: values.icon.trim() || undefined,
    ...(values.mode === "inline" ? { refreshTime: values.refreshTime } : values.needsConfirmation ? { needsConfirmation: true } : {}),
  };
}
