import { describe, expect, it } from "vitest";
import type { AIMessage, AIStreamEvent, AIToolCall } from "@opencast/protocol";
import { createLiveStream, reasoningDurationMs, reduceStream, withLiveStream, type LiveStream } from "../ai-chat/model/stream";

const run = (events: AIStreamEvent[], start = 0, initial?: LiveStream): LiveStream => events.reduce<LiveStream | undefined>((s, e, i) => reduceStream(s, e, start + i * 100), initial) as LiveStream;

const call = (status: AIToolCall["status"], extra: Partial<AIToolCall> = {}): AIToolCall => ({ id: "t1", name: "web.search", arguments: { query: "x" }, status, ...extra });

describe("reduceStream", () => {
  it("accumulates text and reasoning and records where it writes", () => {
    const s = run([
      { type: "start", streamId: "s", chatId: "c", messageId: "m", model: "openai/gpt" },
      { type: "reasoning", streamId: "s", delta: "Let me " },
      { type: "reasoning", streamId: "s", delta: "think." },
      { type: "text", streamId: "s", delta: "Hello" },
      { type: "text", streamId: "s", delta: " world" },
      { type: "done", streamId: "s", usage: { outputTokens: 2 }, finishReason: "stop" },
    ]);
    expect(s).toMatchObject({ chatId: "c", messageId: "m", model: "openai/gpt", text: "Hello world", reasoning: "Let me think.", status: "done", usage: { outputTokens: 2 } });
    expect(s.partial).toBe(false);
    // Reasoning ran from the first reasoning delta (t=100) to the first text (t=300).
    expect(reasoningDurationMs(s)).toBe(200);
  });

  it("updates tool calls in place by id", () => {
    const s = run([
      { type: "start", streamId: "s", model: "m" },
      { type: "tool-call", streamId: "s", call: call("awaiting-confirmation") },
      { type: "tool-call", streamId: "s", call: call("running") },
      { type: "tool-result", streamId: "s", call: call("done", { result: { ok: true } }) },
    ]);
    expect(s.toolCalls).toEqual([call("done", { result: { ok: true } })]);
  });

  it("marks stops, errors and ignores events after the end", () => {
    const stopped = run([{ type: "start", streamId: "s", model: "m" }, { type: "text", streamId: "s", delta: "Hi" }, { type: "done", streamId: "s", finishReason: "stopped" }, { type: "text", streamId: "s", delta: " late" }]);
    expect(stopped).toMatchObject({ status: "stopped", text: "Hi" });
    const failed = run([{ type: "start", streamId: "s", model: "m" }, { type: "error", streamId: "s", message: "401 Unauthorized", status: 401 }]);
    expect(failed).toMatchObject({ status: "error", error: { message: "401 Unauthorized", status: 401 } });
  });

  it("flags streams joined midway", () => {
    expect(reduceStream(undefined, { type: "text", streamId: "s", delta: "…tail" }, 0).partial).toBe(true);
    expect(reduceStream(createLiveStream("s", 0, { chatId: "c" }), { type: "text", streamId: "s", delta: "x" }, 1).partial).toBeUndefined();
  });
});

describe("withLiveStream", () => {
  const stored: AIMessage = { id: "m", chatId: "c", role: "assistant", content: "Hel", status: "streaming", createdAt: 0, updatedAt: 0 };
  const live = run([{ type: "start", streamId: "s", chatId: "c", messageId: "m", model: "x" }, { type: "text", streamId: "s", delta: "Hello" }]);

  it("shows the newer live text while streaming", () => {
    expect(withLiveStream(stored, live)).toMatchObject({ content: "Hello", status: "streaming" });
  });

  it("lets the stored copy win once it has caught up", () => {
    const done = reduceStream(live, { type: "done", streamId: "s" }, 1000);
    const complete = { ...stored, content: "Hello", status: "complete" as const };
    expect(withLiveStream(complete, done)).toBe(complete);
    expect(withLiveStream(stored, done)).toMatchObject({ content: "Hello", status: "complete" });
  });

  it("trusts terminal stored messages even if the completion event was missed", () => {
    const complete = { ...stored, status: "complete" as const };
    expect(withLiveStream(complete, live)).toBe(complete);
    expect(withLiveStream(complete, { ...live, partial: true })).toBe(complete);
  });

  it("ignores streams for other messages and partial streams", () => {
    expect(withLiveStream({ ...stored, id: "other" }, live).content).toBe("Hel");
    expect(withLiveStream(stored, { ...live, partial: true }).content).toBe("Hel");
  });
});
