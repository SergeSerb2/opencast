import type { BackendParams, ScriptCommand } from "@surgecast/protocol";
import { abbreviateHome } from "./script-list";

export type ScriptLanguage = BackendParams<"scripts.create">["language"];

/** Templates the backend can generate, with the file extension it uses. */
export const SCRIPT_LANGUAGES: { value: ScriptLanguage; title: string; extension: string }[] = [
  { value: "bash", title: "Shell (Bash)", extension: "sh" },
  { value: "applescript", title: "AppleScript", extension: "applescript" },
  { value: "swift", title: "Swift", extension: "swift" },
  { value: "python", title: "Python", extension: "py" },
  { value: "node", title: "JavaScript (Node.js)", extension: "js" },
  { value: "ruby", title: "Ruby", extension: "rb" },
];

export const SCRIPT_MODES: { value: ScriptCommand["mode"]; title: string }[] = [
  { value: "compact", title: "Compact" },
  { value: "silent", title: "Silent" },
  { value: "fullOutput", title: "Full Output" },
  { value: "inline", title: "Inline" },
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
  };
}
