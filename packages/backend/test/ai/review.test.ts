import { afterEach, expect, it, vi } from "vitest";
import type { AIMessage, AIToolInfo } from "@surgecast/protocol";
import { configuredProvider, harness, sseResponse, completion } from "./harness";
import { mapRequest, toolName } from "../../src/services/ai/request-mapping";
import { replayMessage } from "../../src/services/ai/chats";
let h: Awaited<ReturnType<typeof harness>>;
afterEach(async () => { await h?.close(); h = undefined as never; vi.unstubAllGlobals(); });
it("replays each assistant turn's reasoning only to its originating provider/model", async () => {
  h = await harness();
  const p = await h.rpc("ai.providers.upsert", { provider: configuredProvider });
  const tool: AIToolInfo = { name: "test.read", title: "Read", description: "Read", toolset: "test", toolsetTitle: "Test", inputSchema: { type: "object" } };
  h.ctx.tools.registerProvider({ id: "test", list: async () => [tool], call: async () => "result" });
  const bodies: any[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    return bodies.length === 1 ? sseResponse([{ choices: [{ delta: { reasoning_content: "round one", tool_calls: [{ id: "c1", function: { name: toolName(tool.name), arguments: "{}" } }] }, finish_reason: "tool_calls" }] }]) : sseResponse([{ choices: [{ delta: { reasoning_content: "round two", content: "answer" }, finish_reason: "stop" }] }]);
  });
  const chat = await h.rpc("ai.chats.create", { title: "Review" });
  await h.rpc("ai.chats.update", { id: chat.id, patch: { tools: ["test"] } });
  const send = await h.rpc("ai.chats.send", { chatId: chat.id, content: "read" });
  await h.terminal(send.streamId);
  expect(bodies[1].messages.find((m: any) => m.role === "assistant").reasoning_content).toBe("round one");
  const message = h.ctx.entities.get<AIMessage>("aiMessages", send.assistantMessageId)!.data;
  const turns = replayMessage(message).map(turn => ({ ...turn, parts: turn.content ? [{ type: "text" as const, text: turn.content }] : [] }));
  const mapped = (providerId: string, modelId: string) => mapRequest({ provider: { ...p, id: providerId }, model: { ...p.models[0], id: modelId }, request: { messages: [], tools: [tool] }, turns, headers: {}, secrets: [] }).body.messages as any[];
  expect(mapped(p.id, p.models[0].id).filter(m => m.role === "assistant").map(m => m.reasoning_content)).toEqual(["round one", "round two"]);
  expect(mapped("other", p.models[0].id).some(m => m.reasoning_content)).toBe(false);
  expect(mapped(p.id, "other").some(m => m.reasoning_content)).toBe(false);
});
it("reconciles later unrecorded tool calls after an earlier completed snapshot", () => {
  const message = { id: "a", chatId: "c", role: "assistant", content: "firstsecond", status: "stopped", createdAt: 1, updatedAt: 1,
    completedTurns: [{ role: "assistant", content: "first", toolCalls: [{ id: "one", name: "test.write", arguments: {}, status: "done" }] }, { role: "tool", name: "test.write", toolCallId: "one", content: "ok" }],
    toolCalls: [{ id: "one", name: "test.write", arguments: {}, status: "done" }, { id: "two", name: "test.write", arguments: {}, status: "running" }],
  } as AIMessage;
  const turns = replayMessage(message);
  expect(turns.flatMap(t => t.toolCalls ?? []).map(c => c.id)).toEqual(["one", "two"]);
  expect(turns.find(t => t.toolCallId === "two")?.content).toContain("unknown");
});
