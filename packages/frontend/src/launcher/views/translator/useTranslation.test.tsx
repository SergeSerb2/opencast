import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIStreamEvent } from "@opencast/protocol";

const mock = vi.hoisted(() => ({ call: vi.fn(), listeners: new Set<(event: AIStreamEvent) => void>() }));
vi.mock("../../../bridge/backend", () => ({ backend: {
  call: mock.call,
  on: (_topic: string, fn: (event: AIStreamEvent) => void) => { mock.listeners.add(fn); return () => mock.listeners.delete(fn); },
} }));

import { useTranslation } from "./useTranslation";

function emit(event: AIStreamEvent) {
  for (const listener of [...mock.listeners]) listener(event);
}

const initial = { text: "Hello", source: "auto", target: "es", enabled: true };
const tick = async (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  mock.call.mockReset();
  let id = 0;
  mock.call.mockImplementation(async (method: string) => {
    if (method === "ai.chats.create") return { id: `chat-${++id}` };
    if (method === "ai.ask") return { streamId: `stream-${id}` };
  });
});

afterEach(async () => {
  cleanup();
  // Retired streams still own a cleanup listener until the backend reports completion.
  await act(async () => {
    for (let id = 1; id <= 10; id++) emit({ type: "done", streamId: `stream-${id}` });
  });
  mock.listeners.clear();
  vi.useRealTimers();
});

describe("translator stream lifecycle", () => {
  it("cancels immediately while replacement text is debounced and ignores stale tokens", async () => {
    const { result, rerender } = renderHook(useTranslation, { initialProps: initial });
    await tick();
    await act(async () => emit({ type: "text", streamId: "stream-1", delta: "[[lang:en]]\nHola" }));
    expect(result.current.text).toBe("Hola");
    rerender({ ...initial, text: "Good morning" });
    expect(mock.call).toHaveBeenCalledWith("ai.stop", { streamId: "stream-1" });
    await act(async () => emit({ type: "text", streamId: "stream-1", delta: " STALE" }));
    expect(result.current.text).toBe("Hola");
    await tick(399);
    expect(mock.call.mock.calls.filter(([m]) => m === "ai.ask")).toHaveLength(1);
    await tick(1);
    expect(mock.call.mock.calls.filter(([m]) => m === "ai.ask")).toHaveLength(2);
  });

  it("deletes a temporary chat when ai.ask rejects", async () => {
    mock.call.mockImplementation(async (method: string) => {
      if (method === "ai.chats.create") return { id: "chat-1" };
      if (method === "ai.ask") throw new Error("Invalid API key");
    });
    const { result } = renderHook(useTranslation, { initialProps: initial });
    await tick();
    expect(result.current).toMatchObject({ status: "error", errorKind: "auth" });
    expect(mock.call).toHaveBeenCalledWith("ai.chats.delete", { id: "chat-1" });
  });

  it("handles a complete response arriving before ai.ask resolves", async () => {
    mock.call.mockImplementation(async (method: string) => {
      if (method === "ai.chats.create") return { id: "chat-1" };
      if (method === "ai.ask") {
        emit({ type: "text", streamId: "stream-1", delta: "[[lang:en]]\nHola" });
        emit({ type: "done", streamId: "stream-1" });
        return { streamId: "stream-1" };
      }
    });
    const { result } = renderHook(useTranslation, { initialProps: initial });
    await tick();
    expect(result.current).toMatchObject({ status: "done", text: "Hola", detected: "en", forSource: "auto" });
    expect(mock.call).toHaveBeenCalledWith("ai.chats.delete", { id: "chat-1" });
  });

  it("cleans up a stream cancelled before its RPC response identifies it", async () => {
    let resolve: (value: { streamId: string }) => void = () => {};
    mock.call.mockImplementation(async (method: string) => {
      if (method === "ai.chats.create") return { id: "chat-1" };
      if (method === "ai.ask") return new Promise((done) => { resolve = done; });
    });
    const { unmount } = renderHook(useTranslation, { initialProps: initial });
    await tick();
    unmount();
    await act(async () => {
      emit({ type: "done", streamId: "stream-1" });
      resolve({ streamId: "stream-1" });
    });
    expect(mock.call).toHaveBeenCalledWith("ai.chats.delete", { id: "chat-1" });
    expect(mock.call).toHaveBeenCalledWith("ai.stop", { streamId: "stream-1" });
  });

  it("skips AI for matching languages and stops when disabled", async () => {
    const { result, rerender } = renderHook(useTranslation, { initialProps: { ...initial, source: "es" } });
    await tick();
    expect(result.current).toMatchObject({ status: "done", text: "Hello" });
    expect(mock.call).not.toHaveBeenCalled();
    rerender({ ...initial, source: "en" });
    await tick();
    rerender({ ...initial, source: "en", enabled: false });
    expect(mock.call).toHaveBeenCalledWith("ai.stop", { streamId: "stream-1" });
    expect(result.current.status).toBe("idle");
  });
});
