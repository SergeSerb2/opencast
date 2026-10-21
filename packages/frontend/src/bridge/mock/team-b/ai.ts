import { RpcErrorCode, type AICommand, type AIPreset, type AIToolInfo, type BackendParams, type CommandInfo, type Creativity } from "@opencast/protocol";
import { promptArguments, promptProblem } from "../../../launcher/views/ai-commands/placeholders";
import { RpcError } from "../../errors";
import type { MockArea, MockContext } from "./types";

const now = Date.now();
const minute = 60_000;
const day = 86_400_000;

/** Same default icon the backend gives AI commands and presets. */
const DEFAULT_ICON = { tile: { glyph: "stars", background: ["#A45BFF", "#6B4CF6"] as [string, string], foreground: "#FFFFFF" } };
const CREATIVITY: Creativity[] = ["none", "low", "medium", "high", "maximum"];
const OUTPUTS: AICommand["output"][] = ["window", "quick-ai", "paste", "copy", "replace"];

const rewrite = (instruction: string) => `${instruction} Keep the original language, meaning, links and formatting. Reply with the revised text only.\n\n{selection}`;

/** Built-in commands (ids as the backend seeds them; prompts written for OpenCast). */
const SEEDS: [id: string, name: string, prompt: string][] = [
  ["improve-writing", "Improve Writing", rewrite("Make this text clearer and more concise while keeping the author's voice. Leave sentences that already work untouched.")],
  ["fix-spelling-grammar", "Fix Spelling and Grammar", rewrite("Correct spelling, grammar and punctuation with the smallest possible changes.")],
  ["explain-this-in-simple-terms", "Explain This in Simple Terms", "Explain the following in plain, everyday language. For a single word give a short definition; for an idea, add a small example if it helps.\n\n{selection}"],
  ["change-tone-to-professional", "Change Tone to Professional", rewrite("Rewrite this in a polished, professional tone of about the same length.")],
  ["change-tone-to-friendly", "Change Tone to Friendly", rewrite("Rewrite this in a warm, friendly tone of about the same length.")],
  ["find-bugs", "Find Bugs in Code", "Review this code for real defects. For each one, explain the problem in a sentence and show the corrected code. If you find nothing wrong, say so instead of inventing issues.\n\n{selection | raw}"],
  ["summarize-website", "Summarize Webpage", 'Summarize this page with a short title, a two-sentence overview and three key takeaways. Stick to what the page says.\n\n{browser-tab format="markdown" | raw}'],
  ["answer-question-about-website", "Ask About Webpage", 'Answer the question using only the page below. If the page doesn\'t answer it, say so briefly.\n\nQuestion: {argument name="Question"}\n\n{browser-tab format="markdown" | raw}'],
];

function seedCommands(): AICommand[] {
  const installed = now - 42 * day;
  return SEEDS.map(([id, name, prompt]) => ({ id, name, prompt, creativity: "medium", output: "quick-ai", builtin: true, highlightEdits: id === "fix-spelling-grammar", createdAt: installed, updatedAt: installed }));
}

const CUSTOM_COMMANDS: AICommand[] = [
  {
    id: "c-commit-message",
    name: "Write Commit Message",
    icon: "terminal-16",
    prompt: "Write a conventional commit message for this diff. Use the imperative mood, keep the subject under 72 characters and explain the why in the body.\n\n{selection | raw}",
    model: "anthropic/claude-sonnet-5-5",
    creativity: "low",
    output: "paste",
    tags: ["Code"],
    createdAt: now - 12 * day,
    updatedAt: now - 3 * day,
  },
  {
    id: "c-reply-email",
    name: "Reply to Email",
    icon: "envelope-16",
    prompt: 'Draft a reply to the email below in a {argument name="Tone" options="Friendly,Formal,Brief" default="Friendly"} tone. Answer every question it asks and end with a clear next step. Sign off as me.\n\nEmail:\n{selection}',
    creativity: "medium",
    output: "quick-ai",
    tags: ["Email", "Writing"],
    createdAt: now - 9 * day,
    updatedAt: now - 9 * day,
  },
  {
    id: "c-action-items",
    name: "Turn Notes into Action Items",
    icon: "check-list-16",
    prompt: "Turn these meeting notes into a checklist of action items. Put the owner in bold when one is mentioned and keep due dates. Don't invent owners or dates.\n\n{clipboard}",
    model: "openai/gpt-5.1",
    creativity: "low",
    output: "copy",
    reasoningEffort: "low",
    tags: ["Work"],
    createdAt: now - 6 * day,
    updatedAt: now - 2 * day,
  },
  {
    id: "c-research-topic",
    name: "Research a Topic",
    icon: "binoculars-16",
    prompt: 'Research {argument name="Topic"} and write a short briefing: what it is, the current state as of {date}, the main open questions, and three sources worth reading.',
    model: "anthropic/claude-sonnet-5-5",
    creativity: "medium",
    output: "window",
    reasoningEffort: "high",
    webSearch: true,
    tags: ["Research"],
    createdAt: now - 4 * day,
    updatedAt: now - 30 * minute,
  },
];

function seedPresets(): AIPreset[] {
  const installed = now - 42 * day;
  const builtin = (id: string, name: string, instructions: string, extra: Partial<AIPreset> = {}): AIPreset => ({ id, name, instructions, creativity: "medium", webSearch: false, tools: [], builtin: true, createdAt: installed, updatedAt: installed, ...extra });
  return [
    builtin("general", "General", "Help with whatever the user asks. Be clear and direct, say when you're unsure, and keep facts the user gave apart from your own assumptions."),
    builtin("writing", "Writing Assistant", "Help draft and edit writing. Keep the author's intent and voice, prefer plain language, and explain an edit when asked why."),
    builtin("coding", "Coding Expert", "Help design, debug and test software. Suggest focused changes, state your assumptions, and never claim code ran unless a tool result shows it."),
    builtin("research", "Deep Research", "Dig into questions thoroughly. Search for current information, cite your sources, compare the evidence, and point out what is still uncertain.", { webSearch: true, tools: ["web"] }),
    {
      id: "p-copywriter",
      name: "Product Copywriter",
      icon: "megaphone-16",
      description: "Landing pages, release notes and app store copy",
      instructions:
        "You write product copy for **OpenCast**, a keyboard-first launcher for macOS.\n\n### Voice\n- Confident, friendly and specific\n- Short sentences; no buzzwords or exclamation marks\n- Lead with what the user can do, not with features\n\n### When asked for copy\n1. Offer three variations of different length\n2. Mark the one you recommend\n3. Keep headlines under 8 words",
      model: "anthropic/claude-sonnet-5-5",
      creativity: "high",
      webSearch: false,
      tools: [],
      createdAt: now - 20 * day,
      updatedAt: now - 5 * day,
    },
    {
      id: "p-sql",
      name: "SQL Helper",
      icon: "code-16",
      description: "Queries for the analytics warehouse",
      instructions: "You help write and review SQL for a PostgreSQL 17 analytics warehouse.\n\n- Use CTEs instead of nested subqueries\n- Explain the query plan when performance matters\n- Ask before assuming a table or column name",
      model: "openai/gpt-5.1",
      creativity: "low",
      reasoningEffort: "medium",
      webSearch: false,
      tools: ["builtin"],
      createdAt: now - 15 * day,
      updatedAt: now - 15 * day,
    },
    {
      id: "p-travel",
      name: "Travel Planner",
      icon: "airplane-16",
      description: "Itineraries with current opening hours and prices",
      instructions: "Plan trips day by day. Check current opening hours, prices and travel times before recommending anything, group sights by neighborhood, and leave room for rest.",
      creativity: "medium",
      webSearch: true,
      tools: ["mcp:maps", "builtin"],
      createdAt: now - 3 * day,
      updatedAt: now - 1 * day,
    },
  ];
}

const tool = (toolset: string, toolsetTitle: string, name: string, title: string, description: string, icon?: string, requiresConfirmation?: boolean): AIToolInfo => ({ name, title, description, toolset, toolsetTitle, icon, inputSchema: { type: "object", properties: {} }, requiresConfirmation });

const TOOLS: AIToolInfo[] = [
  tool("web", "Web", "web.search", "Search the Web", "Search the web for current information.", "globe-01-16"),
  tool("web", "Web", "web.read", "Read Webpage", "Read a public webpage and return its text.", "globe-01-16"),
  tool("builtin", "System", "datetime.now", "Current Date and Time", "Get the local date, time and time zone.", "computer-chip-16"),
  tool("builtin", "System", "clipboard.read", "Read Clipboard", "Read the current clipboard text.", "computer-chip-16"),
  tool("builtin", "System", "selection.read", "Read Selected Text", "Read the text selected in the frontmost app.", "computer-chip-16"),
  tool("builtin", "System", "calendar.events", "Read Calendar Events", "List events between two dates.", "computer-chip-16"),
  tool("builtin", "System", "system.notification", "Show Notification", "Show a notification on this Mac.", "computer-chip-16", true),
  tool("ext:github", "GitHub", "ext:github.search-issues", "Search Issues", "Search issues and pull requests.", "code-16"),
  tool("ext:github", "GitHub", "ext:github.create-issue", "Create Issue", "Open a new issue in a repository.", "code-16", true),
  tool("mcp:maps", "Maps", "mcp:maps.search_places", "Search Places", "Find places near a location.", "map-16"),
  tool("mcp:maps", "Maps", "mcp:maps.directions", "Get Directions", "Travel time and route between two places.", "map-16"),
  tool("mcp:linear", "Linear", "mcp:linear.create_issue", "Create Issue", "Create an issue in Linear.", "check-list-16", true),
  tool("mcp:linear", "Linear", "mcp:linear.list_issues", "List Issues", "List issues assigned to you.", "check-list-16"),
];

const notFound = (what: string): never => {
  throw new RpcError({ code: RpcErrorCode.NotFound, message: `${what} was not found` });
};
const invalid = (message: string): never => {
  throw new RpcError({ code: RpcErrorCode.InvalidParams, message });
};

let counter = 0;
const newId = () => `mock-${Date.now().toString(36)}-${++counter}`;

/** Root search entries for AI commands (the backend's "ai-commands" command provider). */
function commandInfo(command: AICommand): CommandInfo {
  return { id: `ai-command:${command.id}`, kind: "ai-command", title: command.name, typeLabel: "AI Command", icon: command.icon ?? DEFAULT_ICON, mode: "view", enabled: true, extensionId: "ai-commands", extensionTitle: "AI Commands", arguments: promptArguments(command.prompt) };
}

/** Mock backend for AI commands and presets (mirrors services/ai/commands.ts). */
export function createAiMock(ctx: MockContext): MockArea {
  const commands: AICommand[] = [...seedCommands(), ...CUSTOM_COMMANDS.map((c) => ({ ...c }))];
  const presets: AIPreset[] = seedPresets();
  const changed = (collection: "aiCommands" | "aiPresets", ids: string[]) => ctx.events.emit("entities.changed", { collection, ids, source: "local" });
  const sorted = () => [...commands].sort((a, b) => Number(Boolean(b.builtin)) - Number(Boolean(a.builtin)) || a.name.localeCompare(b.name));
  const findCommand = (id: string) => commands.find((c) => c.id === id) ?? notFound(`AI command ${id}`);

  const upsertCommand = (input: BackendParams<"ai.commands.upsert">): AICommand => {
    if (!input.name?.trim() || !input.prompt?.trim()) invalid("AI command needs a name and prompt");
    const problem = promptProblem(input.prompt);
    if (problem) invalid(problem);
    if (input.creativity !== undefined && !CREATIVITY.includes(input.creativity)) invalid("Unsupported creativity level");
    if (input.output !== undefined && !OUTPUTS.includes(input.output)) invalid("Unsupported AI command output mode");
    const id = input.id ?? newId();
    const old = commands.find((c) => c.id === id);
    const command: AICommand = {
      id,
      name: input.name.trim(),
      prompt: input.prompt,
      icon: input.icon ?? old?.icon,
      model: input.model === null ? undefined : input.model ?? old?.model,
      creativity: input.creativity ?? old?.creativity ?? "medium",
      output: input.output ?? old?.output ?? "quick-ai",
      reasoningEffort: input.reasoningEffort === null ? undefined : input.reasoningEffort ?? old?.reasoningEffort,
      highlightEdits: input.highlightEdits ?? old?.highlightEdits,
      tags: input.tags ?? old?.tags,
      webSearch: input.webSearch ?? old?.webSearch,
      builtin: old?.builtin ?? false,
      createdAt: old?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    if (old) commands.splice(commands.indexOf(old), 1, command);
    else commands.push(command);
    return command;
  };

  return {
    commands: commands.map(commandInfo),
    launch(command) {
      if (command.id.startsWith("ai-command:")) return { kind: "ai", target: "quick-ai", aiCommandId: command.id.slice("ai-command:".length) };
      if (command.id.startsWith("ai-preset:")) return { kind: "ai", target: "chat", presetId: command.id.slice("ai-preset:".length) };
      return undefined;
    },
    handlers: {
      "ai.commands.list": () => sorted(),
      "ai.commands.upsert": (params) => {
        const command = upsertCommand(params);
        changed("aiCommands", [command.id]);
        return command;
      },
      "ai.commands.delete": ({ id }) => {
        commands.splice(commands.indexOf(findCommand(id)), 1);
        changed("aiCommands", [id]);
      },
      "ai.commands.reset": ({ id }) => {
        const seed = seedCommands().find((c) => c.id === id) ?? invalid("Only built-in AI commands can be reset");
        const old = findCommand(id);
        const command = { ...seed, createdAt: old.createdAt, updatedAt: Date.now() };
        commands.splice(commands.indexOf(old), 1, command);
        changed("aiCommands", [id]);
        return command;
      },
      "ai.commands.import": ({ json }) => {
        let data: unknown;
        try {
          data = JSON.parse(json);
        } catch {
          return invalid("The JSON could not be read");
        }
        const record = (data ?? {}) as Record<string, unknown>;
        const rows = Array.isArray(data) ? data : (record.commands ?? record.aiCommands ?? (record.name || record.title ? [record] : undefined));
        if (!Array.isArray(rows)) return invalid("Expected AI command JSON with a commands array");
        const imported = rows.map((row: Record<string, unknown>) => {
          const name = row.name ?? row.title;
          const prompt = row.prompt ?? row.promptTemplate;
          if (typeof name !== "string" || typeof prompt !== "string" || !name.trim() || !prompt.trim()) return invalid("Every imported command must have a name and prompt");
          return upsertCommand({
            name,
            prompt,
            creativity: (row.creativity as Creativity | undefined) ?? "medium",
            output: (row.output as AICommand["output"] | undefined) ?? (row.outputBehavior === "replace-selection" ? "replace" : "quick-ai"),
            model: (row.model ?? row.modelId) as string | undefined,
            tags: row.tags as string[] | undefined,
          });
        });
        changed("aiCommands", imported.map((c) => c.id));
        return { imported: imported.length };
      },
      "ai.commands.export": () => ({
        json: JSON.stringify(
          {
            schemaVersion: 1,
            commands: sorted().map((c) => ({
              id: c.id,
              name: c.name,
              kind: c.builtin ? "builtin" : "custom",
              promptTemplate: c.prompt,
              creativity: c.creativity,
              modelId: c.model,
              output: c.output,
              outputBehavior: c.output === "replace" ? "replace-selection" : "open-in-raycast",
              reasoningEffort: c.reasoningEffort,
              highlightEdits: c.highlightEdits,
              tags: c.tags,
            })),
          },
          null,
          2,
        ),
      }),

      "ai.presets.list": () => presets,
      "ai.presets.upsert": (input) => {
        if (!input.name?.trim()) invalid("Preset needs a name");
        if (input.creativity !== undefined && !CREATIVITY.includes(input.creativity)) invalid("Unsupported creativity level");
        const id = input.id ?? newId();
        const old = presets.find((p) => p.id === id);
        const preset: AIPreset = {
          id,
          name: input.name.trim(),
          icon: input.icon ?? old?.icon,
          description: input.description ?? old?.description,
          instructions: input.instructions ?? old?.instructions ?? "",
          model: input.model === null ? undefined : input.model ?? old?.model,
          creativity: input.creativity ?? old?.creativity ?? "medium",
          reasoningEffort: input.reasoningEffort === null ? undefined : input.reasoningEffort ?? old?.reasoningEffort,
          webSearch: input.webSearch ?? old?.webSearch ?? false,
          tools: input.tools ?? old?.tools ?? [],
          builtin: old?.builtin ?? false,
          createdAt: old?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
        };
        if (old) presets.splice(presets.indexOf(old), 1, preset);
        else presets.push(preset);
        changed("aiPresets", [id]);
        return preset;
      },
      "ai.presets.delete": ({ id }) => {
        const index = presets.findIndex((p) => p.id === id);
        if (index === -1) notFound("AI preset");
        presets.splice(index, 1);
        changed("aiPresets", [id]);
      },
      "ai.presets.reset": ({ id }) => {
        const original = seedPresets().find((p) => p.id === id && p.builtin);
        if (!original) invalid("Only built-in agents can be reset");
        const index = presets.findIndex((p) => p.id === id);
        if (index === -1) notFound("AI preset");
        const restored = { ...original!, updatedAt: Date.now() };
        presets.splice(index, 1, restored);
        changed("aiPresets", [id]);
        return restored;
      },
      "ai.tools.list": () => TOOLS,
    },
  };
}
