import { create } from "zustand";
import type { AIMessage, AIStreamEvent } from "@surgecast/protocol";
import { backend } from "../../bridge/backend";
import { createLiveStream, reasoningDurationMs, reduceStream, type LiveStream } from "../model/stream";
import { rememberReasoningDuration } from "./reasoning-durations";

interface StreamsState {
  streams: Record<string, LiveStream>;
}

/** Live `ai.stream` state for every stream this window has seen, keyed by stream id. */
export const useStreams = create<StreamsState>(() => ({ streams: {} }));

/** Finished streams stay around long enough for the stored message to catch up. */
const KEEP_FINISHED_MS = 120_000;

let pending: AIStreamEvent[] = [];
let frame: number | null = null;
let installed = false;

function apply(events: AIStreamEvent[]): void {
  if (!events.length) return;
  const now = Date.now();
  useStreams.setState((state) => {
    const streams = { ...state.streams };
    for (const event of events) {
      const before = streams[event.streamId];
      const after = reduceStream(before, event, now);
      streams[event.streamId] = after;
      if (before?.status === "streaming" && after.status !== "streaming" && after.messageId) {
        const duration = reasoningDurationMs(after);
        if (duration !== undefined) rememberReasoningDuration(after.messageId, duration);
      }
    }
    for (const [id, stream] of Object.entries(streams)) if (stream.endedAt && now - stream.endedAt > KEEP_FINISHED_MS) delete streams[id];
    return { streams };
  });
}

function flush(): void {
  frame = null;
  const events = pending;
  pending = [];
  apply(events);
}

/**
 * Deltas are coalesced per animation frame so long answers re-render at
 * display rate; structural events (start, tools, done, error) apply at once,
 * after any queued deltas, to keep their order.
 */
export function receiveStreamEvent(event: AIStreamEvent): void {
  pending.push(event);
  if (event.type === "text" || event.type === "reasoning") {
    if (frame === null) frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(flush) : (setTimeout(flush, 16) as unknown as number);
    return;
  }
  if (frame !== null) {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    else clearTimeout(frame);
  }
  flush();
}

/** Subscribe the window to `ai.stream` once. */
export function installStreamListener(): void {
  if (installed) return;
  installed = true;
  backend.on("ai.stream", receiveStreamEvent);
}

/** Record what a just-started stream writes to (from the `ai.chats.send` / `ai.ask` result). */
export function registerStream(streamId: string, init: Partial<Pick<LiveStream, "chatId" | "messageId" | "model">>): void {
  useStreams.setState((state) => {
    const existing = state.streams[streamId];
    const stream = existing ? { ...existing, chatId: existing.chatId ?? init.chatId, messageId: existing.messageId ?? init.messageId, model: existing.model ?? init.model } : createLiveStream(streamId, Date.now(), init);
    return { streams: { ...state.streams, [streamId]: stream } };
  });
}

/** A refetch can observe completion even if its stream event was lost during a disconnect. */
export function reconcileStreams(messages: AIMessage[]): void {
  const terminal = new Map(messages.filter((m) => m.role === "assistant" && m.status !== "streaming").map((m) => [m.id, m]));
  useStreams.setState((state) => {
    let streams = state.streams;
    for (const stream of Object.values(state.streams)) {
      const message = stream.messageId ? terminal.get(stream.messageId) : undefined;
      if (stream.status !== "streaming" || !message || message.chatId !== stream.chatId) continue;
      if (streams === state.streams) streams = { ...streams };
      streams[stream.streamId] = {
        ...stream,
        status: message.status === "complete" ? "done" : message.status === "error" ? "error" : "stopped",
        endedAt: Date.now(),
      };
    }
    return streams === state.streams ? state : { streams };
  });
}

/** Streams writing to `chatId`, newest first. */
export function streamsForChat(streams: Record<string, LiveStream>, chatId: string | undefined): LiveStream[] {
  if (!chatId) return [];
  return Object.values(streams)
    .filter((s) => s.chatId === chatId)
    .sort((a, b) => b.startedAt - a.startedAt);
}
