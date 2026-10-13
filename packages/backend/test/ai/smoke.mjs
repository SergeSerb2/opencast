/** Run after `pnpm --filter @surgecast/backend build`. All AI traffic stays on loopback. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import WebSocket from "ws";
const dir = await mkdtemp(join(tmpdir(), "surgecast-ai-smoke-"));
const requests = [];
const mock = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/v1/models") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
    return;
  }
  if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body);
  requests.push(input);
  const title = input.messages[0]?.content?.includes("Name this conversation");
  const answer = title
    ? "Local Provider Smoke Test"
    : "Hello from your local provider";
  res.writeHead(200, { "Content-Type": "text/event-stream" });
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
      const match = logs.match(/SURGECAST_BACKEND_READY (\{[^\n]+\})/);
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
  const provider = await rpc("ai.providers.upsert", {
    provider: {
      name: "Mock OpenAI-compatible",
      template: "custom",
      api: "openai",
      baseUrl: `http://127.0.0.1:${mock.address().port}/v1`,
      autoFetchModels: true,
    },
  });
  const refreshed = await rpc("ai.providers.refreshModels", {
    id: provider.id,
  });
  assert.equal(refreshed.models[0].id, "mock-model");
  const chat = await rpc("ai.chats.create");
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
    requests.at(-1).messages.filter((m) => m.role === "user").length,
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
      streamedText: stored.messages.find(
        (m) => m.id === first.assistantMessageId,
      ).content,
      title: stored.chat.title,
      persistedMessages: (await rpc("ai.chats.get", { id: chat.id })).messages
        .length,
      providerRequests: requests.length,
      quickAiStored: true,
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
