import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIChat } from "@surgecast/protocol";
import { backend } from "../../bridge/backend";
import { useChatSession } from "./useChatSession";
import { useStreams } from "./streams";

vi.mock("../../bridge/backend", () => ({ backend: { call: vi.fn(), on: vi.fn(() => () => {}), onStateChange: vi.fn(() => () => {}) } }));
vi.mock("../../components/feedback/toast-store", () => ({ showFailureToast: vi.fn() }));

const chat = (id: string): AIChat => ({ id, title: id, source: "chat", createdAt: 0, updatedAt: 0 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  useStreams.setState({ streams: {} });
  vi.mocked(backend.call).mockImplementation(async (_method, params) => ({ chat: chat((params as { id: string }).id), messages: [] }) as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("chat session navigation during sends", () => {
  it("does not select the old chat when its send returns after navigation", async () => {
    const created = vi.fn();
    const start = deferred<{ chatId: string; streamId: string }>();
    const { result, rerender } = renderHook(({ id }) => useChatSession(id, created), { initialProps: { id: "a" } });
    await waitFor(() => expect(result.current.chat?.id).toBe("a"));
    let send!: ReturnType<typeof result.current.run>;
    act(() => { send = result.current.run({ content: "hello", attachments: [] }, () => start.promise); });
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.chat?.id).toBe("b"));
    await act(async () => { start.resolve({ chatId: "a", streamId: "s" }); await send; });
    expect(result.current.chatId).toBe("b");
    expect(result.current.transcript).toEqual([]);
    expect(created).not.toHaveBeenCalled();
    expect(useStreams.getState().streams.s.chatId).toBe("a");
  });

  it("rejects a duplicate create while the first send RPC is pending", async () => {
    const start = deferred<{ chatId: string; streamId: string }>();
    const { result } = renderHook(() => useChatSession(null));
    let send!: ReturnType<typeof result.current.run>;
    act(() => { send = result.current.run({ content: "hello", attachments: [] }, () => start.promise); });
    const duplicate = vi.fn();
    await act(async () => { expect(await result.current.run(null, duplicate)).toBeNull(); });
    expect(duplicate).not.toHaveBeenCalled();
    await act(async () => { start.resolve({ chatId: "created", streamId: "s" }); await send; });
    expect(result.current.chatId).toBe("created");
  });
  it("honors Stop while the send RPC is still pending", async () => {
    const start = deferred<{ chatId: string; streamId: string }>();
    const { result } = renderHook(() => useChatSession(null));
    let send!: ReturnType<typeof result.current.run>;
    act(() => {
      send = result.current.run({ content: "hello", attachments: [] }, () => start.promise);
      result.current.stop();
    });
    await act(async () => { start.resolve({ chatId: "created", streamId: "pending-stream" }); await send; });
    expect(backend.call).toHaveBeenCalledWith("ai.stop", { streamId: "pending-stream" });
  });

  it("starts a fresh draft even when New Chat is pressed while creating the first chat", async () => {
    const created = vi.fn();
    const start = deferred<{ chatId: string; streamId: string }>();
    const { result, rerender } = renderHook(({ version }) => useChatSession(null, created, version), { initialProps: { version: 0 } });
    let send!: ReturnType<typeof result.current.run>;
    act(() => { send = result.current.run({ content: "hello", attachments: [] }, () => start.promise); });
    rerender({ version: 1 });
    await act(async () => { start.resolve({ chatId: "old", streamId: "s" }); await send; });
    expect(result.current.chatId).toBeNull();
    expect(result.current.transcript).toEqual([]);
    expect(created).not.toHaveBeenCalled();
  });

});
