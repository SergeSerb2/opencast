import { showFailureToast, showToast } from "../../components/feedback/toast-store";
import { htmlDocument, markdownToHtml, markdownToPlainText } from "./convert";
import { copyToClipboard, fileNameFor, saveTextFile } from "./output";

export type NoteFormat = "markdown" | "html" | "text";

export const FORMAT_LABEL: Record<NoteFormat, string> = { markdown: "Markdown", html: "HTML", text: "Plain Text" };
const EXTENSION: Record<NoteFormat, string> = { markdown: "md", html: "html", text: "txt" };
const MIME: Record<NoteFormat, string> = { markdown: "text/markdown", html: "text/html", text: "text/plain" };

/** Copy Markdown source as Markdown, rich HTML (plain-text fallback) or plain text. */
export async function copyNoteAs(markdown: string, format: NoteFormat): Promise<void> {
  try {
    if (format === "markdown") await copyToClipboard(markdown);
    else if (format === "html") await copyToClipboard(markdownToPlainText(markdown), markdownToHtml(markdown));
    else await copyToClipboard(markdownToPlainText(markdown));
    showToast({ style: "success", title: `Copied as ${FORMAT_LABEL[format]}` });
  } catch (error) {
    showFailureToast("Failed to copy to clipboard", error);
  }
}

export async function exportNoteAs(title: string, markdown: string, format: NoteFormat): Promise<void> {
  try {
    const content = format === "markdown" ? markdown : format === "html" ? htmlDocument(title, markdownToHtml(markdown)) : markdownToPlainText(markdown);
    const result = await saveTextFile(fileNameFor(title, EXTENSION[format]), content.endsWith("\n") ? content : `${content}\n`, MIME[format]);
    if (result !== "cancelled") showToast({ style: "success", title: `Exported as ${FORMAT_LABEL[format]}` });
  } catch (error) {
    showFailureToast("Could not export note", error);
  }
}
