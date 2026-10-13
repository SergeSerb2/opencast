import type { BackendResult, ImageLike } from "@opencast/protocol";

export type ImportResult = BackendResult<"data.import">["results"][number];
export type StorageInfo = BackendResult<"data.storage">;

export interface DataCategory {
  id: string;
  title: string;
  icon: ImageLike;
}

/** Categories `data.importRayconfig` understands, in Raycast's order. */
export const RAYCONFIG_CATEGORIES: DataCategory[] = [
  { id: "settings", title: "Settings", icon: "cog-16" },
  { id: "snippets", title: "Snippets", icon: "snippets-16" },
  { id: "quicklinks", title: "Quicklinks", icon: "quicklink-16" },
  { id: "notes", title: "Notes", icon: "blank-document-16" },
  { id: "ai", title: "AI Commands & Presets", icon: "stars-16" },
  { id: "themes", title: "Themes", icon: "swatch-16" },
];

/** Export choices; one choice can cover several backend collections (chats and their messages). */
export const EXPORT_CATEGORIES: (DataCategory & { collections: string[] })[] = [
  { id: "settings", title: "Settings", icon: "cog-16", collections: ["settings"] },
  { id: "commandPrefs", title: "Aliases, Hotkeys & Favorites", icon: "keyboard-16", collections: ["commandPrefs"] },
  { id: "snippets", title: "Snippets", icon: "snippets-16", collections: ["snippets"] },
  { id: "quicklinks", title: "Quicklinks", icon: "quicklink-16", collections: ["quicklinks"] },
  { id: "notes", title: "Notes", icon: "blank-document-16", collections: ["notes"] },
  { id: "aiCommands", title: "AI Commands", icon: "wand-16", collections: ["aiCommands"] },
  { id: "aiPresets", title: "AI Presets", icon: "stars-16", collections: ["aiPresets"] },
  { id: "aiChats", title: "AI Chats", icon: "speech-bubble-16", collections: ["aiChats", "aiMessages"] },
  { id: "aiProviders", title: "AI Providers", icon: "computer-chip-16", collections: ["aiProviders"] },
  { id: "themes", title: "Themes", icon: "swatch-16", collections: ["themes"] },
  { id: "windowLayouts", title: "Window Layouts", icon: "app-window-16", collections: ["windowLayouts"] },
];

/** Backend collections for the selected export choices. */
export function exportCollections(selected: string[]): string[] {
  return EXPORT_CATEGORIES.filter((c) => selected.includes(c.id)).flatMap((c) => c.collections);
}

const COLLECTION_LABELS: Record<string, DataCategory> = Object.fromEntries(
  [
    ...RAYCONFIG_CATEGORIES,
    ...EXPORT_CATEGORIES,
    { id: "aiMessages", title: "AI Messages", icon: "speech-bubble-active-16" },
    { id: "clipboard", title: "Clipboard History", icon: "copy-clipboard-16" },
  ].map((c) => [c.id, { id: c.id, title: c.title, icon: c.icon }]),
);

/** `windowLayouts` → "Window Layouts" for categories this view does not know. */
function humanize(id: string): string {
  const words = id.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function categoryInfo(id: string): DataCategory {
  return COLLECTION_LABELS[id] ?? { id, title: humanize(id), icon: "box-16" };
}

/** Byte counts in Finder style (decimal units): "512 bytes", "36 KB", "4.2 MB", "1.56 GB". */
export function formatBytes(bytes: number, locale?: string): string {
  const value = Math.max(0, Math.round(bytes));
  if (value === 0) return "Zero bytes";
  if (value < 1000) return `${value} ${value === 1 ? "byte" : "bytes"}`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let scaled = value / 1000;
  let unit = 0;
  while (scaled >= 999.5 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : unit === 1 ? 1 : 2;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(scaled)} ${units[unit]}`;
}

export function formatCount(count: number, singular: string, plural = `${singular}s`, locale?: string): string {
  return `${new Intl.NumberFormat(locale).format(count)} ${count === 1 ? singular : plural}`;
}

export const MIN_PASSWORD_LENGTH = 8;

/** Optional export password: at least 8 characters and confirmed. */
export function validateExportPassword(password: string, confirmation: string): { password?: string; confirmation?: string } {
  if (!password && !confirmation) return {};
  if (password.length < MIN_PASSWORD_LENGTH) return { password: `Use at least ${MIN_PASSWORD_LENGTH} characters` };
  if (password !== confirmation) return { confirmation: "Passwords don't match" };
  return {};
}

export const OPENCAST_EXTENSION = "openconfig";
/** Accept both previous export suffixes as well as the transitional OpenCast suffix. */
export const OPENCAST_IMPORT_EXTENSIONS = [OPENCAST_EXTENSION, "opencast", "surgecast", "surgeconfig"];
export const RAYCONFIG_EXTENSION = "rayconfig";

const pad = (n: number) => String(n).padStart(2, "0");

/** `OpenCast 2026-10-13 14.05.09.openconfig` (local time, Finder-safe characters). */
export function exportFileName(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
  return `OpenCast ${day} ${time}.${OPENCAST_EXTENSION}`;
}

export function joinPath(directory: string, name: string): string {
  return `${directory.replace(/\/+$/, "")}/${name}`;
}

/** Home folder from the backend data directory (`~/Library/Application Support/OpenCast`). */
export function homeFromDataDir(dataDir: string): string | undefined {
  return /^(\/Users\/[^/]+)\//.exec(dataDir)?.[1];
}

export interface ImportSummary {
  imported: number;
  failed: number;
}

export function importSummary(results: ImportResult[]): ImportSummary {
  return { imported: results.reduce((n, r) => n + (r.error ? 0 : r.imported), 0), failed: results.filter((r) => r.error).length };
}

export type ImportField = "file" | "password" | "categories";

/** A backend import error mapped to its form field: a short field error and a longer toast message. */
export interface ImportFieldError {
  field: ImportField;
  error: string;
  message: string;
}

export function importErrorField(message: string): ImportFieldError | undefined {
  if (/requires a password/i.test(message)) return { field: "password", error: "Password required", message: "This file is encrypted. Enter its password." };
  if (/incorrect password/i.test(message)) return { field: "password", error: "Incorrect password", message: "Check the password and try again." };
  if (/select at least one category/i.test(message)) return { field: "categories", error: "Select a category", message: "Select at least one category to import." };
  if (/expected an? opencast configuration/i.test(message)) return { field: "file", error: "Not an OpenCast export", message: "Choose a file created with Export Data. Use Import Raycast Data for Raycast exports." };
  if (/use data\.import for an? opencast export/i.test(message)) return { field: "file", error: "This is an OpenCast export", message: "Use Import OpenCast Data for this file." };
  if (/configuration|no such file|ENOENT|too large|empty/i.test(message)) return { field: "file", error: "Can't read this file", message };
  return undefined;
}

/** Collections listed in Check Storage, in display order. */
const STORAGE_COLLECTIONS = ["notes", "snippets", "quicklinks", "aiChats", "aiMessages", "aiCommands", "aiPresets", "aiProviders", "themes", "windowLayouts", "commandPrefs"];

export interface StorageRow {
  id: string;
  title: string;
  icon: ImageLike;
  count: number;
}

/** Item counts: clipboard first, then known collections (zero when empty), then any others. */
export function storageRows(storage: StorageInfo): StorageRow[] {
  const ids = [...STORAGE_COLLECTIONS, ...Object.keys(storage.entities).filter((id) => !STORAGE_COLLECTIONS.includes(id) && id !== "settings").sort()];
  return [
    { ...categoryInfo("clipboard"), count: storage.clipboardItems },
    ...ids.map((id) => ({ ...categoryInfo(id), count: storage.entities[id] ?? 0 })),
  ];
}

/** Plain-text report for Copy Summary. */
export function storageSummary(storage: StorageInfo, locale?: string): string {
  const lines = [
    `Total: ${formatBytes(storage.totalBytes, locale)}`,
    `Database: ${formatBytes(storage.databaseBytes, locale)}`,
    `Clipboard images: ${formatBytes(storage.clipboardBytes, locale)}`,
    "",
    ...storageRows(storage).map((row) => `${row.title}: ${new Intl.NumberFormat(locale).format(row.count)}`),
  ];
  return lines.join("\n");
}

/** Share of the total, for the accessory ("26%"); "<1%" for tiny non-zero parts. */
export function shareOfTotal(part: number, total: number): string {
  if (total <= 0 || part <= 0) return "0%";
  const percent = (part / total) * 100;
  return percent < 1 ? "<1%" : `${Math.round(percent)}%`;
}
