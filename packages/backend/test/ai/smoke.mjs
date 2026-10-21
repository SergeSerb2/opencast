/** Run after `pnpm --filter @opencast/backend build`. All AI traffic stays on loopback. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import WebSocket from "ws";
const dir = await mkdtemp(join(tmpdir(), "opencast-ai-smoke-"));
const requests = [];
const responsesMode = process.argv.includes("--responses");
const wireTool = `sc_${createHash("sha256").update("datetime.now").digest("hex").slice(0, 24)}`;
const reasoningItem = {
  type: "reasoning",
  id: "rs_smoke",
  summary: [{ type: "summary_text", text: "Check the clock" }],
  encrypted_content: "mock-encrypted-reasoning",
};
const callItem = {
  type: "function_call",
  id: "fc_smoke",
  call_id: "call_smoke",
  name: wireTool,
  arguments: "{}",
};
const mock = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/v1/models") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        data: [{ id: responsesMode ? "gpt-6-astra" : "mock-model" }],
      }),
    );
    return;
  }
  if (
    req.method !== "POST" ||
    req.url !== (responsesMode ? "/v1/responses" : "/v1/chat/completions")
  ) {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body);
  requests.push(input);
  const title = responsesMode
    ? input.instructions?.includes("Name this conversation")
    : input.messages[0]?.content?.includes("Name this conversation");
  const answer = title
    ? "Local Provider Smoke Test"
    : "Hello from your local provider";
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  if (responsesMode) {
    const event = (data) =>
      res.write(`event: ${data.type}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`);
    if (
      !title &&
      input.tools?.length &&
      !input.input.some((item) => item.type === "function_call_output")
    ) {
      event({
        type: "response.output_item.added",
        output_index: 0,
        item: { ...reasoningItem, summary: [] },
      });
      event({
        type: "response.reasoning_summary_text.delta",
        output_index: 0,
        delta: "Check the clock",
      });
      event({
        type: "response.output_item.done",
        output_index: 0,
        item: reasoningItem,
      });
      event({
        type: "response.output_item.added",
        output_index: 1,
        item: { ...callItem, arguments: "" },
      });
      event({
        type: "response.function_call_arguments.delta",
        output_index: 1,
        item_id: callItem.id,
        delta: "{}",
      });
      event({
        type: "response.function_call_arguments.done",
        output_index: 1,
        item_id: callItem.id,
        arguments: "{}",
      });
      event({
        type: "response.output_item.done",
        output_index: 1,
        item: callItem,
      });
      event({
        type: "response.completed",
        response: {
          status: "completed",
          output: [reasoningItem, callItem],
          usage: {
            input_tokens: 9,
            output_tokens: 7,
            output_tokens_details: { reasoning_tokens: 4 },
          },
        },
      });
    } else {
      for (const delta of [answer.slice(0, 6), answer.slice(6)])
        event({ type: "response.output_text.delta", output_index: 0, delta });
      event({
        type: "response.completed",
        response: {
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: answer }],
            },
          ],
          usage: { input_tokens: 9, output_tokens: 7 },
        },
      });
    }
    res.end();
    return;
  }
  res.write(": keep-alive\r\n\r\n");
  for (const text of [answer.slice(0, 6), answer.slice(6)]) {
    res.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\r\n\r\n`,
    );
    await new Promise((r) => setTimeout(r, 5));
  }
  res.write(
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 9, completion_tokens: 7 } })}\r\n\r\n`,
  );
  res.end("data: [DONE]\r\n\r\n");
});
await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
const root = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const child = spawn(
  process.execPath,
  [
    join(root, "packages/backend/dist/index.mjs"),
    "--no-native",
    "--dev",
    "--data-dir",
    dir,
    "--port",
    "0",
    "--token",
    "smoke-token",
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "",
  socket;
const exit = once(child, "exit");
try {
  const ready = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Backend did not become ready")),
      20_000,
    );
    child.stderr.on("data", (chunk) => {
      logs += chunk;
      const match = logs.match(/OPENCAST_BACKEND_READY (\{[^\n]+\})/);
      if (match) {
        clearTimeout(timeout);
        resolve(JSON.parse(match[1]));
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Backend exited with ${code}: ${logs.slice(-2000)}`));
    });
  });
  socket = new WebSocket(`ws://127.0.0.1:${ready.port}/rpc?token=smoke-token`);
  await once(socket, "open");
  const pending = new Map(),
    events = [];
  let nextId = 0;
  socket.on("message", (raw) => {
    const message = JSON.parse(raw);
    if (message.id) {
      const item = pending.get(message.id);
      if (item) {
        pending.delete(message.id);
        clearTimeout(item.timer);
        message.error
          ? item.reject(new Error(message.error.message))
          : item.resolve(message.result);
      }
    } else if (message.method === "event") events.push(message.params);
  });
  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, 15_000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  const terminal = async (id) => {
    for (let i = 0; i < 1000; i++) {
      const value = events.find(
        (e) =>
          e.topic === "ai.stream" &&
          e.payload.streamId === id &&
          ["done", "error"].includes(e.payload.type),
      );
      if (value) return value.payload;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error("Stream timeout");
  };
  assert.deepEqual(await rpc("ai.providers.list"), []);
  const draft = {
    template: "custom",
    api: responsesMode ? "openai-responses" : "openai",
    baseUrl: `http://127.0.0.1:${mock.address().port}/v1`,
  };
  const draftResult = await rpc("ai.providers.testDraft", { provider: draft });
  assert.equal(draftResult.ok, true, draftResult.message);
  assert.equal(draftResult.modelCount, 1);
  assert.deepEqual(draftResult.sampleModelIds, [responsesMode ? "gpt-6-astra" : "mock-model"]);
  assert.deepEqual(await rpc("ai.providers.list"), [], "Draft testing must not create a provider");
  // Allocate our own ephemeral port, then close it to exercise connection refusal.
  const closed = createServer();
  await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const closedPort = closed.address().port;
  await new Promise((resolve) => closed.close(resolve));
  const failedDraft = await rpc("ai.providers.testDraft", {
    provider: { ...draft, baseUrl: `http://127.0.0.1:${closedPort}/v1` },
  });
  assert.equal(failedDraft.ok, false);
  assert.ok(failedDraft.message.includes(`Nothing answered at 127.0.0.1:${closedPort}`), failedDraft.message);
  assert.match(failedDraft.message, /running\?/);
  assert.equal(failedDraft.modelCount, 0);
  assert.deepEqual(failedDraft.sampleModelIds, []);
  assert.deepEqual(await rpc("ai.providers.list"), [], "Failed draft testing must not create a provider");
  const provider = await rpc("ai.providers.upsert", {
    provider: {
      name: "Mock OpenAI-compatible",
      template: "custom",
      api: "openai",
      baseUrl: `http://127.0.0.1:${mock.address().port}/v1`,
      autoFetchModels: true,
    },
  });
  if (responsesMode) {
    const templates = await rpc("ai.providers.templates");
    assert.equal(
      templates.find((t) => t.id === "openai").api,
      "openai-responses",
    );
    assert.ok(
      templates
        .find((t) => t.id === "cliproxyapi")
        .supportedApis.includes("openai-responses"),
    );
    assert.equal(provider.models[0].capabilities.tools, false);
    const switched = await rpc("ai.providers.upsert", {
      provider: { ...provider, api: "openai-responses" },
    });
    assert.equal(switched.models[0].capabilities.tools, true);
  }
  const refreshed = await rpc("ai.providers.refreshModels", {
    id: provider.id,
  });
  assert.equal(
    refreshed.models[0].id,
    responsesMode ? "gpt-6-astra" : "mock-model",
  );
  const requestsBeforeDeep = requests.length;
  const deep = await rpc("ai.providers.test", { id: provider.id, deep: true });
  assert.equal(deep.ok, true, deep.message);
  assert.match(deep.message, /Models: OK \(1\)\. Chat: OK\./);
  assert.equal(requests.length, requestsBeforeDeep + 1);
  const ping = requests.at(-1);
  const pingContent = (responsesMode ? ping.input : ping.messages).find(m => m.role === "user").content;
  if (responsesMode) assert.deepEqual(pingContent, [{ type: "input_text", text: "ping" }]);
  else assert.equal(pingContent, "ping");
  assert.equal(responsesMode ? ping.max_output_tokens : ping.max_tokens, 1);
  assert.ok(!ping.tools?.length, "Deep testing must not send tools");
  assert.deepEqual(await rpc("ai.chats.list"), [], "Deep testing must not store a chat");
  const chat = await rpc("ai.chats.create");
  if (responsesMode)
    await rpc("ai.chats.update", {
      id: chat.id,
      patch: { tools: ["builtin"] },
    });
  const first = await rpc("ai.chats.send", {
    chatId: chat.id,
    content: "Say hello",
  });
  assert.equal(typeof first.streamId, "string");
  assert.equal((await terminal(first.streamId)).type, "done");
  const stored = await rpc("ai.chats.get", { id: chat.id });
  assert.equal(stored.messages.length, 2);
  assert.equal(
    stored.messages.find((m) => m.id === first.assistantMessageId).content,
    "Hello from your local provider",
  );
  assert.equal(
    stored.messages.find((m) => m.id === first.assistantMessageId).status,
    "complete",
  );
  if (responsesMode) {
    const assistant = stored.messages.find(
      (m) => m.id === first.assistantMessageId,
    );
    assert.equal(assistant.toolCalls[0].name, "datetime.now");
    assert.equal(assistant.toolCalls[0].status, "done");
    assert.ok(assistant.toolCalls[0].result.iso);
    assert.deepEqual(
      assistant.completedTurns.map((t) => t.role),
      ["assistant", "tool", "assistant"],
    );
    assert.deepEqual(assistant.usage, {
      inputTokens: 18,
      outputTokens: 14,
      reasoningTokens: 4,
    });
    const continuation = requests.find((r) =>
      r.input.some((item) => item.type === "function_call_output"),
    );
    assert.deepEqual(continuation.input[1], reasoningItem);
    assert.deepEqual(continuation.input[2], callItem);
    assert.equal(continuation.input[3].call_id, "call_smoke");
    assert.ok(JSON.parse(continuation.input[3].output).iso);
    assert.ok(
      requests.every((r) => r.store === false && !r.previous_response_id),
    );
  }
  assert.equal(stored.chat.title, "Local Provider Smoke Test");
  assert.equal(
    events
      .filter(
        (e) =>
          e.topic === "ai.stream" &&
          e.payload.streamId === first.streamId &&
          e.payload.type === "text",
      )
      .map((e) => e.payload.delta)
      .join(""),
    "Hello from your local provider",
  );
  const second = await rpc("ai.chats.send", {
    chatId: chat.id,
    content: "Follow up",
  });
  await terminal(second.streamId);
  assert.equal(
    (responsesMode ? requests.at(-1).input : requests.at(-1).messages).filter(
      (m) => m.role === "user",
    ).length,
    2,
  );
  const markdown = await rpc("ai.chats.export", {
    id: chat.id,
    format: "markdown",
  });
  assert.ok(markdown.content.includes("Say hello"));
  assert.ok(markdown.content.includes("Follow up"));
  const quick = await rpc("ai.ask", { prompt: "Quick question" });
  await terminal(quick.streamId);
  assert.equal(
    (await rpc("ai.chats.get", { id: quick.chatId })).chat.source,
    "quick-ai",
  );
  assert.ok((await rpc("ai.commands.list")).length >= 18);
  assert.ok(
    !logs.includes("service ai failed") &&
      !logs.includes("unhandled rejection"),
  );
  console.log(
    JSON.stringify({
      result: "passed",
      api: responsesMode ? "openai-responses" : "openai",
      streamedText: stored.messages.find(
        (m) => m.id === first.assistantMessageId,
      ).content,
      title: stored.chat.title,
      persistedMessages: (await rpc("ai.chats.get", { id: chat.id })).messages
        .length,
      providerRequests: requests.length,
      quickAiStored: true,
      draftTest: draftResult.ok,
      closedPortTest: !failedDraft.ok,
      deepTest: deep.ok,
    }),
  );
} finally {
  if (socket) {
    socket.close();
    socket.terminate();
  }
  child.kill("SIGTERM");
  await exit;
  mock.closeAllConnections();
  await new Promise((resolve) => mock.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
