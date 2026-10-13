import { abortable, abortSignal } from "./common";

export interface SSEFrame {
  data: string;
  event?: string;
  id?: string;
}
/** Incremental UTF-8/line parser. CRLF can be split across network chunks. */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SSEFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    data: string[] = [],
    event: string | undefined,
    id: string | undefined;
  let dataLength = 0;
  const line = (text: string): SSEFrame | undefined => {
    if (!text) {
      const frame = data.length
        ? { data: data.join("\n"), event, id }
        : undefined;
      data = [];
      dataLength = 0;
      event = undefined;
      return frame;
    }
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") {
      dataLength += value.length;
      if (dataLength > 8 * 1024 * 1024)
        throw new Error("Provider SSE frame exceeds 8 MiB");
      data.push(value);
    }
    if (field === "event") event = value;
    if (field === "id" && !value.includes("\0")) id = value;
  };
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const result = await abortable(
        reader.read(),
        abortSignal(signal, 60_000),
      );
      signal?.throwIfAborted();
      buffer += decoder.decode(result.value, { stream: !result.done });
      if (buffer.length > 8 * 1024 * 1024)
        throw new Error("Provider SSE frame exceeds 8 MiB");
      let at: number;
      while ((at = buffer.search(/[\r\n]/)) >= 0) {
        if (buffer[at] === "\r" && at === buffer.length - 1 && !result.done)
          break;
        const width = buffer[at] === "\r" && buffer[at + 1] === "\n" ? 2 : 1;
        const frame = line(buffer.slice(0, at));
        buffer = buffer.slice(at + width);
        if (frame) yield frame;
      }
      if (result.done) {
        if (buffer) line(buffer);
        const frame = line("");
        if (frame) yield frame;
        break;
      }
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
