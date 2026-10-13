import type { CommandInfo, ExtensionCommandManifest, ImageLike, InstalledExtension } from "@opencast/protocol";
import { errorMessage } from "../../../bridge/errors";
import { EXTENSION_FALLBACK_ICON } from "../store/model";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Commands are ids `ext:<extension>.<command>`. */
export function extensionCommandId(extensionName: string, commandName: string): string {
  return `ext:${extensionName}.${commandName}`;
}

/** An extension record synced from another Mac has no local install path until it is installed here. */
export function isInstalledHere(extension: Pick<InstalledExtension, "path">): boolean {
  return Boolean(extension.path);
}

/** `owner/name` the Store resolves for an installed Store extension. */
export function installedStoreSlug(extension: Pick<InstalledExtension, "name" | "owner" | "author">): string {
  return `${extension.owner ?? extension.author}/${extension.name}`;
}

/**
 * The manifest icon is an asset name inside the install folder; the backend
 * resolves command icons the same way. Fall back to the first command's icon.
 */
export function installedExtensionIcon(extension: Pick<InstalledExtension, "name" | "icon" | "path">, commands?: CommandInfo[]): ImageLike {
  const icon = extension.icon;
  if (icon && (SCHEME.test(icon) || icon.startsWith("/"))) return { source: icon, fallback: EXTENSION_FALLBACK_ICON };
  if (icon && extension.path) return { source: `${extension.path.replace(/\/+$/, "")}/assets/${icon}`, fallback: EXTENSION_FALLBACK_ICON };
  return commands?.find((c) => c.extensionId === extension.name)?.icon ?? EXTENSION_FALLBACK_ICON;
}

export interface ExtensionCommandRow {
  id: string;
  manifest: ExtensionCommandManifest;
  /** Effective command (alias, hotkey, enabled) when the backend lists it. */
  info?: CommandInfo;
  enabled: boolean;
  icon: ImageLike;
}

/** Manifest commands joined with their effective state from `commands.list`. */
export function extensionCommandRows(extension: InstalledExtension, commands: CommandInfo[] | undefined, fallbackIcon: ImageLike): ExtensionCommandRow[] {
  const byId = new Map((commands ?? []).map((c) => [c.id, c]));
  return extension.commands.map((manifest) => {
    const id = extensionCommandId(extension.name, manifest.name);
    const info = byId.get(id);
    return { id, manifest, info, enabled: info ? info.enabled : extension.enabled && isInstalledHere(extension) && !manifest.disabledByDefault, icon: info?.icon ?? fallbackIcon };
  });
}

/** Extension-level or per-command preferences exist. */
export function hasPreferences(extension: Pick<InstalledExtension, "preferences">, command?: Pick<ExtensionCommandManifest, "preferences">): boolean {
  return extension.preferences.length > 0 || Boolean(command?.preferences?.length);
}

export type ExtensionSource = InstalledExtension["source"];
export type ExtensionFilter = "all" | ExtensionSource;

export const EXTENSION_FILTERS: { value: ExtensionFilter; title: string; icon: string }[] = [
  { value: "all", title: "All Types", icon: "bullet-points-16" },
  { value: "store", title: "From Store", icon: "store-16" },
  { value: "local", title: "Local", icon: "folder-16" },
  { value: "development", title: "Development", icon: "hammer-16" },
];

const SECTION_TITLES: Record<ExtensionSource, string> = { store: "Store", local: "Local", development: "Development" };
const SECTION_ORDER: ExtensionSource[] = ["store", "local", "development"];

export interface ExtensionSection {
  source: ExtensionSource;
  title: string;
  extensions: InstalledExtension[];
}

/** Installed extensions grouped by where they come from, alphabetical, empty groups dropped. */
export function groupExtensions(extensions: InstalledExtension[], filter: ExtensionFilter): ExtensionSection[] {
  return SECTION_ORDER.filter((source) => filter === "all" || filter === source)
    .map((source) => ({
      source,
      title: SECTION_TITLES[source],
      extensions: extensions.filter((e) => e.source === source).sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .filter((section) => section.extensions.length > 0);
}

/** "/Users/me/Developer/x" → "~/Developer/x". */
export function tildify(path: string): string {
  return path.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
}

/** Store extensions installed on this Mac can be updated from the Store. */
export function updatableExtensions(extensions: InstalledExtension[]): InstalledExtension[] {
  return extensions.filter((e) => e.source === "store" && isInstalledHere(e));
}

export type UpdateStatus = "updated" | "skipped" | "failed";

export const UPDATE_SECTIONS: { status: UpdateStatus; title: string }[] = [
  { status: "updated", title: "Updated" },
  { status: "skipped", title: "Skipped" },
  { status: "failed", title: "Failed" },
];

export interface UpdateResult {
  extension: InstalledExtension;
  status: UpdateStatus;
  /** Shown under the title: what happened, or the error. */
  reason: string;
  /** Version after the update, when it changed. */
  newVersion?: string;
}

function updatedReason(previous: string | undefined, next: string | undefined): string {
  return previous && next && previous !== next ? `Updated from ${previous} to ${next}` : "Installed the latest version";
}

/**
 * Update extensions one at a time so each gets its own result (the backend
 * stops at the first failure when updating everything in one call).
 */
export async function runExtensionUpdates(
  extensions: InstalledExtension[],
  update: (name: string) => Promise<{ updated: string[] }>,
  onProgress?: (done: number, total: number) => void,
): Promise<UpdateResult[]> {
  const results: UpdateResult[] = [];
  for (const extension of extensions) {
    try {
      const { updated } = await update(extension.name);
      results.push(
        updated.includes(extension.name) ? { extension, status: "updated", reason: updatedReason(extension.version, undefined) } : { extension, status: "skipped", reason: "Already up to date" },
      );
    } catch (error) {
      results.push({ extension, status: "failed", reason: errorMessage(error) });
    }
    onProgress?.(results.length, extensions.length);
  }
  return results;
}

/** Fill in the versions installed by the update from a fresh `extensions.list`. */
export function withNewVersions(results: UpdateResult[], refreshed: InstalledExtension[] | undefined): UpdateResult[] {
  if (!refreshed) return results;
  const byName = new Map(refreshed.map((e) => [e.name, e]));
  return results.map((result) => {
    if (result.status !== "updated") return result;
    const next = byName.get(result.extension.name)?.version;
    return { ...result, newVersion: next, reason: updatedReason(result.extension.version, next) };
  });
}

/** Footer toast after an update run. */
export function summarizeUpdates(results: UpdateResult[]): { style: "success" | "failure"; title: string; message?: string } {
  const count = (status: UpdateStatus) => results.filter((r) => r.status === status).length;
  const updated = count("updated");
  const failed = count("failed");
  if (updated === 0 && failed === 0) return { style: "success", title: "All Extensions Are Up to Date" };
  const parts = [updated ? `${updated} updated` : "", failed ? `${failed} failed` : ""].filter(Boolean);
  return { style: failed ? "failure" : "success", title: "Update Finished", message: parts.join(", ") };
}
