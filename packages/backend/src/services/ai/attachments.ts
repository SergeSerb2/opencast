import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { inflateSync } from "node:zlib";
import type { AIAttachment, AIModel, AIProvider } from "@opencast/protocol";
import type { AIChatTurn } from "../../context";
import { abortSignal } from "./common";
import { publicPageAgent, readPage } from "./web";
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
function fileMimeType(attachment: AIAttachment): string {
  const extension = extname(attachment.path ?? attachment.name).toLowerCase();
  return attachment.mimeType ?? imageTypes[extension] ?? (extension === ".pdf" ? "application/pdf" : "text/plain");
}
async function localFile(attachment: AIAttachment, signal?: AbortSignal): Promise<Buffer> {
  const info = await stat(attachment.path!);
  if (!info.isFile() || info.size > 20 * 1024 * 1024)
    throw new Error(`Attachment ${attachment.name} must be a file smaller than 20 MiB`);
  const data = await readFile(attachment.path!, { signal });
  if (data.length > 20 * 1024 * 1024) throw new Error(`Attachment ${attachment.name} must be smaller than 20 MiB`);
  return data;
}
export async function snapshotAttachments(attachments: AIAttachment[], signal?: AbortSignal): Promise<AIAttachment[]> {
  return Promise.all(attachments.map(async attachment => {
    if (!attachment.path || attachment.text !== undefined || attachment.snapshot) return attachment;
    const data = await localFile(attachment, signal);
    return { ...attachment, snapshot: { data: data.toString("base64"), mimeType: fileMimeType(attachment) } };
  }));
}
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
          if (Buffer.byteLength(attachment.text) > 512 * 1024)
            throw new Error("Text attachments must be smaller than 512 KiB");
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
        if (attachment.kind === "image" && attachment.url && !attachment.path && !attachment.snapshot) {
          if (!model.capabilities.vision)
            throw new Error(`Model ${model.name} does not support image attachments`);
          let mimeType: string, data: string;
          if (attachment.url.startsWith("data:")) {
            const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(attachment.url);
            if (!match || match[2].length > Math.ceil(10 * 1024 * 1024 / 3) * 4)
              throw new Error("Image attachments require a PNG, JPEG, GIF or WebP data URL smaller than 10 MiB");
            const bytes = Buffer.from(match[2], "base64");
            if (!bytes.length || bytes.length > 10 * 1024 * 1024 || bytes.toString("base64") !== match[2])
              throw new Error("Invalid image attachment data");
            mimeType = match[1]; data = match[2];
          } else {
            const requestSignal = abortSignal(signal, 30_000);
            const dispatcher = await publicPageAgent(attachment.url, requestSignal);
            try {
              const response = await fetch(attachment.url, {
                dispatcher: dispatcher as unknown as RequestInit["dispatcher"],
                signal: requestSignal,
                redirect: "error",
              });
              mimeType = response.headers.get("content-type")?.split(";")[0] ?? "";
              if (!response.ok || !/^image\/(?:png|jpeg|gif|webp)$/.test(mimeType) || !response.body || Number(response.headers.get("content-length")) > 10 * 1024 * 1024) {
                await response.body?.cancel();
                throw new Error("Remote image must be a PNG, JPEG, GIF or WebP smaller than 10 MiB");
              }
              const reader = response.body.getReader(), chunks: Uint8Array[] = [];
              let size = 0;
              try {
                while (true) {
                  const { value, done } = await reader.read();
                  if (done) break;
                  size += value.length;
                  if (size > 10 * 1024 * 1024) throw new Error("Remote image exceeds 10 MiB");
                  chunks.push(value);
                }
              } finally { await reader.cancel(); }
              if (!size) throw new Error("Remote image is empty");
              data = Buffer.concat(chunks).toString("base64");
            } finally { await dispatcher.close(); }
          }
          parts.push({ type: "image", mimeType, data, name: attachment.name });
          continue;
        }
        if (!attachment.path && !attachment.snapshot)
          throw new Error(`Attachment ${attachment.name} has no content or local path`);
        if (attachment.snapshot && attachment.snapshot.data.length > Math.ceil(20 * 1024 * 1024 / 3) * 4)
          throw new Error(`Attachment ${attachment.name} snapshot exceeds 20 MiB`);
        const data = attachment.snapshot ? Buffer.from(attachment.snapshot.data, "base64") : await localFile(attachment, signal);
        const mimeType = attachment.snapshot?.mimeType ?? fileMimeType(attachment);
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
