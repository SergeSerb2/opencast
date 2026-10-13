import { RpcErrorCode, type AIAttachment, type AIChat, type AICommand, type AIMessage, type AIStreamEvent, type AIToolCall, type BackendEvents, type BackendMethod, type BackendParams, type BackendResult, type ModelRef, type SettingsValues } from "@surgecast/protocol";
import type { Emitter } from "../emitter";
import { RpcError } from "../errors";
import { AI_ANSWERS, AI_CHATS, AI_COMMANDS, AI_DEFAULT_ANSWER, AI_MESSAGES, AI_PRESETS, AI_TOOLS } from "./fixtures/ai";
import { PROVIDERS } from "./fixtures/content";

type Handlers = { [M in BackendMethod]?: (params: BackendParams<M>) => BackendResult<M> | Promise<BackendResult<M>> };

interface Run {
  streamId: string;
  chatId: string;
  message: AIMessage;
  stopped: boolean;
  timers: Map<ReturnType<typeof setTimeout>, () => void>;
  confirmations: Map<string, (approved: boolean) => void>;
}

let ids = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++ids).toString(36)}`;

function notFound(what: string): never {
  throw new RpcError({ code: RpcErrorCode.NotFound, message: `${what} not found` });
}

function modelOf(ref: ModelRef | undefined) {
  const [providerId, ...rest] = (ref ?? "").split("/");
  return PROVIDERS.find((p) => p.id === providerId)?.models.find((m) => m.id === rest.join("/"));
}

function defaultModel(settings: SettingsValues, purpose: "chat" | "quick-ai"): ModelRef {
  const preferred = purpose === "chat" ? settings["ai.chatModel"] : settings["ai.quickAiModel"];
  return preferred ?? `${PROVIDERS[0].id}/${PROVIDERS[0].models[0].id}`;
}

/** Split an answer into word-sized chunks so streaming looks like a real provider. */
function chunks(text: string): string[] {
  return text.match(/\s*\S+\s*/g) ?? [text];
}

function titleFrom(prompt: string): string {
  const words = prompt
    .replace(/[`*_#>@]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");
  return words ? words[0].toUpperCase() + words.slice(1) : "New Chat";
}

/**
 * The AI part of the mock backend: chats with branches, streaming answers with
 * reasoning, tool calls (with confirmation) and errors, Quick AI, AI Commands,
 * presets and tools — the same events and persistence behaviour as the real
 * backend, so the AI Chat window and Quick AI can be built and screenshotted.
 */
/** `listCommands` lets another mock own the AI Commands store (the launcher views edit it). */
export function createAiMockHandlers(events: Emitter<BackendEvents>, settings: SettingsValues, listCommands: () => AICommand[] = () => AI_COMMANDS): Handlers {
  const chats: AIChat[] = AI_CHATS.map((c) => ({ ...c }));
  const messages: AIMessage[] = AI_MESSAGES.map((m) => ({ ...m }));
  const runs = new Map<string, Run>();
  const queues = new Map<string, Promise<void>>();

  const chatById = (id: string) => chats.find((c) => c.id === id) ?? notFound(`AI chat ${id}`);
  const chatMessages = (id: string) => messages.filter((m) => m.chatId === id).sort((a, b) => a.createdAt - b.createdAt);
  const changed = (chatId: string) => events.emit("ai.chats.changed", { chatId });
  const emit = (event: AIStreamEvent) => events.emit("ai.stream", event);

  const branchOf = (chatId: string, leaf: string | undefined): AIMessage[] => {
    const path: AIMessage[] = [];
    const seen = new Set<string>();
    for (let id = leaf; id && !seen.has(id); ) {
      seen.add(id);
      const m = messages.find((x) => x.id === id && x.chatId === chatId);
      if (!m) break;
      path.unshift(m);
      id = m.parentId;
    }
    return path;
  };

  const createChat = (input: BackendParams<"ai.chats.create">): AIChat => {
    const preset = input.presetId ? (AI_PRESETS.find((p) => p.id === input.presetId) ?? notFound(`Preset ${input.presetId}`)) : undefined;
    const source = input.source ?? "chat";
    const chat: AIChat = {
      id: uid("chat"),
      title: input.title?.trim() || "New Chat",
      titleSource: input.title?.trim() ? "user" : "automatic",
      model: input.model ?? preset?.model ?? defaultModel(settings, source === "chat" ? "chat" : "quick-ai"),
      presetId: input.presetId,
      creativity: preset?.creativity,
      tools: preset?.tools ?? [],
      webSearch: preset?.webSearch ?? false,
      source,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    chats.unshift(chat);
    changed(chat.id);
    return chat;
  };

  const updateChat = (id: string, patch: Partial<AIChat>): AIChat => {
    const chat = chatById(id);
    if (patch.currentLeafId && !messages.some((m) => m.id === patch.currentLeafId && m.chatId === id)) notFound("Chat branch");
    if (patch.title !== undefined && !patch.title.trim()) throw new RpcError({ code: RpcErrorCode.InvalidParams, message: "Chat title cannot be empty" });
    Object.assign(chat, patch, patch.title !== undefined ? { titleSource: "user" } : {}, { updatedAt: Date.now() });
    changed(id);
    return chat;
  };

  const wait = (run: Run, ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        run.timers.delete(timer);
        resolve();
      }, ms);
      run.timers.set(timer, resolve);
    });

  /** Tool calls the answer makes: web search when enabled, otherwise the first tool of each @mentioned toolset. */
  const plannedCalls = (chat: AIChat, prompt: string): AIToolCall[] => {
    const calls: AIToolCall[] = [];
    if (chat.webSearch || chat.tools?.includes("web")) calls.push({ id: uid("call"), name: "web.search", title: "Search the Web", arguments: { query: prompt.slice(0, 80) }, status: "running" });
    for (const toolset of chat.tools ?? []) {
      if (toolset === "web") continue;
      const tools = AI_TOOLS.filter((t) => t.toolset === toolset);
      const tool = (/create|open|new|add|notify/i.test(prompt) ? tools.find((t) => t.requiresConfirmation) : undefined) ?? tools[0];
      if (tool) calls.push({ id: uid("call"), name: tool.name, title: tool.title, arguments: tool.requiresConfirmation ? { title: titleFrom(prompt) } : { query: prompt.slice(0, 60) }, status: tool.requiresConfirmation && !settings["ai.alwaysAllowedTools"].includes(tool.name) ? "awaiting-confirmation" : "running" });
    }
    return calls;
  };

  const execute = async (run: Run, prompt: string) => {
    if (run.stopped) return;
    const chat = chatById(run.chatId);
    const { message } = run;
    const model = modelOf(message.model);
    await wait(run, 280);
    if (run.stopped) return;
    emit({ type: "start", streamId: run.streamId, chatId: run.chatId, messageId: message.id, model: message.model ?? "" });

    if (/\berror\b|\bfail/i.test(prompt)) {
      await wait(run, 500);
      if (run.stopped) return;
      const error = "401 Unauthorized: the API key was rejected by the provider.";
      Object.assign(message, { status: "error", error, updatedAt: Date.now() });
      emit({ type: "error", streamId: run.streamId, message: error, status: 401 });
      return;
    }

    const canned = AI_ANSWERS.find((a) => a.match.test(prompt));
    if (model?.capabilities.reasoning && prompt.length > 12) {
      const reasoning = canned?.reasoning ?? `Let me work out what is being asked: “${prompt.slice(0, 60)}”. A short, structured answer with an example will help most.`;
      for (const part of chunks(reasoning)) {
        await wait(run, 35);
        if (run.stopped) return;
        message.reasoning = (message.reasoning ?? "") + part;
        emit({ type: "reasoning", streamId: run.streamId, delta: part });
      }
    }

    for (const planned of plannedCalls(chat, prompt)) {
      let call = planned;
      message.toolCalls = [...(message.toolCalls ?? []), call];
      emit({ type: "tool-call", streamId: run.streamId, call });
      if (call.status === "awaiting-confirmation") {
        const approved = await new Promise<boolean>((resolve) => run.confirmations.set(call.id, resolve));
        run.confirmations.delete(call.id);
        if (run.stopped) return;
        call = { ...call, status: approved ? "running" : "rejected", error: approved ? undefined : "The user declined this action." };
        emit({ type: "tool-call", streamId: run.streamId, call });
      }
      if (call.status === "running") {
        await wait(run, 900);
        if (run.stopped) return;
        call = { ...call, status: "done", result: call.name === "web.search" ? { results: [{ title: "Example result", url: "https://example.com" }] } : { ok: true } };
      }
      message.toolCalls = message.toolCalls.map((c) => (c.id === call.id ? call : c));
      emit({ type: "tool-result", streamId: run.streamId, call });
    }

    const answer = canned?.answer ?? AI_DEFAULT_ANSWER(prompt);
    for (const part of chunks(answer)) {
      await wait(run, 18 + Math.random() * 30);
      if (run.stopped) return;
      message.content += part;
      message.updatedAt = Date.now();
      emit({ type: "text", streamId: run.streamId, delta: part });
    }
    const usage = { inputTokens: 120 + prompt.length, outputTokens: Math.round(answer.length / 4), reasoningTokens: message.reasoning ? Math.round(message.reasoning.length / 4) : undefined };
    Object.assign(message, { status: "complete", usage, updatedAt: Date.now() });
    chat.updatedAt = Date.now();
    emit({ type: "done", streamId: run.streamId, usage, finishReason: "stop" });

    const userTurns = branchOf(chat.id, message.id).filter((m) => m.role === "user");
    if (chat.title === "New Chat" && chat.titleSource !== "user" && userTurns.length === 1) {
      await wait(run, 300);
      const title = titleFrom(userTurns[0].content);
      Object.assign(chat, { title, titleSource: "automatic", updatedAt: Date.now() });
      emit({ type: "title", streamId: run.streamId, chatId: chat.id, title });
      changed(chat.id);
    }
  };

  const send = (input: BackendParams<"ai.chats.send">): BackendResult<"ai.chats.send"> => {
    const chat = chatById(input.chatId);
    if (chat.archived) throw new RpcError({ code: RpcErrorCode.InvalidParams, message: "Unarchive this chat before sending a message" });
    const busy = [...runs.values()].some((r) => r.chatId === chat.id);
    if ((input.editMessageId || input.regenerateMessageId) && busy) throw new RpcError({ code: RpcErrorCode.InvalidParams, message: "Stop the current response before editing or regenerating" });
    let parentId = chat.currentLeafId;
    let user: AIMessage | undefined;
    let prompt = input.content;
    if (input.regenerateMessageId) {
      const original = messages.find((m) => m.id === input.regenerateMessageId && m.chatId === chat.id && m.role === "assistant") ?? notFound(`Message ${input.regenerateMessageId}`);
      parentId = original.parentId;
      prompt = messages.find((m) => m.id === parentId)?.content ?? "";
    } else {
      let attachments: AIAttachment[] | undefined = input.attachments;
      if (input.editMessageId) {
        const original = messages.find((m) => m.id === input.editMessageId && m.chatId === chat.id && m.role === "user") ?? notFound(`Message ${input.editMessageId}`);
        parentId = original.parentId;
        attachments ??= original.attachments;
      }
      if (!input.content.trim() && !attachments?.length) throw new RpcError({ code: RpcErrorCode.InvalidParams, message: "A message needs text or an attachment" });
      user = { id: uid("msg"), chatId: chat.id, parentId, role: "user", content: input.content, attachments, status: "complete", createdAt: Date.now(), updatedAt: Date.now() };
      messages.push(user);
      parentId = user.id;
    }
    const assistant: AIMessage = { id: uid("msg"), chatId: chat.id, parentId, role: "assistant", content: "", toolCalls: [], status: "streaming", model: input.model ?? chat.model, createdAt: Date.now() + 1, updatedAt: Date.now() + 1 };
    messages.push(assistant);
    updateChat(chat.id, { currentLeafId: assistant.id, ...(input.model ? { model: input.model } : {}) });
    const run: Run = { streamId: uid("stream"), chatId: chat.id, message: assistant, stopped: false, timers: new Map(), confirmations: new Map() };
    runs.set(run.streamId, run);
    const previous = queues.get(chat.id) ?? Promise.resolve();
    const promise = previous
      .then(() => execute(run, prompt))
      .catch(() => {
        if (run.stopped) return;
        Object.assign(assistant, { status: "error", error: "The mock response failed." });
        emit({ type: "error", streamId: run.streamId, message: "The mock response failed." });
      })
      .finally(() => runs.delete(run.streamId));
    queues.set(chat.id, promise);
    void promise.finally(() => { if (queues.get(chat.id) === promise) queues.delete(chat.id); });
    return { streamId: run.streamId, userMessageId: user?.id, assistantMessageId: assistant.id };
  };

  const listChats = ({ query, includeArchived, source }: BackendParams<"ai.chats.list">) => {
    const q = query?.trim().toLowerCase();
    return chats
      .filter((c) => (includeArchived || !c.archived) && (!source || c.source === source))
      .filter((c) => !q || `${c.title}\n${chatMessages(c.id).map((m) => m.content).join("\n")}`.toLowerCase().includes(q))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt);
  };

  // Dev: `?mockNoProviders=1` shows the “no provider configured” states.
  const noProviders = typeof location !== "undefined" && new URLSearchParams(location.search).has("mockNoProviders");

  return {
    "ai.models.list": () =>
      noProviders ? [] : PROVIDERS.flatMap((p) => p.models.filter((m) => m.enabled).map((m) => ({ ref: `${p.id}/${m.id}`, providerId: p.id, providerName: p.name, modelId: m.id, name: m.name, capabilities: m.capabilities, contextWindow: m.contextWindow }))),
    "ai.chats.list": listChats,
    "ai.chats.get": ({ id }) => {
      const chat = chats.find((c) => c.id === id);
      return chat ? { chat, messages: chatMessages(id) } : null;
    },
    "ai.chats.create": createChat,
    "ai.chats.update": ({ id, patch }) => updateChat(id, patch),
    "ai.chats.delete": ({ id }) => {
      chatById(id);
      for (const run of runs.values()) {
        if (run.chatId !== id) continue;
        run.stopped = true;
        for (const [timer, resolve] of run.timers) { clearTimeout(timer); resolve(); }
        for (const resolve of run.confirmations.values()) resolve(false);
        emit({ type: "done", streamId: run.streamId, finishReason: "stopped" });
      }
      chats.splice(chats.findIndex((c) => c.id === id), 1);
      for (let i = messages.length - 1; i >= 0; i--) if (messages[i].chatId === id) messages.splice(i, 1);
      changed(id);
    },
    "ai.chats.export": ({ id, format }) => {
      const chat = chatById(id);
      const branch = branchOf(id, chat.currentLeafId);
      const content = format === "json" ? JSON.stringify({ schemaVersion: 1, chat, messages: chatMessages(id) }, null, 2) : `# ${chat.title}\n\n${branch.map((m) => `## ${m.role === "user" ? "You" : "Surgecast"}\n\n${m.content}`).join("\n\n")}`;
      return { content, fileName: `${chat.title.replace(/[^\p{L}\p{N}_-]/gu, "-").slice(0, 80) || "chat"}.${format === "json" ? "json" : "md"}` };
    },
    "ai.chats.send": send,
    "ai.ask": ({ prompt, model, attachments, chatId }) => {
      const chat = chatId ? chatById(chatId) : createChat({ source: "quick-ai", model });
      const { streamId } = send({ chatId: chat.id, content: prompt, attachments, model });
      return { streamId, chatId: chat.id };
    },
    "ai.stop": ({ streamId }) => {
      const run = runs.get(streamId);
      if (!run || run.stopped) return;
      run.stopped = true;
      for (const [timer, resolve] of run.timers) { clearTimeout(timer); resolve(); }
      run.timers.clear();
      for (const resolve of run.confirmations.values()) resolve(false);
      Object.assign(run.message, { status: "stopped", updatedAt: Date.now() });
      runs.delete(streamId);
      emit({ type: "done", streamId, finishReason: "stopped" });
    },
    "ai.confirmTool": ({ streamId, callId, approved, always }) => {
      const resolve = runs.get(streamId)?.confirmations.get(callId) ?? notFound("Pending tool confirmation");
      if (approved && always) {
        const name = runs.get(streamId)?.message.toolCalls?.find((c) => c.id === callId)?.name;
        if (name) {
          settings["ai.alwaysAllowedTools"] = [...new Set([...settings["ai.alwaysAllowedTools"], name])];
          events.emit("settings.changed", { key: "ai.alwaysAllowedTools", value: settings["ai.alwaysAllowedTools"] });
        }
      }
      resolve(approved);
    },
    "ai.commands.list": () => listCommands(),
    "ai.commands.run": ({ id, arguments: args, selection }) => {
      const command = listCommands().find((c) => c.id === id) ?? notFound(`AI command ${id}`);
      const prompt = command.prompt
        .replace(/\{selection[^}]*\}/g, selection ?? "Surgecast is a launcher that let you run commands and ask AI from anywhere.")
        .replace(/\{argument[^}]*\}/g, () => Object.values(args ?? {})[0] ?? "")
        .replace(/\{browser-tab[^}]*\}/g, "# Example page\n\nThis page explains how launchers work.");
      const chat = createChat({ source: "ai-command", model: command.model });
      const { streamId } = send({ chatId: chat.id, content: prompt });
      return { streamId, chatId: chat.id, prompt };
    },
    "ai.presets.list": () => AI_PRESETS,
    "ai.tools.list": () => AI_TOOLS,
  };
}
