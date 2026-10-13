import type { ImageLike, ScriptCommand } from "@opencast/protocol";

/** Section for scripts without `@raycast.packageName`. */
export const DEFAULT_PACKAGE = "Script Commands";
/** Package filter value for "All". */
export const ALL_PACKAGES = "__all__";

export const MODE_LABELS: Record<ScriptCommand["mode"], string> = {
  compact: "Compact",
  silent: "Silent",
  fullOutput: "Full Output",
  inline: "Inline",
};

/** Same tile the backend uses for script commands without an icon. */
export const SCRIPT_TILE: ImageLike = { tile: { glyph: "terminal-16", background: ["#3A3F4B", "#22252D"] } };

export function packageOf(script: ScriptCommand): string {
  return script.packageName?.trim() || DEFAULT_PACKAGE;
}

export function packageNames(scripts: ScriptCommand[]): string[] {
  return [...new Set(scripts.map(packageOf))].sort((a, b) => a.localeCompare(b));
}

/** Case-insensitive substring match on title, description, package, author and path. */
export function matchesScript(script: ScriptCommand, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [script.title, script.description, script.packageName, script.author, script.path].some((field) => field?.toLocaleLowerCase().includes(needle));
}

export interface ScriptSection {
  id: string;
  title: string;
  subtitle: string;
  scripts: ScriptCommand[];
}

export function countLabel(count: number): string {
  return `${count} Script Command${count === 1 ? "" : "s"}`;
}

/** Filtered scripts grouped by package: sections and items sorted by name. */
export function scriptSections(scripts: ScriptCommand[], query: string, packageFilter: string = ALL_PACKAGES): ScriptSection[] {
  const groups = new Map<string, ScriptCommand[]>();
  for (const script of scripts) {
    const name = packageOf(script);
    if (packageFilter !== ALL_PACKAGES && name !== packageFilter) continue;
    if (!matchesScript(script, query)) continue;
    groups.set(name, [...(groups.get(name) ?? []), script]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, items]) => ({ id: name, title: name, subtitle: countLabel(items.length), scripts: [...items].sort((a, b) => a.title.localeCompare(b.title)) }));
}

const IMAGE_FILE = /\.(png|svg|jpe?g|icns|gif|webp)$/i;

function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash <= 0 ? "/" : path.slice(0, slash);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** `@raycast.icon` value → ImageLike: emoji, URL, absolute path, or an image next to the script. */
function iconSource(icon: string, scriptPath: string): string {
  if (/^(https?:|data:|\/)/.test(icon)) return icon;
  if (IMAGE_FILE.test(icon)) return `${dirname(scriptPath)}/${icon.replace(/^\.\//, "")}`;
  return icon;
}

export function scriptIcon(script: ScriptCommand): ImageLike {
  if (!script.icon) return SCRIPT_TILE;
  const light = iconSource(script.icon, script.path);
  return script.iconDark ? { source: { light, dark: iconSource(script.iconDark, script.path) } } : light;
}

/** `/Users/me/scripts/a.sh` → `~/scripts/a.sh`. */
export function abbreviateHome(path: string): string {
  return path.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
}

/** Command line preview: `~/scripts/kill-port.sh <Port> [Signal]`. */
export function scriptUsage(script: ScriptCommand): string {
  const args = script.arguments.map((argument) => {
    const label = argument.placeholder || argument.name;
    return argument.required === false ? `[${label}]` : `<${label}>`;
  });
  return [abbreviateHome(script.path), ...args].join(" ");
}

/** Positional values in declaration order (`argument1`, `argument2`, …). */
export function argumentValues(script: ScriptCommand, values: Record<string, string>): string[] {
  return script.arguments.map((argument) => values[argument.name] ?? "");
}

/** Index of the first required argument without a value, or -1. */
export function firstMissingArgument(script: ScriptCommand, values: Record<string, string>): number {
  return script.arguments.findIndex((argument) => argument.required !== false && !(values[argument.name] ?? "").trim());
}

/** Deeplink the backend resolves by unique title. */
export function scriptDeeplink(script: Pick<ScriptCommand, "title">): string {
  return `opencast://script-commands/${encodeURIComponent(script.title)}`;
}

const INTERPRETERS: Record<string, string> = {
  bash: "Bash",
  sh: "Shell",
  zsh: "Zsh",
  fish: "Fish",
  python: "Python",
  python3: "Python",
  node: "Node.js",
  tsx: "TypeScript",
  go: "Go",
  dotnet: "C# (.NET)",
  bun: "Bun",
  deno: "Deno",
  osascript: "AppleScript",
  swift: "Swift",
  ruby: "Ruby",
  perl: "Perl",
  php: "PHP",
};

const EXTENSIONS: Record<string, string> = {
  sh: "Shell",
  bash: "Bash",
  zsh: "Zsh",
  py: "Python",
  js: "Node.js",
  mjs: "Node.js",
  cjs: "Node.js",
  ts: "TypeScript",
  go: "Go",
  cs: "C# (.NET)",
  applescript: "AppleScript",
  swift: "Swift",
  rb: "Ruby",
  pl: "Perl",
  php: "PHP",
};

/** Human name of the interpreter from the shebang (`/usr/bin/env python3` → Python), else the file extension. */
export function languageName(script: Pick<ScriptCommand, "language" | "path">): string | undefined {
  const parts = script.language?.trim().split(/\s+/) ?? [];
  const program = parts[0] ? basename(parts[0]) : undefined;
  const interpreter = program === "env" ? parts.find((part, i) => i > 0 && !part.startsWith("-")) : program;
  if (interpreter) return INTERPRETERS[interpreter.toLowerCase()] ?? interpreter;
  const extension = basename(script.path).split(".").pop()?.toLowerCase();
  return extension ? EXTENSIONS[extension] : undefined;
}

const REFRESH_UNITS: Record<string, string> = { s: "second", m: "minute", h: "hour", d: "day" };

/** Inline refresh interval (`5m`) as "Every 5 minutes". */
export function refreshLabel(value?: string): string | undefined {
  const match = /^(\d+(?:\.\d+)?)(s|m|h|d)$/.exec(value ?? "");
  if (!match) return undefined;
  const unit = REFRESH_UNITS[match[2]];
  return Number(match[1]) === 1 ? `Every ${unit}` : `Every ${match[1]} ${unit}s`;
}
