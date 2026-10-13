import { generateHTML, type AnyExtension, type JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { createNoteExtensions } from "../editor/extensions";
import { titleFromText } from "./text";

/**
 * Conversions between stored Markdown and the formats Notes copies and
 * exports, using the same schema as the editor.
 */

let extensions: AnyExtension[] | null = null;
let manager: MarkdownManager | null = null;

function markdown(): { manager: MarkdownManager; extensions: AnyExtension[] } {
  extensions ??= createNoteExtensions();
  manager ??= new MarkdownManager({ extensions, indentation: { style: "space", size: 2 } });
  return { manager, extensions };
}

export function markdownToDoc(source: string): JSONContent {
  return markdown().manager.parse(source);
}

export function docToMarkdown(doc: JSONContent): string {
  return markdown().manager.serialize(doc);
}

export function markdownToHtml(source: string): string {
  const { extensions: all } = markdown();
  return generateHTML(markdownToDoc(source), all);
}

function inlineText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineText).join("");
}

/** Text of a block without Markdown syntax; list items keep readable markers. */
function blockLines(node: JSONContent, indent: string): string[] {
  const children = node.content ?? [];
  switch (node.type) {
    case "paragraph":
    case "heading":
    case "codeBlock":
      return inlineText(node)
        .split("\n")
        .map((line) => indent + line);
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;
      return children.flatMap((item, index) => {
        const marker = node.type === "bulletList" ? "- " : node.type === "orderedList" ? `${start + index}. ` : item.attrs?.checked ? "[x] " : "[ ] ";
        const [first = "", ...rest] = (item.content ?? []).flatMap((child) => blockLines(child, ""));
        return [indent + marker + first, ...rest.map((line) => indent + " ".repeat(marker.length) + line)];
      });
    }
    case "blockquote":
      return children.flatMap((child) => blockLines(child, indent));
    case "horizontalRule":
      return [indent + "---"];
    default:
      return children.flatMap((child) => blockLines(child, indent));
  }
}

export function docToPlainText(doc: JSONContent): string {
  return (doc.content ?? []).flatMap((block) => blockLines(block, "")).join("\n");
}

export function markdownToPlainText(source: string): string {
  return docToPlainText(markdownToDoc(source));
}

/** Header title for stored Markdown: the first line of the first block. */
export function titleFromMarkdown(source: string): string {
  const first = markdownToDoc(source).content?.[0];
  return titleFromText(first ? inlineText(first) : "");
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);
}

/** A standalone HTML file for "Export… → HTML". */
export function htmlDocument(title: string, body: string): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    "<style>body{font:15px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;max-width:720px;margin:40px auto;padding:0 24px}pre{background:#f4f4f5;padding:12px;border-radius:8px;overflow-x:auto}code{font-family:ui-monospace,Menlo,monospace}blockquote{margin-left:0;padding-left:12px;border-left:2px solid #ccc}ul[data-type=taskList]{list-style:none;padding-left:0}</style>",
    "</head>",
    `<body>${body}</body>`,
    "</html>",
    "",
  ].join("\n");
}
