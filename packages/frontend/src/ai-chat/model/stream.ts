import type { AIMessage, AIStreamEvent, AIToolCall, ModelRef } from "@surgecast/protocol";

/** Client-side state of one running (or just finished) `ai.stream`. */
export interface LiveStream {
  streamId: string;
  chatId?: string;
  messageId?: string;
  model?: ModelRef;
  text: string;
  reasoning: string;
  toolCalls: AIToolCall[];
  status: "streaming" | "done" | "error" | "stopped";
  error?: { message: string; status?: number };
  usage?: AIMessage["usage"];
  finishReason?: string;
  startedAt: number;
  /** Joined mid-stream (another window started it): the text lacks its beginning. */
  partial?: boolean;
  /** First reasoning delta and the moment reasoning gave way to output. */
  reasoningStartedAt?: number;
  reasoningEndedAt?: number;
  endedAt?: number;
}

export function createLiveStream(streamId: string, now: number, init: Partial<Pick<LiveStream, "chatId" | "messageId" | "model">> = {}): LiveStream {
  return { streamId, text: "", reasoning: "", toolCalls: [], status: "streaming", startedAt: now, ...init };
}

function upsertCall(calls: AIToolCall[], call: AIToolCall): AIToolCall[] {
  const index = calls.findIndex((c) => c.id === call.id);
  if (index === -1) return [...calls, call];
  const next = calls.slice();
  next[index] = { ...calls[index], ...call };
  return next;
}

/** Reasoning ends as soon as anything else is produced. */
function endReasoning(stream: LiveStream, now: number): LiveStream {
  return stream.reasoningStartedAt !== undefined && stream.reasoningEndedAt === undefined ? { ...stream, reasoningEndedAt: now } : stream;
}

/**
 * Apply one `ai.stream` event. Pure: returns a new object when anything
 * changed. Events after the stream finished are ignored, except a late
 * title (titles arrive after `done` on the real backend and carry no state here).
 */
export function reduceStream(previous: LiveStream | undefined, event: AIStreamEvent, now: number): LiveStream {
  const stream = previous ?? { ...createLiveStream(event.streamId, now), partial: event.type !== "start" };
  if (stream.status !== "streaming") return stream;
  switch (event.type) {
    case "start":
      return { ...stream, status: "streaming", chatId: event.chatId ?? stream.chatId, messageId: event.messageId ?? stream.messageId, model: event.model || stream.model };
    case "text":
      return { ...endReasoning(stream, now), text: stream.text + event.delta };
    case "reasoning":
      return { ...stream, reasoning: stream.reasoning + event.delta, reasoningStartedAt: stream.reasoningStartedAt ?? now };
    case "tool-call":
    case "tool-result":
      return { ...endReasoning(stream, now), toolCalls: upsertCall(stream.toolCalls, event.call) };
    case "title":
      return stream;
    case "done": {
      const ended = endReasoning(stream, now);
      return { ...ended, status: event.finishReason === "stopped" ? "stopped" : "done", usage: event.usage ?? stream.usage, finishReason: event.finishReason, endedAt: now };
    }
    case "error":
      return { ...endReasoning(stream, now), status: "error", error: { message: event.message, status: event.status }, endedAt: now };
  }
}

export function reasoningDurationMs(stream: LiveStream): number | undefined {
  if (stream.reasoningStartedAt === undefined) return undefined;
  const end = stream.reasoningEndedAt ?? stream.endedAt;
  return end === undefined ? undefined : Math.max(0, end - stream.reasoningStartedAt);
}

const STATUS: Record<LiveStream["status"], AIMessage["status"]> = { streaming: "streaming", done: "complete", error: "error", stopped: "stopped" };

/**
 * Overlay a live stream on the stored assistant message it writes to. The
 * backend persists streaming messages in batches, so the live text is newer
 * while it is longer; once the stored copy has caught up it wins.
 */
export function withLiveStream(message: AIMessage, live: LiveStream | undefined): AIMessage {
  if (!live || live.messageId !== message.id) return message;
  if (live.partial) return {
    ...message,
    toolCalls: live.toolCalls.length ? [...new Map([...(message.toolCalls ?? []), ...live.toolCalls].map((call) => [call.id, call])).values()] : message.toolCalls,
    status: live.status === "streaming" ? message.status : STATUS[live.status],
    error: live.error?.message ?? message.error,
    usage: live.usage ?? message.usage,
  };
  const storedDone = message.status !== "streaming";
  if (storedDone && live.status !== "streaming" && message.content.length >= live.text.length) return message;
  return {
    ...message,
    content: live.text.length >= message.content.length ? live.text : message.content,
    reasoning: live.reasoning.length >= (message.reasoning?.length ?? 0) ? live.reasoning || message.reasoning : message.reasoning,
    toolCalls: live.toolCalls.length ? live.toolCalls : message.toolCalls,
    model: live.model ?? message.model,
    status: live.status === "streaming" ? "streaming" : storedDone ? message.status : STATUS[live.status],
    error: live.error?.message ?? message.error,
    usage: live.usage ?? message.usage,
  };
}
