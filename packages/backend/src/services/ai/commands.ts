import { randomUUID } from "node:crypto";
import type {
  AICommand,
  AIPreset,
  BackendMethods,
  CommandInfo,
} from "@surgecast/protocol";
import type { AppContext } from "../../context";
import { Chats } from "./chats";
import { commandArguments, resolvePlaceholders } from "./placeholders";
import { builtinCommands, builtinPresets } from "./seeds";
const icon = {
  tile: {
    glyph: "stars",
    background: ["#A45BFF", "#6B4CF6"] as [string, string],
    foreground: "#FFFFFF",
  },
};
function validateCreativity(value: unknown): void {
  if (
    value !== undefined &&
    !["none", "low", "medium", "high", "maximum"].includes(value as string)
  )
    throw new Error("Unsupported creativity level");
}
export class Commands {
  constructor(
    readonly ctx: AppContext,
    readonly chats: Chats,
  ) {}
  commands(): AICommand[] {
    return this.ctx.entities
      .list<AICommand>("aiCommands", { orderBy: "created" })
      .map((r) => r.data)
      .sort(
        (a, b) =>
          Number(!!b.builtin) - Number(!!a.builtin) ||
          a.name.localeCompare(b.name),
      );
  }
  presets(): AIPreset[] {
    return this.ctx.entities.list<AIPreset>("aiPresets").map((r) => r.data);
  }
  get(id: string): AICommand {
    const c = this.ctx.entities.get<AICommand>("aiCommands", id)?.data;
    if (!c) throw new Error(`AI command ${id} was not found`);
    return c;
  }
  upsert(input: BackendMethods["ai.commands.upsert"]["params"]): AICommand {
    if (!input.name?.trim() || !input.prompt?.trim())
      throw new Error("AI command needs a name and prompt");
    commandArguments(input.prompt);
    validateCreativity(input.creativity);
    if (
      input.output !== undefined &&
      !["window", "quick-ai", "paste", "copy", "replace"].includes(input.output)
    )
      throw new Error("Unsupported AI command output mode");
    const id = input.id ?? randomUUID(),
      old = this.ctx.entities.get<AICommand>("aiCommands", id)?.data,
      now = Date.now();
    const command: AICommand = {
      id,
      name: input.name.trim(),
      prompt: input.prompt,
      icon: input.icon ?? old?.icon,
      model: input.model ?? old?.model,
      creativity: input.creativity ?? old?.creativity ?? "medium",
      output: input.output ?? old?.output ?? "quick-ai",
      reasoningEffort: input.reasoningEffort ?? old?.reasoningEffort,
      highlightEdits: input.highlightEdits ?? old?.highlightEdits,
      tags: input.tags ?? old?.tags,
      webSearch: input.webSearch ?? old?.webSearch,
      builtin: old?.builtin ?? false,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
    };
    this.ctx.entities.put("aiCommands", id, command);
    return command;
  }
  preset(input: BackendMethods["ai.presets.upsert"]["params"]): AIPreset {
    if (!input.name?.trim()) throw new Error("Preset needs a name");
    validateCreativity(input.creativity);
    const id = input.id ?? randomUUID(),
      old = this.ctx.entities.get<AIPreset>("aiPresets", id)?.data,
      now = Date.now();
    const preset: AIPreset = {
      id,
      name: input.name.trim(),
      icon: input.icon ?? old?.icon,
      description: input.description ?? old?.description,
      instructions: input.instructions ?? old?.instructions ?? "",
      model: input.model ?? old?.model,
      creativity: input.creativity ?? old?.creativity ?? "medium",
      reasoningEffort: input.reasoningEffort ?? old?.reasoningEffort,
      webSearch: input.webSearch ?? old?.webSearch ?? false,
      tools: input.tools ?? old?.tools ?? [],
      builtin: old?.builtin ?? false,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
    };
    this.ctx.entities.put("aiPresets", id, preset);
    return preset;
  }
  async run(
    input: BackendMethods["ai.commands.run"]["params"],
    signal?: AbortSignal,
  ): Promise<BackendMethods["ai.commands.run"]["result"]> {
    const command = this.get(input.id);
    const prompt = await resolvePlaceholders(command.prompt, this.ctx, {
      selection: input.input?.selectedText ?? input.selection,
      arguments: input.arguments,
      signal,
    });
    const chat = this.chats.create({
      source: "ai-command",
      model: command.model,
    });
    this.chats.update(chat.id, {
      creativity: command.creativity,
      reasoningEffort: command.reasoningEffort,
      webSearch: command.webSearch,
    });
    const { streamId } = this.chats.ask(
      { chatId: chat.id, prompt, model: command.model },
      {
        purpose: "commands",
        creativity: command.creativity,
        reasoningEffort: command.reasoningEffort,
        output: command.output,
      },
    );
    if (command.output === "window")
      await this.ctx.native.call("window.show", { kind: "ai-chat" });
    return { streamId, chatId: chat.id, prompt };
  }
  import(json: string): { imported: number } {
    const data = JSON.parse(json);
    const rows = Array.isArray(data)
      ? data
      : (data.commands ??
        data.aiCommands ??
        (data.name || data.title ? [data] : undefined));
    if (!Array.isArray(rows))
      throw new Error("Expected AI command JSON with a commands array");
    const normalized = rows.map((r: any) => {
      const name = r.name ?? r.title,
        prompt = r.prompt ?? r.promptTemplate;
      if (
        typeof name !== "string" ||
        typeof prompt !== "string" ||
        !name.trim() ||
        !prompt.trim()
      )
        throw new Error("Every imported command must have a name and prompt");
      commandArguments(prompt);
      const creativity =
        r.creativity ??
        (typeof r.temperature === "number"
          ? (["none", "low", "medium", "high", "maximum"] as const)[
              Math.min(4, Math.max(0, Math.round(r.temperature * 4)))
            ]
          : "medium");
      validateCreativity(creativity);
      const output =
        r.output ??
        (r.outputBehavior === "replace-selection" ? "replace" : "quick-ai");
      if (!["window", "quick-ai", "paste", "copy", "replace"].includes(output))
        throw new Error("Invalid imported command output mode");
      return {
        name,
        prompt,
        creativity,
        output,
        model: r.model ?? r.modelId,
        reasoningEffort: r.reasoningEffort,
        tags: r.tags,
        highlightEdits: r.highlightEdits,
      };
    });
    this.ctx.db.transaction(() => {
      for (const row of normalized) this.upsert(row);
    });
    return { imported: normalized.length };
  }
  register(): void {
    const ctx = this.ctx;
    ctx.onReady(() => {
      for (const c of builtinCommands())
        if (!ctx.entities.get("aiCommands", c.id, { includeDeleted: true }))
          ctx.entities.put("aiCommands", c.id, c);
      for (const p of builtinPresets())
        if (!ctx.entities.get("aiPresets", p.id, { includeDeleted: true }))
          ctx.entities.put("aiPresets", p.id, p);
    });
    ctx.rpc.handleAll({
      "ai.commands.list": () => this.commands(),
      "ai.commands.upsert": (p) => this.upsert(p),
      "ai.commands.delete": (p) => {
        this.get(p.id);
        ctx.entities.delete("aiCommands", p.id);
      },
      "ai.commands.reset": (p) => {
        const seed = builtinCommands().find((c) => c.id === p.id);
        if (!seed) throw new Error("Only built-in AI commands can be reset");
        const old = ctx.entities.get<AICommand>("aiCommands", p.id)?.data;
        const command = {
          ...seed,
          createdAt: old?.createdAt ?? seed.createdAt,
        };
        ctx.entities.put("aiCommands", p.id, command);
        return command;
      },
      "ai.commands.run": (p, call) => this.run(p, call.signal),
      "ai.commands.import": (p) => this.import(p.json),
      "ai.commands.export": () => ({
        json: JSON.stringify(
          {
            schemaVersion: 1,
            commands: this.commands().map((c) => ({
              id: c.id,
              name: c.name,
              kind: c.builtin ? "builtin" : "custom",
              promptTemplate: c.prompt,
              creativity: c.creativity,
              modelId: c.model,
              output: c.output,
              outputBehavior:
                c.output === "replace"
                  ? "replace-selection"
                  : "open-in-raycast",
              reasoningEffort: c.reasoningEffort,
              highlightEdits: c.highlightEdits,
              tags: c.tags,
            })),
          },
          null,
          2,
        ),
      }),
      "ai.presets.list": () => this.presets(),
      "ai.presets.upsert": (p) => this.preset(p),
      "ai.presets.reset": ({ id }) => {
        const seed = builtinPresets().find((preset) => preset.id === id);
        if (!seed) throw new Error("Only a built-in preset can be reset");
        const old = this.ctx.entities.get<AIPreset>("aiPresets", id)?.data;
        const preset = { ...seed, createdAt: old?.createdAt ?? seed.createdAt };
        this.ctx.entities.put("aiPresets", id, preset);
        return preset;
      },
      "ai.presets.delete": (p) => {
        if (!ctx.entities.get("aiPresets", p.id))
          throw new Error("AI preset was not found");
        ctx.entities.delete("aiPresets", p.id);
      },
    });
    ctx.commands.registerProvider({
      id: "ai-commands",
      list: () =>
        this.commands().map(
          (c) =>
            ({
              id: `ai-command:${c.id}`,
              kind: "ai-command",
              title: c.name,
              typeLabel: "AI Command",
              icon: c.icon ?? icon,
              mode: "view",
              enabled: true,
              extensionId: "ai-commands",
              extensionTitle: "AI Commands",
              arguments: commandArguments(c.prompt),
            }) satisfies CommandInfo,
        ),
      launch: (c) => ({
        kind: "ai",
        aiCommandId: c.id.slice("ai-command:".length),
        target: "quick-ai",
      }),
    });
    ctx.commands.registerProvider({
      id: "ai-presets",
      list: () =>
        ctx.settings.get("ai.searchAgents")
          ? this.presets().map(
              (p) =>
                ({
                  id: `ai-preset:${p.id}`,
                  kind: "ai-preset",
                  title: p.name,
                  typeLabel: "AI Agent",
                  icon: p.icon ?? icon,
                  mode: "view",
                  enabled: true,
                  description: p.description,
                  extensionId: "ai-presets",
                  extensionTitle: "AI Agents",
                }) satisfies CommandInfo,
            )
          : [],
      launch: (p) => ({
        kind: "ai",
        presetId: p.id.slice("ai-preset:".length),
        target: "chat",
      }),
    });
    const off = ctx.entities.onChange((c) => {
      if (c.collection === "aiCommands") ctx.commands.invalidate("ai-commands");
      if (c.collection === "aiPresets") ctx.commands.invalidate("ai-presets");
    });
    const offSettings = ctx.settings.onChange((key) => {
      if (key === "ai.searchAgents") ctx.commands.invalidate("ai-presets");
    });
    ctx.onShutdown(() => {
      off();
      offSettings();
    });
  }
}
