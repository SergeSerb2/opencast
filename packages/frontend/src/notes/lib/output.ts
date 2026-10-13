import { RpcErrorCode } from "@opencast/protocol";
import { RpcError } from "../../bridge/errors";
import { native } from "../../bridge/native";
import { getEnv } from "../../bridge/env";

export async function copyToClipboard(text: string, html?: string): Promise<void> {
  await native.call("clipboard.write", { content: { kind: "text", text, ...(html ? { html } : {}) } });
}

function download(fileName: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save a text file through the host's save panel; without one (browser, or a
 * host that lacks `dialog.saveFile`) the file is downloaded instead.
 */
export async function saveTextFile(fileName: string, content: string, mimeType: string): Promise<"saved" | "cancelled" | "downloaded"> {
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1) : undefined;
  try {
    const path = await native.call("dialog.saveFile", { suggestedName: fileName, content, allowedTypes: extension ? [extension] : undefined, title: "Export Note" });
    return path ? "saved" : "cancelled";
  } catch (error) {
    const unsupported = error instanceof RpcError && (error.code === RpcErrorCode.NativeUnavailable || error.code === RpcErrorCode.MethodNotFound);
    if (!unsupported) throw error;
    if (getEnv().native) throw new Error("Export requires an OpenCast host with dialog.saveFile support.");
  }
  download(fileName, content, mimeType);
  return "downloaded";
}

/** A file name from a note title (no path separators or control characters). */
export function fileNameFor(title: string, extension: string): string {
  const base =
    title
      .replace(/[/\\:*?"<>|\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Note";
  return `${base}.${extension}`;
}
