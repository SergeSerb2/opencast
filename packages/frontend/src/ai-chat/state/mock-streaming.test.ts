import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings, type AIStreamEvent, type BackendEvents, type BackendMethod, type BackendParams, type BackendResult } from "@opencast/protocol";
import { Emitter } from "../../bridge/emitter";
import { createAiMockHandlers } from "../../bridge/mock/ai";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function mock() {
  const events = new Emitter<BackendEvents>();
  const seen: AIStreamEvent[] = [];
  events.on("ai.stream", (event) => seen.push(event));
  const handlers = createAiMockHandlers(events, defaultSettings());
  const call = async <M extends BackendMethod>(method: M, params: BackendParams<M>): Promise<BackendResult<M>> => Promise.resolve(handlers[method]!(params));
  return { seen, call };
}

describe("mock stream lifecycle", () => {
  it("stopping a response releases the queue for follow-ups", async () => {
    const { call, seen } = mock();
    const chat = await call("ai.chats.create", {});
    const first = await call("ai.chats.send", { chatId: chat.id, content: "First prompt" });
    await vi.advanceTimersByTimeAsync(400);
    const second = await call("ai.chats.send", { chatId: chat.id, content: "Follow-up" });
    await call("ai.stop", { streamId: first.streamId });
    await vi.runAllTimersAsync();
    expect(seen).toContainEqual(expect.objectContaining({ streamId: first.streamId, type: "done", finishReason: "stopped" }));
    expect(seen).toContainEqual(expect.objectContaining({ streamId: second.streamId, type: "done", finishReason: "stop" }));
  });
  it("remembers Always Allow for later tool requests", async () => {
    const { call, seen } = mock();
    const chat = await call("ai.chats.create", {});
    await call("ai.chats.update", { id: chat.id, patch: { tools: ["ext:github"] } });
    const first = await call("ai.chats.send", { chatId: chat.id, content: "create an issue" });
    await vi.advanceTimersByTimeAsync(5000);
    const confirmation = seen.find((e) => e.type === "tool-call" && e.call.status === "awaiting-confirmation");
    if (!confirmation || confirmation.type !== "tool-call") throw new Error("No approval request");
    await call("ai.confirmTool", { streamId: first.streamId, callId: confirmation.call.id, approved: true, always: true });
    await vi.runAllTimersAsync();
    const next = await call("ai.chats.send", { chatId: chat.id, content: "create another issue" });
    await vi.runAllTimersAsync();
    expect(seen.filter((e) => e.streamId === next.streamId && e.type === "tool-call" && e.call.status === "awaiting-confirmation")).toHaveLength(0);
    expect(seen).toContainEqual(expect.objectContaining({ streamId: next.streamId, type: "done" }));
  });
  it("rejects edits from another chat and cancels pending tools on deletion", async () => {
    const { call, seen } = mock();
    const chat = await call("ai.chats.create", {});
    await expect(call("ai.chats.send", { chatId: chat.id, content: "oops", editMessageId: "sp-1" })).rejects.toThrow();
    await call("ai.chats.update", { id: chat.id, patch: { tools: ["ext:github"] } });
    const run = await call("ai.chats.send", { chatId: chat.id, content: "create an issue" });
    await vi.advanceTimersByTimeAsync(5000);
    await call("ai.chats.delete", { id: chat.id });
    await vi.runAllTimersAsync();
    expect(seen).toContainEqual(expect.objectContaining({ streamId: run.streamId, type: "done", finishReason: "stopped" }));
  });
});
