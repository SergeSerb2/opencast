import { afterEach, expect, it, vi } from "vitest";
import type { AIChat, AIMessage } from "@opencast/protocol";
import { Chats, replayMessage } from "../../src/services/ai/chats";
import { CompletionEngine } from "../../src/services/ai/engine";
import { MCP } from "../../src/services/ai/mcp";
import {
  harness,
  configuredProvider,
  sseResponse,
  completion,
} from "./harness";
let h: Awaited<ReturnType<typeof harness>> | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
  vi.unstubAllGlobals();
});
async function setup() {
  h = await harness();
  await h.rpc("ai.providers.upsert", { provider: configuredProvider });
  return h;
}
it("suspends for a write confirmation, remembers Always Allow, and resumes", async () => {
  const t = await setup();
  const chat = await t.rpc("ai.chats.create", { title: "Confirmation" });
  await t.rpc("ai.chats.update", {
    id: chat.id,
    patch: { tools: ["builtin"] },
  });
  let step = 0;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    if (step++ > 0) return completion("Notified");
    const name = body.tools.find((tool: any) =>
      tool.function.description.startsWith("Display a notification"),
    ).function.name;
    return sseResponse([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  id: "notify",
                  function: {
                    name,
                    arguments: '{"title":"Test notification"}',
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
    ]);
  });
  const run = await t.rpc("ai.chats.send", {
    chatId: chat.id,
    content: "Notify me",
  });
  await vi.waitFor(() =>
    expect(
      t.streamEvents.some(
        (e) =>
          e.streamId === run.streamId &&
          e.type === "tool-call" &&
          e.call.status === "awaiting-confirmation",
      ),
    ).toBe(true),
  );
  expect(
    t.nativeCall.mock.calls.some(
      ([method]) => method === "system.notification",
    ),
  ).toBe(false);
  await t.rpc("ai.confirmTool", {
    streamId: run.streamId,
    callId: "notify",
    approved: true,
    always: true,
  });
  expect((await t.terminal(run.streamId)).type).toBe("done");
  expect(t.nativeCall).toHaveBeenCalledWith("system.notification", {
    title: "Test notification",
    body: undefined,
  });
  expect(t.ctx.settings.get("ai.alwaysAllowedTools")).toContain(
    "system.notification",
  );
  await expect(
    t.rpc("ai.confirmTool", {
      streamId: run.streamId,
      callId: "notify",
      approved: true,
    }),
  ).rejects.toThrow("no longer pending");
});
it("cancels pending approval without executing the write", async () => {
  const t = await setup();
  const chat = await t.rpc("ai.chats.create", { title: "Cancelled approval" });
  await t.rpc("ai.chats.update", {
    id: chat.id,
    patch: { tools: ["builtin"] },
  });
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string),
      name = body.tools.find((tool: any) =>
        tool.function.description.startsWith("Display a notification"),
      ).function.name;
    return sseResponse([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  id: "notify",
                  function: { name, arguments: '{"title":"Must not run"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
    ]);
  });
  const run = await t.rpc("ai.chats.send", {
    chatId: chat.id,
    content: "Notify",
  });
  await vi.waitFor(() =>
    expect(
      t.streamEvents.some(
        (e) =>
          e.type === "tool-call" && e.call.status === "awaiting-confirmation",
      ),
    ).toBe(true),
  );
  await t.rpc("ai.stop", { streamId: run.streamId });
  expect(await t.terminal(run.streamId)).toMatchObject({
    type: "done",
    finishReason: "stopped",
  });
  expect(
    t.nativeCall.mock.calls.some(
      ([method]) => method === "system.notification",
    ),
  ).toBe(false);
});
it("retains completed tool results when stopped during the next model round", async () => {
  const t = await setup();
  const chat = await t.rpc("ai.chats.create", { title: "Resume" });
  await t.rpc("ai.chats.update", {
    id: chat.id,
    patch: { tools: ["builtin"] },
  });
  let step = 0;
  const bodies: any[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    bodies.push(body);
    if (step++ === 0) {
      const name = body.tools.find((tool: any) =>
        tool.function.description.startsWith("Get the current local date"),
      ).function.name;
      return sseResponse([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { id: "clock", function: { name, arguments: "{}" } },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        },
      ]);
    }
    if (step === 2)
      return new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(
              new TextEncoder().encode(
                'data: {"choices":[{"delta":{"content":"Partial explanation"}}]}\n\n',
              ),
            );
          },
        }),
      );
    return completion("Continued");
  });
  const run = await t.rpc("ai.chats.send", {
    chatId: chat.id,
    content: "Current time",
  });
  await vi.waitFor(() =>
    expect(
      t.streamEvents.some(
        (e) => e.streamId === run.streamId && e.type === "text",
      ),
    ).toBe(true),
  );
  await new Promise((r) => setTimeout(r, 120));
  const partial = (await t.rpc("ai.chats.get", { id: chat.id }))!.messages.find(
    (m) => m.id === run.assistantMessageId,
  )!;
  expect(partial.content).toBe("Partial explanation");
  expect(partial.status).toBe("streaming");
  await t.rpc("ai.stop", { streamId: run.streamId });
  await t.terminal(run.streamId);
  const message = (await t.rpc("ai.chats.get", { id: chat.id }))!.messages.find(
    (m) => m.id === run.assistantMessageId,
  )!;
  expect(
    message.completedTurns?.some(
      (turn) => turn.role === "tool" && turn.toolCallId === "clock",
    ),
  ).toBe(true);
  const followup = await t.rpc("ai.chats.send", {
    chatId: chat.id,
    content: "Continue",
  });
  await t.terminal(followup.streamId);
  expect(
    bodies
      .at(-1)
      .messages.some(
        (m: any) => m.role === "tool" && m.tool_call_id === "clock",
      ),
  ).toBe(true);
  expect(t.streamEvents.filter((e) => e.type === "tool-result")).toHaveLength(
    1,
  );
});
it("archives old unpinned chats and preserves pinned chats", async () => {
  const t = await setup();
  const pinned = await t.rpc("ai.chats.create", { title: "Pinned" }),
    old = await t.rpc("ai.chats.create", { title: "Old" });
  t.ctx.entities.patch<AIChat>("aiChats", pinned.id, {
    pinned: true,
    updatedAt: 0,
  });
  t.ctx.entities.patch<AIChat>("aiChats", old.id, { updatedAt: 0 });
  t.ctx.settings.set("ai.autoArchiveChats", "1d");
  new Chats(t.ctx, t.ctx.ai as CompletionEngine, new MCP(t.ctx)).autoArchive();
  expect((await t.rpc("ai.chats.get", { id: old.id }))!.chat.archived).toBe(
    true,
  );
  expect(
    (await t.rpc("ai.chats.get", { id: pinned.id }))!.chat.archived,
  ).not.toBe(true);
  await expect(
    t.rpc("ai.chats.send", { chatId: old.id, content: "Hello" }),
  ).rejects.toThrow("Unarchive");
});
it("fetches models automatically only after explicit provider setup and reports fetch errors", async () => {
  h = await harness();
  vi.stubGlobal(
    "fetch",
    async () => new Response(JSON.stringify({ data: [{ id: "gpt-4o" }] })),
  );
  const p = await h.rpc("ai.providers.upsert", {
    provider: { ...configuredProvider, models: [], autoFetchModels: true },
  });
  expect(p.models[0].id).toBe("gpt-4o");
  vi.stubGlobal(
    "fetch",
    async () => new Response("Unavailable", { status: 503 }),
  );
  await expect(
    h.rpc("ai.providers.refreshModels", { id: p.id }),
  ).rejects.toThrow("HTTP 503");
  expect((await h.rpc("ai.providers.list", {}))[0].modelFetchError).toContain(
    "HTTP 503",
  );
});
it("does not replace an explicitly supplied New Chat title", async () => {
  const t = await setup();
  const fetch = vi.fn(async () => completion("Answer"));
  vi.stubGlobal("fetch", fetch);
  const chat = await t.rpc("ai.chats.create", { title: "New Chat" });
  const run = await t.rpc("ai.chats.send", {
    chatId: chat.id,
    content: "Question",
  });
  await t.terminal(run.streamId);
  expect(fetch).toHaveBeenCalledOnce();
  expect((await t.rpc("ai.chats.get", { id: chat.id }))!.chat.titleSource).toBe(
    "user",
  );
});
it("repairs interrupted transcripts with unknown tool outcomes without claiming success", () => {
  const message: AIMessage = {
    id: "m",
    chatId: "c",
    role: "assistant",
    content: "Partial",
    status: "stopped",
    createdAt: 1,
    updatedAt: 1,
    completedTurns: [
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call", name: "test.write", arguments: {}, status: "running" },
        ],
      },
    ],
  };
  const replay = replayMessage(message);
  expect(replay[1]).toMatchObject({
    role: "tool",
    toolCallId: "call",
    content: expect.stringContaining("outcome is unknown"),
  });
  expect(replay[2].content).toBe("Partial");
});
