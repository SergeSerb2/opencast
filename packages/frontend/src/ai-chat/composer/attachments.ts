import type { AIAttachment, WindowKind } from "@surgecast/protocol";
import { localFileUrl } from "../../icons/image-source";
import { native } from "../../bridge/native";

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", heic: "image/heic" };
const TEXT_LIMIT = 512 * 1024;
const IMAGE_LIMIT = 10 * 1024 * 1024;
const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

let counter = 0;
const attachmentId = () => `att-${Date.now().toString(36)}-${(++counter).toString(36)}`;

export function basename(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function attachmentImageUrl(attachment: AIAttachment): string | undefined {
  if (!isImageAttachment(attachment)) return undefined;
  return attachment.path ? localFileUrl(attachment.path) : attachment.url;
}

export function isImageAttachment(attachment: AIAttachment): boolean {
  return attachment.kind === "image" || attachment.kind === "screenshot" || Boolean(attachment.mimeType?.startsWith("image/"));
}

/** A local file the backend reads when the message is sent. */
export function attachmentFromPath(path: string, kind?: AIAttachment["kind"]): AIAttachment {
  const name = basename(path);
  const ext = extension(name);
  const mimeType = IMAGE_TYPES[ext] ?? (ext === "pdf" ? "application/pdf" : undefined);
  return { id: attachmentId(), kind: kind ?? (mimeType?.startsWith("image/") ? "image" : "file"), name, path, mimeType };
}

export function textAttachment(name: string, text: string, kind: AIAttachment["kind"] = "text"): AIAttachment {
  return { id: attachmentId(), kind, name, text, size: text.length };
}

/** Only recognized text formats are read inline; unknown binaries need the native picker. */
function looksLikeText(file: File): boolean {
  return file.type.startsWith("text/") || /json|xml|javascript|typescript|yaml|csv|markdown|x-sh/.test(file.type) || (!file.type && /^(txt|md|csv|tsv|json|xml|js|jsx|ts|tsx|yaml|yml|sh|py|rs|go|swift|css|html|log)$/.test(extension(file.name)));
}

/**
 * A File from a web file input, paste or drop. Web views never expose its
 * path. Images travel as inline data URLs; small text files travel as text.
 * Other binaries need the native open panel and backend extraction.
 */
export async function attachmentFromFile(file: File): Promise<AIAttachment> {
  const mimeType = file.type || IMAGE_TYPES[extension(file.name)];
  if (mimeType && INLINE_IMAGE_TYPES.has(mimeType)) {
    if (file.size > IMAGE_LIMIT) throw new Error(`“${file.name}” is larger than 10 MB.`);
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Could not read “${file.name}”.`));
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Invalid image data."));
      reader.readAsDataURL(file.type ? file : file.slice(0, file.size, mimeType));
    });
    return { id: attachmentId(), kind: "image", name: file.name, mimeType, url, size: file.size };
  }
  if (!looksLikeText(file)) throw new Error(`“${file.name}” can only be attached from the Surgecast app (use + → File…).`);
  if (file.size > TEXT_LIMIT) throw new Error(`“${file.name}” is larger than 512 KB.`);
  const text = await file.text();
  if (text.includes("\u0000")) throw new Error(`“${file.name}” is not a text file.`);
  return textAttachment(file.name, text, "file");
}

function browserFilePicker(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.addEventListener("change", () => resolve([...(input.files ?? [])]), { once: true });
    input.addEventListener("cancel", () => resolve([]), { once: true });
    input.click();
  });
}

/** Choose files with the native open panel, or a web file input outside the app. */
export async function pickFiles(): Promise<AIAttachment[]> {
  if (native.available) {
    const paths = await native.call("dialog.openFiles", { canChooseFiles: true, allowMultipleSelection: true, title: "Attach Files", prompt: "Attach" });
    return (paths ?? []).map((path) => attachmentFromPath(path));
  }
  const files = await browserFilePicker();
  return Promise.all(files.map(attachmentFromFile));
}

/** Hide `windowKind`, let the user capture the screen, and bring the window back. */
export async function captureScreenshot(mode: "interactive" | "window" | "screen", windowKind: WindowKind): Promise<AIAttachment | null> {
  await native.call("window.hide", { kind: windowKind, restoreFocus: true });
  try {
    const result = await native.call("screen.capture", { mode });
    return result ? { ...attachmentFromPath(result.path, "screenshot"), name: "Screenshot" } : null;
  } finally {
    await native.call("window.show", { kind: windowKind }).catch(() => undefined);
  }
}

/** The current clipboard as an attachment: copied files, an image, or text. */
export async function clipboardAttachments(): Promise<AIAttachment[]> {
  const snapshot = await native.call("clipboard.read");
  if (!snapshot) return [];
  const { primary } = snapshot;
  if (primary.kind === "file") return primary.paths.map((path) => attachmentFromPath(path));
  if (primary.kind === "image") {
    if (!primary.path && primary.base64) return [{ id: attachmentId(), kind: "image", name: "Clipboard Image", mimeType: "image/png", url: `data:image/png;base64,${primary.base64}` }];
    if (!primary.path) throw new Error("The copied image has no file to attach.");
    return [{ ...attachmentFromPath(primary.path, "image"), name: "Clipboard Image" }];
  }
  const text = primary.kind === "text" ? primary.text : (snapshot.text ?? "");
  return text.trim() ? [textAttachment("Clipboard", text)] : [];
}

export async function selectedTextAttachment(): Promise<AIAttachment | null> {
  const text = await native.call("input.selectedText");
  return text?.trim() ? textAttachment("Selected Text", text, "selection") : null;
}
