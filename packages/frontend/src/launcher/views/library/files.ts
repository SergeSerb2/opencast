import { RpcErrorCode } from "@opencast/protocol";
import { RpcError } from "../../../bridge/errors";
import { native } from "../../../bridge/native";
import { localFileUrl } from "../../../icons/image-source";

function isNativeUnavailable(error: unknown): boolean {
  return error instanceof RpcError && error.code === RpcErrorCode.NativeUnavailable;
}

/** Browser fallback: a temporary file input. Resolves null when the user cancels. */
function pickWithInput(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) resolve(null);
      else file.text().then((text) => resolve({ name: file.name, text }), reject);
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/** Ask for a JSON file and read it: native open panel in the app, a file input in the browser. */
export async function pickJsonFile(title: string): Promise<{ name: string; text: string } | null> {
  let paths: string[] | null;
  try {
    paths = await native.call("dialog.openFiles", { canChooseFiles: true, canChooseDirectories: false, allowMultipleSelection: false, allowedTypes: ["json"], title, prompt: "Select file" });
  } catch (error) {
    if (isNativeUnavailable(error)) return pickWithInput(".json,application/json");
    throw error;
  }
  const path = paths?.[0];
  if (!path) return null;
  const response = await fetch(localFileUrl(path));
  if (!response.ok) throw new Error(`Could not read ${path}`);
  return { name: path.slice(path.lastIndexOf("/") + 1), text: await response.text() };
}

/** AppleScript string literal for arbitrary text. */
export function appleScriptString(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** "Snippets 2026-10-13 09.41.05.json" in local time. */
export function exportFileName(prefix: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix} ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}.json`;
}

/**
 * Save text into a folder the user picks (the host has no save panel; the file
 * is written with AppleScript's file commands). In the browser it downloads.
 * Resolves the written path, "downloaded", or null when cancelled.
 */
export async function saveTextFile(options: { title: string; fileName: string; text: string }): Promise<string | "downloaded" | null> {
  let folders: string[] | null;
  try {
    folders = await native.call("dialog.openFiles", { canChooseFiles: false, canChooseDirectories: true, allowMultipleSelection: false, title: options.title, prompt: "Export" });
  } catch (error) {
    if (!isNativeUnavailable(error)) throw error;
    const url = URL.createObjectURL(new Blob([options.text], { type: options.fileName.endsWith(".json") ? "application/json" : "text/plain;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: options.fileName });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "downloaded";
  }
  const folder = folders?.[0];
  if (!folder) return null;
  const path = `${folder.replace(/\/+$/, "")}/${options.fileName}`;
  const script = [
    `set targetFile to open for access (POSIX file ${appleScriptString(path)}) with write permission`,
    "try",
    "  set eof targetFile to 0",
    `  write ${appleScriptString(options.text)} to targetFile as «class utf8»`,
    "  close access targetFile",
    "on error message",
    "  close access targetFile",
    "  error message",
    "end try",
  ].join("\n");
  await native.call("system.runAppleScript", { script });
  return path;
}
