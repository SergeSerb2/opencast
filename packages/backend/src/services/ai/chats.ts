import { randomUUID } from "node:crypto";
import { monotonicNow } from "../../util/ids";
import type {
  AIChat,
  AIMessage,
  AIPreset,
  AIToolCall,
  BackendMethods,
  AICommandOutput,
} from "@surgecast/protocol";
import type {
  AIChatTurn,
  AICompletionRequest,
  AppContext,
} from "../../context";
import { CompletionEngine } from "./engine";
import { MCP } from "./mcp";
import {
  ProviderError,
  safeError,
  abortable,
  type CompletionEvent,
} from "./common";

/** Follow parent pointers, never creation times: sibling branches must not leak into context. */
export function visibleBranch(
  messages: AIMessage[],
  leaf?: string,
): AIMessage[] {
  if (!leaf) return [];
  const byId = new Map(messages.map((m) => [m.id, m]));
  const seen = new Set<string>(),
    result: AIMessage[] = [];
  for (let id: string | undefined = leaf; id;) {
    if (seen.has(id)) throw new Error("Chat branch contains a cycle");
    seen.add(id);
    const message = byId.get(id);
    if (!message)
      throw new Error(`Chat branch references missing message ${id}`);
    result.push(message);
    id = message.parentId;
  }
  return result.reverse();
}
export function replayMessage(message: AIMessage): AIChatTurn[] {
  if (!message.completedTurns?.length) {
    const calls = message.role === "assistant" ? (message.toolCalls ?? []) : [];
    return [
      {
        role: message.role,
        content: message.content,
        attachments: message.attachments,
        toolCalls: calls.length ? calls : undefined,
      },
      ...calls.map((call) => ({
        role: "tool" as const,
        name: call.name,
        toolCallId: call.id,
        content: JSON.stringify(
          call.status === "done"
            ? (call.result ?? null)
            : {
                error:
                  call.error ??
                  (call.status === "awaiting-confirmation" ||
                  call.status === "rejected"
                    ? "Tool did not run; approval was cancelled or declined."
                    : "The tool outcome was not recorded. Check its state before repeating it."),
              },
        ),
      })),
    ];
  }
  const turns: AIChatTurn[] = structuredClone(message.completedTurns);
  const recordedText = turns
    .filter((t) => t.role === "assistant")
    .map((t) => t.content)
    .join("");
  // A cancelled run may have advertised a tool before its result was available.
  const results = new Set(
    turns.filter((t) => t.role === "tool").map((t) => t.toolCallId),
  );
  for (let index = 0; index < turns.length; index++) {
    const missing = (turns[index].toolCalls ?? []).filter(
      (c) => !results.has(c.id),
    );
    if (missing.length)
      turns.splice(
        index + 1,
        0,
        ...missing.map((c) => ({
          role: "tool" as const,
          name: c.name,
          toolCallId: c.id,
          content: JSON.stringify({
            error:
              "Response stopped before the tool result was recorded. The action outcome is unknown; check its state before repeating it.",
          }),
        })),
      );
  }
  if (
    message.content.startsWith(recordedText) &&
    message.content.length > recordedText.length
  )
    turns.push({
      role: "assistant",
      content: message.content.slice(recordedText.length),
    });
  return turns;
}
export function durationMs(value: string): number | null {
  if (value === "never") return null;
  if (value === "immediately") return 0;
  const m = /^(\d+(?:\.\d+)?)(s|m|h|d)$/.exec(value);
  return m
    ? Number(m[1]) *
        ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]] ?? 0)
    : null;
}
interface Run {
  streamId: string;
  chatId: string;
  messageId: string;
  controller: AbortController;
  confirmations: Map<
    string,
    { call: AIToolCall; resolve: (approved: boolean) => void }
  >;
  promise?: Promise<void>;
}
interface SendOptions {
  purpose?: AICompletionRequest["purpose"];
  system?: string;
  creativity?: AICompletionRequest["creativity"];
  output?: AICommandOutput;
  reasoningEffort?: AICompletionRequest["reasoningEffort"];
}
export class Chats {
  private runs = new Map<string, Run>();
  private queues = new Map<string, Promise<void>>();
  constructor(
    readonly ctx: AppContext,
    readonly engine: CompletionEngine,
    readonly mcp: MCP,
  ) {}
  get(id: string): AIChat {
    const chat = this.ctx.entities.get<AIChat>("aiChats", id)?.data;
    if (!chat) throw new Error(`AI chat ${id} was not found`);
    return chat;
  }
  messages(id: string): AIMessage[] {
    return this.ctx.entities
      .list<AIMessage>("aiMessages", { orderBy: "created" })
      .map((r) => r.data)
      .filter((m) => m.chatId === id)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }
  create(input: BackendMethods["ai.chats.create"]["params"]): AIChat {
    const preset = input.presetId
      ? this.ctx.entities.get<AIPreset>("aiPresets", input.presetId)?.data
      : undefined;
    if (input.presetId && !preset)
      throw new Error("The selected AI preset does not exist");
    const now = monotonicNow();
    const chat: AIChat = {
      id: randomUUID(),
      title: input.title?.trim() || "New Chat",
      titleSource: input.title?.trim() ? "user" : "automatic",
      model: input.model ?? preset?.model,
      presetId: input.presetId,
      source: input.source ?? "chat",
      creativity: preset?.creativity,
      reasoningEffort: preset?.reasoningEffort,
      tools: preset?.tools ?? [],
      webSearch: preset?.webSearch ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.ctx.entities.put("aiChats", chat.id, chat);
    return chat;
  }
  update(
    id: string,
    patch: BackendMethods["ai.chats.update"]["params"]["patch"],
  ): AIChat {
    const chat = this.get(id);
    if (patch.currentLeafId)
      visibleBranch(this.messages(id), patch.currentLeafId);
    if (patch.title !== undefined && !patch.title.trim())
      throw new Error("Chat title cannot be empty");
    const allowed = [
      "title",
      "pinned",
      "archived",
      "model",
      "presetId",
      "creativity",
      "webSearch",
      "tools",
      "folderId",
      "currentLeafId",
      "source",
      "reasoningEffort",
      "systemInstructions",
    ];
    const filtered = Object.fromEntries(
      Object.entries(patch).filter(([key]) => allowed.includes(key)),
    );
    const updated = {
      ...chat,
      ...filtered,
      ...(patch.title !== undefined ? { titleSource: "user" as const } : {}),
      updatedAt: Date.now(),
    };
    this.ctx.entities.put("aiChats", id, updated);
    return updated;
  }
  async delete(id: string): Promise<void> {
    this.get(id);
    for (const run of this.runs.values())
      if (run.chatId === id) run.controller.abort(new Error("Chat deleted"));
    this.ctx.db.transaction(() => {
      for (const m of this.messages(id))
        this.ctx.entities.delete("aiMessages", m.id);
      this.ctx.entities.delete("aiChats", id);
    });
  }
  send(
    input: BackendMethods["ai.chats.send"]["params"],
    options: SendOptions = {},
  ): BackendMethods["ai.chats.send"]["result"] {
    const chat = this.get(input.chatId);
    if (chat.archived)
      throw new Error("Unarchive this chat before sending a message");
    if (input.editMessageId && input.regenerateMessageId)
      throw new Error("Choose either edit or regenerate");
    if (
      (input.editMessageId || input.regenerateMessageId) &&
      [...this.runs.values()].some((r) => r.chatId === chat.id)
    )
      throw new Error(
        "Stop the current response before editing or regenerating",
      );
    const messages = this.messages(chat.id);
    let parentId = chat.currentLeafId,
      user: AIMessage | undefined;
    if (input.regenerateMessageId) {
      const original = messages.find((m) => m.id === input.regenerateMessageId);
      if (!original || original.role !== "assistant" || !original.parentId)
        throw new Error(
          "Regenerate requires an assistant message from this chat",
        );
      parentId = original.parentId;
    } else {
      let attachments = input.attachments;
      if (input.editMessageId) {
        const original = messages.find((m) => m.id === input.editMessageId);
        if (!original || original.role !== "user")
          throw new Error("Edit requires a user message from this chat");
        parentId = original.parentId;
        attachments ??= original.attachments;
      }
      if (!input.content?.trim() && !attachments?.length)
        throw new Error("A message needs text or an attachment");
      if (parentId) visibleBranch(messages, parentId);
      const now = monotonicNow();
      user = {
        id: randomUUID(),
        chatId: chat.id,
        parentId,
        role: "user",
        content: input.content,
        attachments,
        status: "complete",
        createdAt: now,
        updatedAt: now,
      };
      parentId = user.id;
    }
    const now = monotonicNow(),
      assistant: AIMessage = {
        id: randomUUID(),
        chatId: chat.id,
        parentId,
        role: "assistant",
        content: "",
        toolCalls: [],
        status: "streaming",
        model: input.model ?? chat.model,
        createdAt: now,
        updatedAt: now,
      };
    this.ctx.db.transaction(() => {
      if (user) this.ctx.entities.put("aiMessages", user.id, user);
      this.ctx.entities.put("aiMessages", assistant.id, assistant);
      this.update(chat.id, {
        currentLeafId: assistant.id,
        ...(input.model ? { model: input.model } : {}),
      });
    });
    const run: Run = {
      streamId: randomUUID(),
      chatId: chat.id,
      messageId: assistant.id,
      controller: new AbortController(),
      confirmations: new Map(),
    };
    this.runs.set(run.streamId, run);
    const previous = this.queues.get(chat.id) ?? Promise.resolve();
    const promise = previous
      .catch(() => {})
      .then(() => new Promise<void>((resolve) => setImmediate(resolve)))
      .then(() => this.execute(run, assistant, options));
    run.promise = promise;
    this.queues.set(chat.id, promise);
    void promise
      .finally(() => {
        this.runs.delete(run.streamId);
        if (this.queues.get(chat.id) === promise) this.queues.delete(chat.id);
      })
      .catch(() => {});
    return {
      streamId: run.streamId,
      userMessageId: user?.id,
      assistantMessageId: assistant.id,
    };
  }
  ask(
    input: BackendMethods["ai.ask"]["params"],
    options: SendOptions = {},
  ): BackendMethods["ai.ask"]["result"] {
    const chat = input.chatId
      ? this.get(input.chatId)
      : this.create({ source: "quick-ai", model: input.model });
    const result = this.send(
      {
        chatId: chat.id,
        content: input.prompt,
        attachments: input.attachments,
        model: input.model,
      },
      {
        purpose: "quickAi",
        system: input.system,
        creativity: input.creativity,
        ...options,
      },
    );
    return { streamId: result.streamId, chatId: chat.id };
  }
  private async execute(
    run: Run,
    assistant: AIMessage,
    options: SendOptions,
  ): Promise<void> {
    const { ctx } = this;
    const emit = (event: CompletionEvent) =>
      ctx.events.emit("ai.stream", {
        ...event,
        streamId: run.streamId,
      } as never);
    let lastPersist = 0;
    let persistTimer: NodeJS.Timeout | undefined;
    const persist = () => {
      clearTimeout(persistTimer);
      persistTimer = undefined;
      if (ctx.entities.get("aiMessages", assistant.id)) {
        assistant.updatedAt = Date.now();
        ctx.entities.put("aiMessages", assistant.id, assistant);
      }
      lastPersist = Date.now();
    };
    try {
      run.controller.signal.throwIfAborted();
      const chat = this.get(run.chatId),
        preset = chat.presetId
          ? ctx.entities.get<AIPreset>("aiPresets", chat.presetId)?.data
          : undefined;
      const branch = visibleBranch(this.messages(chat.id), assistant.parentId);
      const messages: AIChatTurn[] = branch.flatMap<AIChatTurn>(replayMessage);
      const toolsets = [
        ...new Set([
          ...(chat.tools ?? preset?.tools ?? []),
          ...(chat.webSearch ? ["web"] : []),
        ]),
      ];
      await abortable(this.mcp.ensure(toolsets), run.controller.signal);
      const tools = (await ctx.tools.list()).filter((t) =>
        toolsets.includes(t.toolset),
      );
      const system = this.systemPrompt(
        chat,
        preset,
        options,
        tools.map((t) => t.name),
      );
      const result = await this.engine.complete(
        {
          messages,
          system,
          model: assistant.model,
          purpose:
            options.purpose ??
            (chat.source === "quick-ai" ? "quickAi" : "chat"),
          creativity: options.creativity ?? chat.creativity,
          reasoningEffort:
            options.reasoningEffort ??
            chat.reasoningEffort ??
            (chat.source === "quick-ai"
              ? ctx.settings.get("ai.quickAiReasoningEffort")
              : undefined),
          tools,
          signal: run.controller.signal,
          confirmTool: (call) =>
            new Promise<boolean>((resolve) => {
              run.confirmations.set(call.id, { call, resolve });
              const cancel = () => {
                run.confirmations.delete(call.id);
                resolve(false);
              };
              run.controller.signal.addEventListener("abort", cancel, {
                once: true,
              });
              const wrapped = (value: boolean) => {
                run.controller.signal.removeEventListener("abort", cancel);
                run.confirmations.delete(call.id);
                resolve(value);
              };
              run.confirmations.set(call.id, { call, resolve: wrapped });
              if (run.controller.signal.aborted) cancel();
            }),
        },
        (event) => {
          if (event.type === "start") {
            assistant.model = event.model;
            emit({ ...event, chatId: run.chatId, messageId: assistant.id });
          } else {
            if (event.type === "text") assistant.content += event.delta;
            if (event.type === "reasoning")
              assistant.reasoning = (assistant.reasoning ?? "") + event.delta;
            if (event.type === "tool-call" || event.type === "tool-result") {
              const list = (assistant.toolCalls ??= []);
              const index = list.findIndex((c) => c.id === event.call.id);
              if (index < 0) list.push(event.call);
              else list[index] = event.call;
            }
            if (event.type === "tool-result" && event.completedTurns)
              assistant.completedTurns = event.completedTurns;
            emit(event);
          }
          if (Date.now() - lastPersist >= 100) persist();
          else
            persistTimer ??= setTimeout(
              persist,
              100 - (Date.now() - lastPersist),
            );
        },
      );
      run.controller.signal.throwIfAborted();
      assistant.content = result.text;
      assistant.reasoning = result.reasoning;
      assistant.toolCalls = result.toolCalls;
      assistant.completedTurns = result.turns.filter(
        (t): t is AIChatTurn & { role: "assistant" | "tool" } =>
          t.role === "assistant" || t.role === "tool",
      );
      assistant.usage = result.usage;
      assistant.model = result.model;
      assistant.status = "complete";
      persist();
      if (options.output === "copy")
        await ctx.native.call("clipboard.write", {
          content: { kind: "text", text: result.text },
        });
      if (options.output === "paste" || options.output === "replace")
        await ctx.native.call("input.paste", {
          content: { kind: "text", text: result.text },
          restoreClipboard: true,
        });
      await this.title(run, branch, assistant);
      emit({
        type: "done",
        usage: result.usage,
        finishReason: result.finishReason,
      });
    } catch (error) {
      const stopped = run.controller.signal.aborted;
      assistant.status = stopped ? "stopped" : "error";
      assistant.error = stopped ? undefined : safeError(error);
      persist();
      if (stopped) emit({ type: "done", finishReason: "stopped" });
      else
        emit({
          type: "error",
          message: safeError(error),
          status: error instanceof ProviderError ? error.status : undefined,
        });
    } finally {
      clearTimeout(persistTimer);
      for (const pending of run.confirmations.values()) pending.resolve(false);
      run.confirmations.clear();
    }
  }
  private systemPrompt(
    chat: AIChat,
    preset: AIPreset | undefined,
    options: SendOptions,
    tools: string[],
  ): string {
    const now = new Date();
    return [
      "You are Surgecast's assistant, running through the user's chosen AI provider. Help with the request clearly and accurately. Use Markdown where it improves readability. State uncertainty and never invent tool results.",
      `Local date and time: ${now.toLocaleString()}. Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`,
      chat.source === "quick-ai"
        ? "Keep answers compact unless the user asks for depth."
        : "Give enough detail to make the answer useful.",
      options.purpose !== "commands" && this.ctx.settings.get("ai.profile")
        ? `User-provided profile:\n${this.ctx.settings.get("ai.profile")}`
        : "",
      preset?.instructions,
      chat.systemInstructions,
      options.system,
      tools.length
        ? `Enabled tools: ${tools.join(", ")}. Use only these tools. A tool action is successful only when its result confirms success. Respect declined calls.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  private async title(
    run: Run,
    branch: AIMessage[],
    assistant: AIMessage,
  ): Promise<void> {
    const chat = this.ctx.entities.get<AIChat>("aiChats", run.chatId)?.data;
    if (
      !chat ||
      chat.titleSource === "user" ||
      chat.title !== "New Chat" ||
      branch.filter((m) => m.role === "user").length !== 1
    )
      return;
    try {
      const result = await this.engine.complete({
        purpose: "title",
        creativity: "none",
        signal: AbortSignal.any([
          run.controller.signal,
          AbortSignal.timeout(15_000),
        ]),
        maxOutputTokens: 64,
        reasoningEffort: "none",
        system:
          "Name this conversation in three to six specific words, matching the user's language. Return the name alone, without quotation marks or Markdown.",
        messages: [
          { role: "user", content: branch[0].content.slice(0, 4000) },
          { role: "assistant", content: assistant.content.slice(0, 4000) },
        ],
      });
      const title = result.text
        .split("\n")[0]
        .replace(/^[#"'\s]+|["'\s]+$/g, "")
        .slice(0, 120)
        .trim();
      if (
        title &&
        this.ctx.entities.get<AIChat>("aiChats", chat.id)?.data.title ===
          "New Chat" &&
        this.ctx.entities.get<AIChat>("aiChats", chat.id)?.data.titleSource !==
          "user"
      ) {
        this.ctx.entities.patch<AIChat>("aiChats", chat.id, {
          title,
          titleSource: "automatic",
          updatedAt: Date.now(),
        });
        this.ctx.events.emit("ai.stream", {
          type: "title",
          streamId: run.streamId,
          chatId: chat.id,
          title,
        });
      }
    } catch {
      /* A title request must never fail an otherwise completed conversation. */
    }
  }
  stop(id: string): void {
    this.runs.get(id)?.controller.abort(new Error("Response stopped"));
  }
  confirm(input: BackendMethods["ai.confirmTool"]["params"]): void {
    const run = this.runs.get(input.streamId),
      pending = run?.confirmations.get(input.callId);
    if (!pending)
      throw new Error("This tool confirmation is no longer pending");
    if (input.approved && input.always)
      this.ctx.settings.set("ai.alwaysAllowedTools", [
        ...new Set([
          ...this.ctx.settings.get("ai.alwaysAllowedTools"),
          pending.call.name,
        ]),
      ]);
    pending.resolve(input.approved);
  }
  autoArchive(): void {
    const age = durationMs(this.ctx.settings.get("ai.autoArchiveChats"));
    if (age === null) return;
    for (const r of this.ctx.entities.list<AIChat>("aiChats"))
      if (
        !r.data.pinned &&
        !r.data.archived &&
        Date.now() - r.data.updatedAt >= age &&
        ![...this.runs.values()].some((run) => run.chatId === r.id)
      )
        this.update(r.id, { archived: true });
  }
  register(): void {
    const ctx = this.ctx;
    ctx.rpc.handleAll({
      "ai.chats.create": (p) => this.create(p),
      "ai.chats.update": (p) => this.update(p.id, p.patch),
      "ai.chats.delete": (p) => this.delete(p.id),
      "ai.chats.list": (p) =>
        ctx.entities
          .list<AIChat>("aiChats")
          .map((r) => r.data)
          .filter(
            (c) =>
              (p.includeArchived || !c.archived) &&
              (!p.source || c.source === p.source) &&
              (!p.query ||
                `${c.title}\n${this.messages(c.id)
                  .map((m) => m.content)
                  .join("\n")}`
                  .toLowerCase()
                  .includes(p.query.toLowerCase())),
          )
          .sort(
            (a, b) =>
              Number(!!b.pinned) - Number(!!a.pinned) ||
              b.updatedAt - a.updatedAt,
          ),
      "ai.chats.get": (p) => {
        const chat = ctx.entities.get<AIChat>("aiChats", p.id)?.data;
        return chat ? { chat, messages: this.messages(p.id) } : null;
      },
      "ai.chats.send": (p) => this.send(p),
      "ai.ask": (p) => this.ask(p),
      "ai.stop": (p) => this.stop(p.streamId),
      "ai.confirmTool": (p) => this.confirm(p),
      "ai.chats.export": (p) => {
        const chat = this.get(p.id),
          messages = this.messages(chat.id),
          branch = visibleBranch(messages, chat.currentLeafId);
        const content =
          p.format === "json"
            ? JSON.stringify({ schemaVersion: 1, chat, messages }, null, 2)
            : `# ${chat.title}\n\n` +
              branch
                .map(
                  (m) =>
                    `## ${m.role === "user" ? "You" : "Surgecast"}\n\n${m.content}${m.attachments?.length ? "\n\nAttachments: " + m.attachments.map((a) => a.name).join(", ") : ""}`,
                )
                .join("\n\n");
        return {
          content,
          fileName: `${chat.title.replace(/[^\p{L}\p{N}_-]/gu, "-").slice(0, 80) || "chat"}.${p.format === "json" ? "json" : "md"}`,
        };
      },
    });
    const off = ctx.entities.onChange((c) => {
      if (c.collection === "aiChats")
        ctx.events.emit("ai.chats.changed", { chatId: c.id });
    });
    let timer: NodeJS.Timeout;
    ctx.onReady(() => {
      for (const r of ctx.entities.list<AIMessage>("aiMessages"))
        if (r.data.status === "streaming")
          ctx.entities.put("aiMessages", r.id, {
            ...r.data,
            status: "stopped",
            updatedAt: Date.now(),
          });
      timer = setInterval(() => this.autoArchive(), 3_600_000);
      timer.unref();
      this.autoArchive();
    });
    ctx.onShutdown(async () => {
      off();
      clearInterval(timer);
      for (const run of this.runs.values())
        run.controller.abort(new Error("Backend shutting down"));
      await Promise.all([...this.runs.values()].map((r) => r.promise));
    });
  }
}
