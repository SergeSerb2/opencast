import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIProvider, AIToolInfo } from "@opencast/protocol";
import {
  mapRequest,
  streamAdapter,
  type AdapterRequest,
} from "../../src/services/ai/adapters";
import { inferModel } from "../../src/services/ai/providers";
import { toolName } from "../../src/services/ai/request-mapping";
import { configuredProvider, harness, sseResponse } from "./harness";

const model = inferModel("gpt-6-astra", "openai-responses");
const provider: AIProvider = {
  ...configuredProvider,
  id: "p",
  api: "openai-responses",
  models: [model],
  createdAt: 1,
  updatedAt: 1,
  enabled: true,
};
const tool: AIToolInfo = {
  name: "test.lookup",
  title: "Lookup",
  description: "Look up a value",
  toolset: "test",
  toolsetTitle: "Test",
  inputSchema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
  },
};
function input(): AdapterRequest {
  return {
    provider,
    model,
    headers: { Authorization: "Bearer api-secret" },
    secrets: ["api-secret"],
    request: {
      messages: [],
      system: "Instructions",
      tools: [tool],
      reasoningEffort: "high",
      maxOutputTokens: 8192,
    },
    turns: [
      {
        role: "user",
        content: "Hello",
        parts: [{ type: "text", text: "Hello" }],
      },
    ],
  };
}
const usage = {
  input_tokens: 9,
  output_tokens: 7,
  output_tokens_details: { reasoning_tokens: 4 },
};
function terminal(output: unknown[] = []) {
  return {
    type: "response.completed",
    response: { status: "completed", output, usage },
  };
}
function functionItem(index = 0) {
  return {
    type: "function_call",
    id: `fc_${index}`,
    call_id: `call_${index}`,
    name: toolName(tool.name),
    arguments: '{"value":"abc"}',
  };
}
function toolStream() {
  const item = functionItem();
  const reasoning = {
    type: "reasoning",
    id: "rs_1",
    summary: [{ type: "summary_text", text: "Check it" }],
    encrypted_content: "opaque",
  };
  return sseResponse(
    [
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...reasoning, summary: [] },
      },
      {
        type: "response.reasoning_summary_text.delta",
        output_index: 0,
        delta: "Check it",
      },
      { type: "response.output_item.done", output_index: 0, item: reasoning },
      {
        type: "response.output_item.added",
        output_index: 1,
        item: { ...item, arguments: "" },
      },
      {
        type: "response.function_call_arguments.delta",
        item_id: item.id,
        output_index: 1,
        delta: '{"value":',
      },
      {
        type: "response.function_call_arguments.delta",
        item_id: item.id,
        output_index: 1,
        delta: '"abc"}',
      },
      {
        type: "response.function_call_arguments.done",
        item_id: item.id,
        output_index: 1,
        arguments: item.arguments,
      },
      { type: "response.output_item.done", output_index: 1, item },
      terminal([reasoning, item]),
    ],
    false,
  );
}
let h: Awaited<ReturnType<typeof harness>> | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
  vi.unstubAllGlobals();
});

describe("Responses request mapping", () => {
  it("projects instructions, images, PDFs, assistant messages and tool outputs", () => {
    const req = input();
    req.turns.unshift({ role: "system", content: "More context", parts: [] });
    req.turns[1].parts.push(
      { type: "image", mimeType: "image/png", data: "YWJj", name: "image.png" },
      {
        type: "pdf",
        mimeType: "application/pdf",
        data: "cGRm",
        name: "file.pdf",
      },
    );
    req.turns.push(
      {
        role: "assistant",
        content: "Looking",
        parts: [{ type: "text", text: "Looking" }],
        toolCalls: [
          {
            id: "call",
            name: tool.name,
            arguments: { value: "abc" },
            status: "done",
          },
        ],
      },
      {
        role: "tool",
        content: '{"found":true}',
        parts: [],
        toolCallId: "call",
      },
    );
    const mapped = mapRequest(req);
    expect(mapped.url).toBe("http://127.0.0.1:9876/v1/responses");
    expect(mapped.body).toMatchObject({
      model: model.id,
      stream: true,
      store: false,
      instructions: "Instructions\n\nMore context",
      reasoning: { effort: "high", summary: "auto" },
      max_output_tokens: 8192,
      include: ["reasoning.encrypted_content"],
      tools: [
        {
          type: "function",
          name: toolName(tool.name),
          parameters: tool.inputSchema,
          strict: false,
        },
      ],
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Hello" },
            {
              type: "input_image",
              image_url: "data:image/png;base64,YWJj",
              detail: "auto",
            },
            {
              type: "input_file",
              filename: "file.pdf",
              file_data: "data:application/pdf;base64,cGRm",
            },
          ],
        },
        {
          role: "assistant",
          content: [{ type: "input_text", text: "Looking" }],
        },
        {
          type: "function_call",
          name: toolName(tool.name),
          call_id: "call",
          arguments: '{"value":"abc"}',
        },
        {
          type: "function_call_output",
          call_id: "call",
          output: '{"found":true}',
        },
      ],
    });
    expect(mapped.body.temperature).toBeUndefined();
    expect(mapped.body.messages).toBeUndefined();
  });
  it("clamps output tokens and omits unsupported reasoning and tools", () => {
    const req = input();
    req.model = {
      ...model,
      maxOutputTokens: 2048,
      capabilities: { tools: false, reasoning: false },
    };
    const body = mapRequest(req).body;
    expect(body.max_output_tokens).toBe(2048);
    expect(body.reasoning).toBeUndefined();
    expect(body.tools).toBeUndefined();
    req.provider = {
      ...provider,
      baseUrl: "https://example.test/v1?custom=value",
    };
    expect(mapRequest(req).url).toBe(
      "https://example.test/v1/responses?custom=value",
    );
  });
});

describe("Responses streaming", () => {
  it("streams text and reasoning once, maps usage, and sends auth", async () => {
    const fetch = vi.fn(async () =>
      sseResponse(
        [
          {
            type: "response.output_text.delta",
            output_index: 1,
            delta: "Hello ",
          },
          {
            type: "response.reasoning_summary_text.delta",
            output_index: 0,
            delta: "Consider",
          },
          {
            type: "response.output_text.delta",
            output_index: 1,
            delta: "world",
          },
          terminal([
            {
              type: "reasoning",
              summary: [{ type: "summary_text", text: "Consider" }],
            },
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "Hello world" }],
            },
          ]),
        ],
        false,
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const events: unknown[] = [];
    const req = input();
    req.turns[0].parts.push({
      type: "image",
      mimeType: "image/png",
      data: "YWJj",
      name: "test.png",
    });
    const result = await streamAdapter({
      ...req,
      onEvent: (e) => events.push(e),
    });
    expect(result).toMatchObject({
      text: "Hello world",
      reasoning: "Consider",
      finishReason: "stop",
      toolCalls: [],
      usage: { inputTokens: 9, outputTokens: 7, reasoningTokens: 4 },
    });
    expect(events).toEqual([
      { type: "text", delta: "Hello " },
      { type: "reasoning", delta: "Consider" },
      { type: "text", delta: "world" },
    ]);
    const [url, init] = (
      fetch.mock.calls as unknown as [string, RequestInit][]
    )[0];
    expect(url).toBe("http://127.0.0.1:9876/v1/responses");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer api-secret",
    );
    expect(JSON.parse(init.body as string).store).toBe(false);
    expect(JSON.parse(init.body as string).input[0].content[1]).toMatchObject({
      type: "input_image",
      image_url: "data:image/png;base64,YWJj",
    });
  });
  it("replays encrypted reasoning and call IDs only to the source provider/model", async () => {
    vi.stubGlobal("fetch", async () => toolStream());
    const req = input(),
      result = await streamAdapter(req);
    expect(result.toolCalls).toMatchObject([
      { id: "call_0", name: tool.name, arguments: { value: "abc" } },
    ]);
    req.turns.push({
      role: "assistant",
      content: "",
      parts: [],
      toolCalls: result.toolCalls,
    });
    const items = mapRequest(req).body.input as any[];
    expect(items[1]).toMatchObject({
      type: "reasoning",
      encrypted_content: "opaque",
    });
    expect(items[2].call_id).toBe("call_0");
    req.model = { ...model, id: "other" };
    const changed = mapRequest(req).body.input as any[];
    expect(changed).toHaveLength(2);
    expect(changed[1]).toMatchObject({
      type: "function_call",
      call_id: "call_0",
    });
    expect(JSON.stringify(changed)).not.toContain("opaque");
  });
  it("keeps parallel function calls separate and honors final arguments", async () => {
    const a = functionItem(),
      b = functionItem(1);
    vi.stubGlobal("fetch", async () =>
      sseResponse(
        [
          {
            type: "response.output_item.added",
            output_index: 0,
            item: { ...a, arguments: "" },
          },
          {
            type: "response.output_item.added",
            output_index: 1,
            item: { ...b, arguments: "" },
          },
          {
            type: "response.function_call_arguments.delta",
            item_id: a.id,
            output_index: 0,
            delta: '{"value":"a"}',
          },
          {
            type: "response.function_call_arguments.delta",
            item_id: b.id,
            output_index: 1,
            delta: '{"value":"b"}',
          },
          {
            type: "response.function_call_arguments.done",
            item_id: a.id,
            output_index: 0,
            arguments: a.arguments,
          },
          { type: "response.output_item.done", output_index: 1, item: b },
          { type: "response.completed", response: { status: "completed" } },
        ],
        false,
      ),
    );
    expect(
      (await streamAdapter(input())).toolCalls.map((c) => [c.id, c.arguments]),
    ).toEqual([
      ["call_0", { value: "abc" }],
      ["call_1", { value: "abc" }],
    ]);
  });
  it.each([
    { type: "error", message: "Rejected api-secret" },
    {
      type: "response.failed",
      response: { error: { message: "Rejected api-secret" } },
    },
  ])("reports and redacts $type events", async (event) => {
    vi.stubGlobal("fetch", async () => sseResponse([event], false));
    await expect(streamAdapter(input())).rejects.toMatchObject({
      message: "Provider stream error: Rejected [redacted]",
    });
  });
  it("accepts named SSE events when data omits type", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response('event: error\ndata: {"message":"denied"}\n\n'),
    );
    await expect(streamAdapter(input())).rejects.toThrow("denied");
  });
  it.each([
    { frames: [] },
    { frames: ["[DONE]"] },
    { frames: [{ type: "response.output_text.delta", delta: "Partial" }] },
  ])("rejects streams without terminal responses (%j)", async ({ frames }) => {
    vi.stubGlobal("fetch", async () => sseResponse(frames, false));
    await expect(streamAdapter(input())).rejects.toThrow(
      "before a completion marker",
    );
  });
  it.each([
    { ...functionItem(), arguments: "{" },
    { ...functionItem(), arguments: "[]" },
    { ...functionItem(), call_id: "" },
    { ...functionItem(), name: "unknown" },
  ])("rejects invalid tool calls (%j)", async (item) => {
    vi.stubGlobal("fetch", async () => sseResponse([terminal([item])], false));
    await expect(streamAdapter(input())).rejects.toThrow(
      /invalid arguments|call ID|not offered/,
    );
  });
  it("marks token-limited text and never executes incomplete calls", async () => {
    const response = {
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [] as unknown[],
    };
    vi.stubGlobal("fetch", async () =>
      sseResponse([{ type: "response.incomplete", response }], false),
    );
    expect((await streamAdapter(input())).finishReason).toBe("length");
    response.output = [functionItem()];
    await expect(streamAdapter(input())).rejects.toThrow("not executed");
  });
  it("aborts an idle Responses stream after partial text", async () => {
    const controller = new AbortController(),
      cancelled = vi.fn();
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(
                new TextEncoder().encode(
                  'data: {"type":"response.output_text.delta","output_index":0,"delta":"Partial"}\n\n',
                ),
              );
            },
            cancel: cancelled,
          }),
        ),
    );
    const req = input();
    req.request.signal = controller.signal;
    const pending = streamAdapter({
      ...req,
      onEvent: () => controller.abort(new Error("Stopped")),
    });
    await expect(pending).rejects.toThrow("Stopped");
    expect(cancelled).toHaveBeenCalledOnce();
  });
});

describe("Responses provider integration", () => {
  it("exposes template modes and rebases GPT-6 capabilities on API switches", async () => {
    h = await harness();
    const templates = await h.rpc("ai.providers.templates", {});
    expect(templates.find((t) => t.id === "openai")).toMatchObject({
      api: "openai-responses",
      supportedApis: ["openai", "openai-responses"],
    });
    expect(templates.find((t) => t.id === "cliproxyapi")).toMatchObject({
      api: "openai",
      supportedApis: ["openai", "openai-responses"],
    });
    expect(
      templates
        .filter((t) => !["openai", "anthropic", "google"].includes(t.id))
        .every((t) => t.api === "openai"),
    ).toBe(true);
    expect(templates.every((t) => t.supportedApis?.includes(t.api))).toBe(true);
    const p = await h.rpc("ai.providers.upsert", {
      provider: {
        ...configuredProvider,
        models: [{ ...model, capabilities: {} }],
      },
    });
    expect(p.models[0].capabilities.tools).toBe(false);
    const responses = await h.rpc("ai.providers.upsert", {
      provider: { ...p, api: "openai-responses" },
    });
    expect(responses.models[0].capabilities).toMatchObject({
      tools: true,
      pdf: true,
      temperature: false,
    });
    const chat = await h.rpc("ai.providers.upsert", {
      provider: { ...responses, api: "openai" },
    });
    expect(chat.models[0].capabilities.tools).toBe(false);
    await expect(
      h.rpc("ai.providers.upsert", {
        provider: { ...p, api: "invalid" as any },
      }),
    ).rejects.toThrow("supported API");
  });
  it("runs the GPT-6 tool loop with stateless reasoning replay and accumulated usage", async () => {
    h = await harness();
    const p = await h.rpc("ai.providers.upsert", {
      provider: {
        ...configuredProvider,
        api: "openai-responses",
        models: [{ ...model, capabilities: {} }],
      },
    });
    const call = vi.fn(async () => ({ found: true }));
    h.ctx.tools.registerProvider({
      id: "test",
      list: async () => [tool],
      call,
    });
    const bodies: any[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      return bodies.length === 1
        ? toolStream()
        : sseResponse(
            [
              {
                type: "response.output_text.delta",
                output_index: 0,
                delta: "Found it",
              },
              terminal(),
            ],
            false,
          );
    });
    const result = await h.ctx.ai.complete({
      model: `${p.id}/${model.id}`,
      messages: [{ role: "user", content: "Lookup" }],
      tools: [tool],
    });
    expect(call).toHaveBeenCalledExactlyOnceWith(
      tool.name,
      { value: "abc" },
      expect.anything(),
    );
    expect(bodies[1].input).toMatchObject([
      { role: "user" },
      { type: "reasoning", encrypted_content: "opaque" },
      { type: "function_call", call_id: "call_0" },
      {
        type: "function_call_output",
        call_id: "call_0",
        output: '{"found":true}',
      },
    ]);
    expect(
      bodies.every((b) => b.store === false && !b.previous_response_id),
    ).toBe(true);
    expect(result).toMatchObject({
      text: "Found it",
      toolCalls: [{ status: "done" }],
      usage: { inputTokens: 18, outputTokens: 14, reasoningTokens: 8 },
    });
  });
});
