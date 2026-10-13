import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { inflateSync } from "node:zlib";
import type { AIModel, AIProvider } from "@surgecast/protocol";
import type { AIChatTurn } from "../../context";
import { readPage } from "./web";
export type Part =
  | { type: "text"; text: string }
  | { type: "image" | "pdf"; mimeType: string; data: string; name: string };
export interface PreparedTurn extends AIChatTurn {
  parts: Part[];
}
const imageTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
/** Only decode trivial text PDFs; never pretend a scanned/encrypted document was read. */
export function trivialPdfText(data: Buffer): string {
  const source = data.toString("latin1");
  if (/\/Encrypt\b/.test(source))
    throw new Error("Encrypted PDFs must be unlocked before attaching");
  const chunks: string[] = [source];
  for (const m of source.matchAll(
    /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/gs,
  )) {
    if (/FlateDecode/.test(m[1])) {
      try {
        chunks.push(
          inflateSync(Buffer.from(m[2], "latin1"), {
            maxOutputLength: 16 * 1024 * 1024,
          }).toString("latin1"),
        );
      } catch {
        /* unsupported compressed stream */
      }
    } else chunks.push(m[2]);
  }
  const lines: string[] = [];
  for (const chunk of chunks)
    for (const block of chunk.matchAll(/BT\b([\s\S]*?)\bET/g)) {
      for (const m of block[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g))
        lines.push(
          m[1]
            .replace(
              /\\([nrtbf()\\])/g,
              (_, c) =>
                ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" })[
                  c as string
                ] ?? c,
            )
            .replace(/\\([0-7]{1,3})/g, (_, oct) =>
              String.fromCharCode(parseInt(oct, 8)),
            ),
        );
    }
  const text = lines.join(" ").trim();
  if (!text || /\/ToUnicode\b/.test(source))
    throw new Error(
      "This PDF needs a document-capable model (Responses API, Anthropic or Gemini), or attach its extracted text instead",
    );
  return text;
}
export async function prepareTurns(
  turns: AIChatTurn[],
  provider: AIProvider,
  model: AIModel,
  signal?: AbortSignal,
): Promise<PreparedTurn[]> {
  return Promise.all(
    turns.map(async (turn) => {
      const parts: Part[] = turn.content
        ? [{ type: "text", text: turn.content }]
        : [];
      for (const attachment of turn.attachments ?? []) {
        signal?.throwIfAborted();
        if (attachment.text !== undefined) {
          parts.push({
            type: "text",
            text: `\n--- ${attachment.name} ---\n${attachment.text}`,
          });
          continue;
        }
        if (attachment.kind === "url" && attachment.url) {
          const page = await readPage(attachment.url, "text", signal);
          parts.push({
            type: "text",
            text: `\n--- ${page.title}\n${attachment.url} ---\n${page.content}`,
          });
          continue;
        }
        if (!attachment.path)
          throw new Error(
            `Attachment ${attachment.name} has no content or local path`,
          );
        const info = await stat(attachment.path);
        if (!info.isFile() || info.size > 20 * 1024 * 1024)
          throw new Error(
            `Attachment ${attachment.name} must be a file smaller than 20 MiB`,
          );
        const data = await readFile(attachment.path, { signal });
        const mimeType =
          attachment.mimeType ??
          imageTypes[extname(attachment.path).toLowerCase()] ??
          (extname(attachment.path).toLowerCase() === ".pdf"
            ? "application/pdf"
            : "text/plain");
        if (mimeType.startsWith("image/")) {
          if (!model.capabilities.vision)
            throw new Error(
              `Model ${model.name} does not support image attachments`,
            );
          parts.push({
            type: "image",
            mimeType,
            data: data.toString("base64"),
            name: attachment.name,
          });
        } else if (mimeType === "application/pdf") {
          if (
            (provider.api === "anthropic" ||
              provider.api === "google" ||
              provider.api === "openai-responses") &&
            model.capabilities.pdf !== false
          )
            parts.push({
              type: "pdf",
              mimeType,
              data: data.toString("base64"),
              name: attachment.name,
            });
          else
            parts.push({
              type: "text",
              text: `\n--- ${attachment.name} ---\n${trivialPdfText(data)}`,
            });
        } else {
          if (data.includes(0))
            throw new Error(
              `Cannot extract text from binary attachment ${attachment.name}`,
            );
          let text: string;
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(data);
          } catch {
            throw new Error(`Attachment ${attachment.name} is not UTF-8 text`);
          }
          parts.push({
            type: "text",
            text: `\n--- ${attachment.name} ---\n${text}`,
          });
        }
      }
      return { ...turn, parts };
    }),
  );
}
