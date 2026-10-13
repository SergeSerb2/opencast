import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIMessage, AIToolInfo } from "@opencast/protocol";
import { CompletionEngine } from "../../src/services/ai/engine";
import { visibleBranch, durationMs } from "../../src/services/ai/chats";
import {
  commandArguments,
  resolvePlaceholders,
} from "../../src/services/ai/placeholders";
import { PROVIDER_TEMPLATES } from "../../src/services/ai/templates";
import { mapRequest } from "../../src/services/ai/adapters";
import { readableHtml } from "../../src/services/ai/web";
import {
  configuredProvider,
  completion,
  harness,
  sseResponse,
} from "./harness";
let h: Awaited<ReturnType<typeof harness>>;
afterEach(async () => {
  if (h) await h.close();
  h = undefined as never;
  vi.unstubAllGlobals();
});
async function configure() {
  h = await harness();
  const provider = await h.rpc("ai.providers.upsert", {
    provider: configuredProvider,
  });
  return provider;
}
describe("Provider configuration", () => {
  it("never imports environment keys on first run", async () => {
    vi.stubEnv("OPENAI_API_KEY", "environment-secret");
    h = await harness();
    expect(await h.rpc("ai.providers.list", {})).toEqual([]);
    expect(h.keys.size).toBe(0);
    vi.unstubAllEnvs();
  });
  it("supplies all required templates including local endpoints", () => {
    expect(PROVIDER_TEMPLATES).toHaveLength(18);
    expect(
      PROVIDER_TEMPLATES.find((p) => p.id === "cliproxyapi"),
    ).toMatchObject({
      baseUrl: "http://127.0.0.1:8317/v1",
      needsApiKey: false,
    });
  });
  it("stores keys/custom headers only in Keychain and deletes them", async () => {
    h = await harness();
    const p = await h.rpc("ai.providers.upsert", {
      provider: {
        ...configuredProvider,
        headers: {
          Authorization: "Bearer header-secret",
          "X-Organization": "org-secret",
        },
      },
      apiKey: "key-secret",
    });
    const serialized = JSON.stringify(h.ctx.entities.dirty());
    expect(serialized).not.toContain("key-secret");
    expect(serialized).not.toContain("header-secret");
    expect(serialized).not.toContain("org-secret");
    expect(p.secretHeaders).toEqual(["Authorization", "X-Organization"]);
    expect((await h.rpc("ai.providers.list", {}))[0].hasApiKey).toBe(true);
    await h.rpc("ai.providers.delete", { id: p.id });
    expect(h.keys.size).toBe(0);
  });
  it("merges discovered models with manual entries and overrides", async () => {
    const p = await configure();
    await h.rpc("ai.providers.upsert", {
      provider: {
        ...p,
        models: [
          {
            id: "gpt-4o",
            name: "My name",
            enabled: false,
            capabilities: { vision: false },
          },
          {
            id: "custom-model",
            name: "Manual",
            enabled: true,
            manual: true,
            capabilities: {},
          },
        ],
      },
    });
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ data: [{ id: "gpt-4o" }, { id: "gpt-4.1" }] }),
        ),
    );
    const refreshed = await h.rpc("ai.providers.refreshModels", { id: p.id });
    expect(refreshed.models.find((m) => m.id === "gpt-4o")).toMatchObject({
      name: "My name",
      enabled: false,
      capabilities: { vision: false },
    });
    expect(refreshed.models.find((m) => m.id === "custom-model")?.enabled).toBe(
      true,
    );
    const models = await h.rpc("ai.models.list", {});
    expect(models.map((m) => m.modelId)).toEqual(["gpt-4.1", "custom-model"]);
    h.ctx.settings.set("ai.chatModel", `${p.id}/custom-model`);
    expect(await h.ctx.ai.defaultModel("chat")).toBe(`${p.id}/custom-model`);
    expect(await h.ctx.ai.defaultModel("title")).toBe(`${p.id}/gpt-4.1`);
  });
  it.each(["ollama", "anthropic", "google"] as const)(
    "discovers %s models using its native catalog",
    async (api) => {
      h = await harness();
      const p = await h.rpc("ai.providers.upsert", {
        provider: { ...configuredProvider, api, models: [] },
      });
      const fetch = vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              api === "ollama"
                ? { models: [{ name: "llava:latest" }] }
                : api === "google"
                  ? {
                      models: [
                        {
                          name: "models/gemini-2.5-flash",
                          displayName: "Flash",
                          inputTokenLimit: 10000,
                          supportedGenerationMethods: ["generateContent"],
                        },
                      ],
                    }
                  : {
                      data: [
                        { id: "claude-sonnet-4-6", display_name: "Sonnet" },
                      ],
                    },
            ),
          ),
      );
      vi.stubGlobal("fetch", fetch);
      const refreshed = await h.rpc("ai.providers.refreshModels", { id: p.id });
      expect(refreshed.models).toHaveLength(1);
      expect(fetch.mock.calls[0][0]).toContain(
        api === "ollama"
          ? "/api/tags"
          : api === "google"
            ? "/v1beta/models"
            : "/v1/models",
      );
    },
  );
  it("rejects hosted routes and invalid URLs", async () => {
    h = await harness();
    await expect(
      h.rpc("ai.providers.upsert", {
        provider: {
          ...configuredProvider,
          baseUrl: "https://backend.raycast.com/api/v1",
        },
      }),
    ).rejects.toThrow("Hosted");
    await expect(
      h.rpc("ai.providers.upsert", {
        provider: { ...configuredProvider, baseUrl: "file:///etc/passwd" },
      }),
    ).rejects.toThrow("HTTP");
  });
});
describe("Tool execution", () => {
  const tool: AIToolInfo = {
    name: "test.write",
    title: "Write",
    description: "Write action",
    toolset: "ext:test",
    toolsetTitle: "Test",
    inputSchema: { type: "object" },
    requiresConfirmation: true,
  };
  it("requires confirmation, returns results to the model and accumulates usage", async () => {
    const p = await configure();
    const call = vi.fn(async () => ({ changed: true }));
    h.ctx.tools.registerProvider({
      id: "test",
      list: async () => [tool],
      call,
    });
    const alias = (
      mapRequest({
        provider: p,
        model: p.models[0],
        request: { messages: [], tools: [tool] },
        turns: [],
        headers: {},
        secrets: [],
      }).body.tools as any[]
    )[0].function.name;
    let iteration = 0;
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      if (iteration++ === 0)
        return sseResponse([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    { id: "call", function: { name: alias, arguments: "{}" } },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: { prompt_tokens: 5, completion_tokens: 2 },
          },
        ]);
      const body = JSON.parse(init.body as string);
      expect(body.messages.at(-1)).toMatchObject({
        role: "tool",
        tool_call_id: "call",
        content: '{"changed":true}',
      });
      return completion("Finished");
    });
    vi.stubGlobal("fetch", fetch);
    const confirm = vi.fn(async () => {
      expect(call).not.toHaveBeenCalled();
      return true;
    });
    const result = await h.ctx.ai.complete({
      messages: [{ role: "user", content: "write" }],
      tools: [tool],
      confirmTool: confirm,
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      text: "Finished",
      toolCalls: [{ status: "done" }],
      usage: { inputTokens: 8, outputTokens: 4 },
    });
    expect(
      (result as Awaited<ReturnType<CompletionEngine["complete"]>>).turns.map(
        (t) => t.role,
      ),
    ).toEqual(["assistant", "tool", "assistant"]);
  });
  it("declines write tools when no confirmation callback exists", async () => {
    const p = await configure(),
      call = vi.fn(async () => ({}));
    h.ctx.tools.registerProvider({
      id: "test",
      list: async () => [tool],
      call,
    });
    const alias = (
      mapRequest({
        provider: p,
        model: p.models[0],
        request: { messages: [], tools: [tool] },
        turns: [],
        headers: {},
        secrets: [],
      }).body.tools as any[]
    )[0].function.name;
    let step = 0;
    vi.stubGlobal("fetch", async () =>
      step++
        ? completion("Declined")
        : sseResponse([
            {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      { id: "c", function: { name: alias, arguments: "{}" } },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
            },
          ]),
    );
    const result = await h.ctx.ai.complete({ messages: [], tools: [tool] });
    expect(result.toolCalls[0].status).toBe("rejected");
    expect(call).not.toHaveBeenCalled();
  });
  it("enforces the 12-round limit", async () => {
    const p = await configure();
    const readTool = { ...tool, requiresConfirmation: false };
    h.ctx.tools.registerProvider({
      id: "test",
      list: async () => [readTool],
      call: async () => ({}),
    });
    const alias = (
      mapRequest({
        provider: p,
        model: p.models[0],
        request: { messages: [], tools: [readTool] },
        turns: [],
        headers: {},
        secrets: [],
      }).body.tools as any[]
    )[0].function.name;
    const fetch = vi.fn(async () =>
      sseResponse([
        {
          choices: [
            {
              delta: {
                tool_calls: [{ function: { name: alias, arguments: "{}" } }],
              },
              finish_reason: "tool_calls",
            },
          ],
        },
      ]),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      h.ctx.ai.complete({ messages: [], tools: [readTool] }),
    ).rejects.toThrow("12 tool rounds");
    expect(fetch).toHaveBeenCalledTimes(12);
  });
});
describe("Chats and branches", () => {
  it("preserves sibling branches for edits and regenerations", async () => {
    await configure();
    vi.stubGlobal("fetch", async () => completion("Answer"));
    const chat = await h.rpc("ai.chats.create", { title: "Branch test" });
    const first = await h.rpc("ai.chats.send", {
      chatId: chat.id,
      content: "Original",
    });
    await h.terminal(first.streamId);
    const edited = await h.rpc("ai.chats.send", {
      chatId: chat.id,
      content: "Edited",
      editMessageId: first.userMessageId,
    });
    await h.terminal(edited.streamId);
    const regenerated = await h.rpc("ai.chats.send", {
      chatId: chat.id,
      content: "",
      regenerateMessageId: edited.assistantMessageId,
    });
    await h.terminal(regenerated.streamId);
    const stored = (await h.rpc("ai.chats.get", { id: chat.id }))!;
    expect(stored.messages).toHaveLength(5);
    expect(stored.chat.currentLeafId).toBe(regenerated.assistantMessageId);
    expect(
      visibleBranch(stored.messages, stored.chat.currentLeafId).map(
        (m) => m.content,
      ),
    ).toEqual(["Edited", "Answer"]);
    expect(
      visibleBranch(stored.messages, first.assistantMessageId).map(
        (m) => m.content,
      ),
    ).toEqual(["Original", "Answer"]);
    expect(
      stored.messages.find((m) => m.id === edited.userMessageId)?.parentId,
    ).toBeUndefined();
  });
  it("queues follow-ups and supplies the preceding completed response", async () => {
    await configure();
    const bodies: any[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      await new Promise((r) => setTimeout(r, 15));
      return completion(`Answer ${bodies.length}`);
    });
    const chat = await h.rpc("ai.chats.create", { title: "Queue" });
    const first = await h.rpc("ai.chats.send", {
        chatId: chat.id,
        content: "One",
      }),
      second = await h.rpc("ai.chats.send", {
        chatId: chat.id,
        content: "Two",
      });
    await h.terminal(second.streamId);
    expect(bodies[1].messages.map((m: any) => m.content)).toEqual([
      expect.any(String),
      "One",
      "Answer 1",
      "Two",
    ]);
    expect(
      (await h.rpc("ai.chats.get", { id: chat.id }))!.chat.currentLeafId,
    ).toBe(second.assistantMessageId);
    expect(
      h.streamEvents.find(
        (e) => e.streamId === first.streamId && e.type === "done",
      ),
    ).toBeDefined();
  });
  it("stores Quick AI follow-ups in the same chat and changes source for handoff", async () => {
    await configure();
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) =>
      completion(
        JSON.parse(init.body as string).messages[0].content.includes(
          "Name this conversation",
        )
          ? "Useful Chat Title"
          : "Quick answer",
      ),
    );
    const first = await h.rpc("ai.ask", { prompt: "Initial question" });
    await h.terminal(first.streamId);
    const second = await h.rpc("ai.ask", {
      prompt: "Follow up",
      chatId: first.chatId,
    });
    await h.terminal(second.streamId);
    const stored = (await h.rpc("ai.chats.get", { id: first.chatId! }))!;
    expect(stored.chat.title).toBe("Useful Chat Title");
    expect(stored.messages).toHaveLength(4);
    expect(
      h.streamEvents.find(
        (e) => e.streamId === first.streamId && e.type === "title",
      ),
    ).toBeDefined();
    await h.rpc("ai.chats.update", {
      id: first.chatId!,
      patch: { source: "chat" },
    });
    expect(
      (await h.rpc("ai.chats.get", { id: first.chatId! }))!.chat.source,
    ).toBe("chat");
  });
  it("stops an idle stream and retains partial text", async () => {
    await configure();
    let began = false;
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(
                new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n',
                ),
              );
              began = true;
            },
          }),
        ),
    );
    const chat = await h.rpc("ai.chats.create", { title: "Stop" }),
      result = await h.rpc("ai.chats.send", { chatId: chat.id, content: "Go" });
    while (!began) await new Promise((r) => setTimeout(r, 5));
    await h.rpc("ai.stop", { streamId: result.streamId });
    expect(await h.terminal(result.streamId)).toMatchObject({
      type: "done",
      finishReason: "stopped",
    });
    const stored = (await h.rpc("ai.chats.get", {
      id: chat.id,
    }))!.messages.find((m) => m.id === result.assistantMessageId)!;
    expect(stored.status).toBe("stopped");
    expect(stored.content).toBe("Partial");
  });
  it("persists errors instead of incomplete success", async () => {
    await configure();
    vi.stubGlobal("fetch", async () => new Response("denied", { status: 429 }));
    const ask = await h.rpc("ai.ask", { prompt: "Question" });
    expect(await h.terminal(ask.streamId)).toMatchObject({
      type: "error",
      status: 429,
    });
    expect(
      (await h.rpc("ai.chats.get", { id: ask.chatId! }))!.messages.at(-1)
        ?.status,
    ).toBe("error");
  });
  it("validates parent pointers and preserves pinned chats during auto-archive", async () => {
    h = await harness();
    const chat = await h.rpc("ai.chats.create", { title: "Pinned" });
    await h.rpc("ai.chats.update", { id: chat.id, patch: { pinned: true } });
    await expect(
      h.rpc("ai.chats.update", {
        id: chat.id,
        patch: { currentLeafId: "missing" },
      }),
    ).rejects.toThrow("missing");
    expect(durationMs("2d")).toBe(172800000);
    expect(durationMs("never")).toBeNull();
    const cyclic = {
      id: "a",
      parentId: "a",
      chatId: "c",
      role: "user",
      content: "",
      status: "complete",
      createdAt: 0,
      updatedAt: 0,
    } as AIMessage;
    expect(() => visibleBranch([cyclic], "a")).toThrow("cycle");
  });
});
describe("Commands, presets and placeholders", () => {
  it("expands selection, clipboard, profile context, modifiers, dates and arguments", async () => {
    h = await harness();
    const output = await resolvePlaceholders(
      '{selection | trim | uppercase} / {clipboard | json-stringify} / {argument name="Language" default="English"} / {date format="yyyy-MM-dd"} / {focused-app}',
      h.ctx,
      { selection: " hello " },
    );
    expect(output).toMatch(
      /^HELLO \/ "Clipboard words" \/ English \/ \d{4}-\d{2}-\d{2} \/ TextEdit$/,
    );
    await expect(
      resolvePlaceholders('{argument name="Question"}', h.ctx),
    ).rejects.toThrow("Question");
    expect(
      commandArguments(
        '{argument name="Tone" options="Friendly,Professional"} {argument name="Tone"}',
      ),
    ).toMatchObject([
      {
        name: "Tone",
        type: "dropdown",
        data: [{ value: "Friendly" }, { value: "Professional" }],
      },
    ]);
    expect(() =>
      commandArguments(
        '{argument name="a"} {argument name="b"} {argument name="c"} {argument name="d"}',
      ),
    ).toThrow("three");
    await expect(
      resolvePlaceholders('{clipboard offset="x"}', h.ctx),
    ).rejects.toThrow("integer");
  });
  it("rejects invalid modifiers and nested snippets", async () => {
    h = await harness();
    expect(() => commandArguments("{selection | unknown}")).toThrow("modifier");
    h.ctx.entities.put("snippets", "s", {
      name: "Greeting",
      text: "Hello {date}",
    });
    expect(
      await resolvePlaceholders('{snippet name="Greeting"}', h.ctx),
    ).toContain("Hello");
    h.ctx.entities.put("snippets", "s", {
      name: "Greeting",
      text: '{snippet name="Greeting"}',
    });
    await expect(
      resolvePlaceholders('{snippet name="Greeting"}', h.ctx),
    ).rejects.toThrow("nested");
  });
  it("seeds original prompts, registers command arguments, and respects agent visibility", async () => {
    h = await harness();
    const commands = await h.rpc("ai.commands.list", {});
    expect(commands.length).toBeGreaterThanOrEqual(18);
    expect(commands.every((c) => c.builtin)).toBe(true);
    const rows = await h.ctx.commands.all();
    expect(
      rows.find((c) => c.id === "ai-command:answer-question-about-website")
        ?.arguments?.[0].name,
    ).toBe("Question");
    expect(rows.some((c) => c.kind === "ai-preset")).toBe(false);
    h.ctx.settings.set("ai.searchAgents", true);
    expect(
      (await h.ctx.commands.all()).filter((c) => c.kind === "ai-preset"),
    ).toHaveLength(4);
    expect(
      await h.ctx.commands.launch("ai-command:improve-writing", {
        source: "root",
      }),
    ).toEqual({
      kind: "ai",
      aiCommandId: "improve-writing",
      target: "quick-ai",
    });
  });
  it("imports Raycast command JSON and resets edited built-ins", async () => {
    h = await harness();
    expect(
      await h.rpc("ai.commands.import", {
        json: JSON.stringify({
          commands: [
            {
              title: "Custom",
              promptTemplate: "Say hi",
              outputBehavior: "replace-selection",
            },
          ],
        }),
      }),
    ).toEqual({ imported: 1 });
    expect(
      (await h.rpc("ai.commands.list", {})).find((c) => c.name === "Custom")
        ?.output,
    ).toBe("replace");
    await h.rpc("ai.commands.upsert", {
      id: "improve-writing",
      name: "Edited",
      prompt: "New prompt",
    });
    expect(
      (await h.rpc("ai.commands.reset", { id: "improve-writing" })).name,
    ).toBe("Improve Writing");
    const exported = await h.rpc("ai.commands.export", {});
    expect(
      JSON.parse(exported.json).commands.some(
        (c: any) => c.promptTemplate === "Say hi",
      ),
    ).toBe(true);
  });
  it("applies native copy output after completion", async () => {
    await configure();
    vi.stubGlobal("fetch", async () => completion("Clean text"));
    const command = await h.rpc("ai.commands.upsert", {
      name: "Copy",
      prompt: "Rewrite {selection}",
      output: "copy",
    });
    const run = await h.rpc("ai.commands.run", {
      id: command.id,
      input: { selectedText: "Original" },
    });
    expect(run.prompt).toBe("Rewrite Original");
    await h.terminal(run.streamId);
    expect(h.nativeCall).toHaveBeenCalledWith("clipboard.write", {
      content: { kind: "text", text: "Clean text" },
    });
  });
  it("extracts readable text without scripts or navigation", () => {
    expect(
      readableHtml(
        "<html><nav>Links</nav><main><h1>Heading</h1><p>A &amp; B</p><script>private()</script></main></html>",
        "markdown",
      ),
    ).toBe("# Heading\nA & B");
  });
});
