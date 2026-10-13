import { afterEach, expect, it, vi } from "vitest";
import { harness, configuredProvider, completion } from "./harness";
let h: Awaited<ReturnType<typeof harness>> | undefined;
afterEach(async () => { await h?.close(); h = undefined; vi.unstubAllGlobals(); });
it("stores and removes web search keys without including them in entities", async () => {
  h = await harness();
  for (const provider of ["tavily", "brave", "exa", "searxng", "jina"] as const) {
    expect(await h.rpc("ai.webSearch.hasApiKey", { provider })).toBe(false);
    await h.rpc("ai.webSearch.setApiKey", { provider, apiKey: "synthetic-search-key" });
    expect(await h.rpc("ai.webSearch.hasApiKey", { provider })).toBe(true);
    expect(h.keys.get(`ai.websearch:${provider}:apiKey`)).toBe("synthetic-search-key");
    expect(JSON.stringify(h.ctx.entities.dirty())).not.toContain("synthetic-search-key");
    await h.rpc("ai.webSearch.setApiKey", { provider, apiKey: null });
    expect(await h.rpc("ai.webSearch.hasApiKey", { provider })).toBe(false);
  }
});
it("restores built-in presets and rejects resetting user presets", async () => {
  h = await harness();
  const original = (await h.rpc("ai.presets.list", {}))[0];
  await h.rpc("ai.presets.upsert", { ...original, name: "Edited", instructions: "Changed", reasoningEffort: "high" });
  expect(await h.rpc("ai.presets.reset", { id: original.id })).toMatchObject({ name: original.name, instructions: original.instructions, createdAt: original.createdAt });
  const custom = await h.rpc("ai.presets.upsert", { name: "Custom" });
  await expect(h.rpc("ai.presets.reset", { id: custom.id })).rejects.toThrow("built-in");
});

it("propagates chat metadata, prevents idle sleep and notifies when a response completes in the background", async () => {
  h = await harness();
  await h.rpc("ai.providers.upsert", { provider: configuredProvider });
  h.ctx.settings.set("ai.preventIdleSleep", true);
  h.ctx.settings.set("ai.backgroundNotifications", true);
  const original = h.nativeCall.getMockImplementation()!;
  h.nativeCall.mockImplementation(async (method, params) => method === "window.isVisible" ? false : original(method, params));
  vi.stubGlobal("fetch", async () => completion("Done"));
  const chat = await h.rpc("ai.chats.create", { title: "Background" });
  h.ctx.settings.set("ai.chatFolders", [{ id: "folder", name: "Work", createdAt: 1 }]);
  await h.rpc("ai.chats.update", { id: chat.id, patch: { folderId: "folder", reasoningEffort: "high", systemInstructions: "Be concise", source: "chat" } });
  expect((await h.rpc("ai.chats.get", { id: chat.id }))?.chat).toMatchObject({ titleSource: "user", folderId: "folder", reasoningEffort: "high", systemInstructions: "Be concise" });
  const run = await h.rpc("ai.chats.send", { chatId: chat.id, content: "Hello" });
  await h.terminal(run.streamId);
  expect(h.nativeCall).toHaveBeenCalledWith("system.setIdleSleepPrevented", { id: run.streamId, prevented: true });
  await vi.waitFor(() => expect(h!.nativeCall).toHaveBeenCalledWith("system.setIdleSleepPrevented", { id: run.streamId, prevented: false }));
  expect(h.nativeCall).toHaveBeenCalledWith("system.notification", { title: "AI response ready", body: "Background" });
});
it("steers a running response by stopping it before the follow-up, preserving partial context", async () => {
  h = await harness();
  await h.rpc("ai.providers.upsert", { provider: configuredProvider });
  h.ctx.settings.set("ai.runningSendAction", "steer");
  let requests = 0;
  vi.stubGlobal("fetch", async () => ++requests === 1 ? new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n')); }
  })) : completion("Follow-up"));
  const chat = await h.rpc("ai.chats.create", { title: "Steer" });
  const first = await h.rpc("ai.chats.send", { chatId: chat.id, content: "Begin" });
  await vi.waitFor(() => expect(h!.streamEvents.some(e => e.streamId === first.streamId && e.type === "text")).toBe(true));
  const second = await h.rpc("ai.chats.send", { chatId: chat.id, content: "Change direction" });
  expect(await h.terminal(first.streamId)).toMatchObject({ type: "done", finishReason: "stopped" });
  await h.terminal(second.streamId);
  const messages = (await h.rpc("ai.chats.get", { id: chat.id }))!.messages;
  expect(messages.find(m => m.id === first.assistantMessageId)).toMatchObject({ status: "stopped", content: "Partial" });
  expect(messages.find(m => m.id === second.assistantMessageId)).toMatchObject({ status: "complete", content: "Follow-up" });
});
