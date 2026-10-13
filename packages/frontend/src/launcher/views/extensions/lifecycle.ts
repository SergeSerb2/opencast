import type { ImageLike, InstalledExtension } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { native } from "../../../bridge/native";
import { confirmAlert, showFailureToast, showToast } from "../../../components";
import { useNavigationStore } from "../../navigation";
import { installedStoreSlug } from "./model";

/** Install (or reinstall) a Store extension with an animated toast. */
export async function installStoreExtension(listing: { slug: string; title: string }): Promise<void> {
  const toast = showToast({ style: "animated", title: "Installing Extension…", message: listing.title });
  try {
    const installed = await backend.call("extensions.install", { source: "store", idOrSlug: listing.slug }, { timeoutMs: 180_000 });
    toast.update({ style: "success", title: "Extension Installed", message: installed.title });
  } catch (error) {
    showFailureToast("Could not install extension", error);
  }
}

/** Confirm, then uninstall with an animated toast. */
export async function uninstallExtension(extension: Pick<InstalledExtension, "name" | "title" | "source">, icon?: ImageLike): Promise<void> {
  const confirmed = await confirmAlert({
    title: `Uninstall “${extension.title}”?`,
    message:
      extension.source === "development" ? "Its commands and preferences are removed. The source folder stays where it is." : "Its commands, preferences and saved data are removed from this Mac.",
    icon,
    primaryAction: { title: "Uninstall", style: "destructive" },
  });
  if (!confirmed) return;
  const toast = showToast({ style: "animated", title: "Uninstalling Extension…", message: extension.title });
  try {
    await backend.call("extensions.uninstall", { name: extension.name });
    toast.update({ style: "success", title: "Extension Uninstalled", message: extension.title });
  } catch (error) {
    showFailureToast("Could not uninstall extension", error);
  }
}

export async function setExtensionEnabled(extension: Pick<InstalledExtension, "name" | "title">, enabled: boolean): Promise<void> {
  try {
    await backend.call("extensions.setEnabled", { name: extension.name, enabled });
    showToast({ style: "success", title: enabled ? "Extension Enabled" : "Extension Disabled", message: extension.title });
  } catch (error) {
    showFailureToast(enabled ? "Could not enable extension" : "Could not disable extension", error);
  }
}

export async function setCommandEnabled(command: { id: string; title: string }, enabled: boolean): Promise<void> {
  try {
    await backend.call("commands.setPrefs", { id: command.id, prefs: { enabled } });
    showToast({ style: "success", title: enabled ? "Command Enabled" : "Command Disabled", message: command.title });
  } catch (error) {
    showFailureToast(enabled ? "Could not enable command" : "Could not disable command", error);
  }
}

/** Push the generated preferences form (`extension.preferences`) for an extension or one of its commands. */
export function openExtensionPreferences(extension: Pick<InstalledExtension, "name" | "title">, icon: ImageLike, command?: { name: string; title: string }): void {
  useNavigationStore.getState().push({
    kind: "builtin",
    view: { id: "extension.preferences", title: `${extension.title} Preferences`, props: { extensionName: extension.name, commandName: command?.name } },
    title: command ? `${command.title} Preferences` : `${extension.title} Preferences`,
    icon,
  });
}

/** Store page of an installed Store extension (looked up so self-hosted store mirrors keep working). */
export async function fetchStoreUrl(extension: Pick<InstalledExtension, "name" | "owner" | "author">): Promise<string> {
  const listing = await backend.call("extensions.store.get", { idOrSlug: installedStoreSlug(extension) });
  return listing.storeUrl;
}

async function pickExtensionFolder(title: string, prompt: string): Promise<string | null> {
  try {
    const paths = await native.call("dialog.openFiles", { canChooseFiles: false, canChooseDirectories: true, allowMultipleSelection: false, title, prompt });
    return paths?.[0] ?? null;
  } catch (error) {
    showFailureToast("Could not open the folder picker", error);
    return null;
  }
}

/** Copy a built extension folder into OpenCast (`source: "local"`). */
export async function importLocalExtension(): Promise<void> {
  const path = await pickExtensionFolder("Select Extension to Import", "Import");
  if (!path) return;
  const toast = showToast({ style: "animated", title: "Importing Extension…" });
  try {
    const installed = await backend.call("extensions.install", { source: "local", path }, { timeoutMs: 120_000 });
    toast.update({ style: "success", title: "Extension Imported", message: installed.title });
  } catch (error) {
    showFailureToast("Could not import extension", error);
  }
}

/** Run an extension from its source folder; the backend reloads it when the build output changes. */
export async function developLocalExtension(): Promise<void> {
  const path = await pickExtensionFolder("Select Extension Folder", "Develop");
  if (!path) return;
  const toast = showToast({ style: "animated", title: "Starting Development…" });
  try {
    const installed = await backend.call("extensions.develop", { path }, { timeoutMs: 120_000 });
    toast.update({ style: "success", title: "Development Started", message: `${installed.title} reloads when its build changes` });
  } catch (error) {
    showFailureToast("Could not start development", error);
  }
}

/** Update one Store extension and report the outcome in a toast. */
export async function updateExtension(extension: Pick<InstalledExtension, "name" | "title">): Promise<void> {
  const toast = showToast({ style: "animated", title: "Checking for Updates…", message: extension.title });
  try {
    const { updated } = await backend.call("extensions.update", { name: extension.name }, { timeoutMs: 180_000 });
    toast.update(
      updated.includes(extension.name) ? { style: "success", title: "Extension Updated", message: extension.title } : { style: "success", title: "Already Up to Date", message: extension.title },
    );
  } catch (error) {
    showFailureToast("Could not update extension", error);
  }
}

/** Open the Store view on top of the current one, optionally searching for `query`. */
export function openStore(query?: string): void {
  useNavigationStore.getState().push({ kind: "builtin", view: { id: "store", title: "Store", props: { query } }, title: "Store", icon: "store-16" });
}
