import type { AIChat, AICommand, AIMessage, AIPreset, AIToolInfo } from "@surgecast/protocol";

const now = Date.now();
const min = 60_000;
const day = 86_400_000;

const spelling = now - 38 * day;
const testing = now - 52 * day;
const wifi = now - 75 * day;
const shell = now - 90 * day;

export const AI_CHATS: AIChat[] = [
  { id: "chat-spelling", title: "The correct spelling and usage of the word “definitely”", titleSource: "automatic", model: "anthropic/claude-sonnet-5-5", source: "chat", createdAt: spelling, updatedAt: spelling + 6 * min, currentLeafId: "sp-4" },
  { id: "chat-testing", title: "Testing, Testing, One, Two, Three", titleSource: "automatic", model: "openai/gpt-5.1-mini", source: "quick-ai", createdAt: testing, updatedAt: testing + 2 * min, currentLeafId: "ts-3" },
  { id: "chat-wifi", title: "What’s the main difference between dual-band and tri-band Wi‑Fi?", titleSource: "automatic", model: "openai/gpt-5.1", source: "chat", webSearch: true, tools: ["web"], createdAt: wifi, updatedAt: wifi + 3 * min, currentLeafId: "wf-2" },
  { id: "chat-shell", title: "Rename files with a shell loop", titleSource: "automatic", model: "openai/gpt-5.1", source: "chat", archived: true, createdAt: shell, updatedAt: shell + min, currentLeafId: "sh-2" },
];

const msg = (m: Omit<AIMessage, "status" | "updatedAt"> & Partial<Pick<AIMessage, "status" | "updatedAt">>): AIMessage => ({ status: "complete", updatedAt: m.createdAt, ...m });

export const AI_MESSAGES: AIMessage[] = [
  // Two versions of the first question (the second is an edit), each with its own answer.
  msg({ id: "sp-1", chatId: "chat-spelling", role: "user", content: "definately or definitly?", createdAt: spelling }),
  msg({ id: "sp-2", chatId: "chat-spelling", parentId: "sp-1", role: "assistant", model: "anthropic/claude-sonnet-5-5", content: "Neither — the correct spelling is **definitely**.", createdAt: spelling + 4000 }),
  msg({ id: "sp-3", chatId: "chat-spelling", role: "user", content: "Is it “definately” or “definitely”? And how do I use it in a sentence?", createdAt: spelling + 5 * min }),
  msg({
    id: "sp-4",
    chatId: "chat-spelling",
    parentId: "sp-3",
    role: "assistant",
    model: "anthropic/claude-sonnet-5-5",
    usage: { inputTokens: 412, outputTokens: 168 },
    content:
      "The correct spelling is **definitely**. “Definately” is one of the most common misspellings in English.\n\nA handy way to remember it: the word contains **finite** — *de-finite-ly*.\n\n### Usage\n\n*Definitely* is an adverb meaning “without doubt” or “certainly”:\n\n- I will **definitely** be there on Friday.\n- This is **definitely** the best coffee in town.\n- “Are you coming?” — “Definitely!”\n\nIt usually sits before the main verb, or after a form of *to be*.",
    createdAt: spelling + 5 * min + 3000,
    updatedAt: spelling + 6 * min,
  }),

  // One question, two generated answers (the second is a regeneration).
  msg({ id: "ts-1", chatId: "chat-testing", role: "user", content: "Testing, testing, one, two, three", createdAt: testing }),
  msg({ id: "ts-2", chatId: "chat-testing", parentId: "ts-1", role: "assistant", model: "openai/gpt-5.1-mini", content: "Loud and clear! 🎙️ Your messages are coming through fine.", createdAt: testing + 2000 }),
  msg({ id: "ts-3", chatId: "chat-testing", parentId: "ts-1", role: "assistant", model: "openai/gpt-5.1-mini", content: "Reading you loud and clear — everything is working. What would you like to talk about?", createdAt: testing + 2 * min }),

  msg({ id: "wf-1", chatId: "chat-wifi", role: "user", content: "What’s the main difference between dual-band and tri-band Wi‑Fi routers? Is tri-band worth it for a small apartment?", createdAt: wifi }),
  msg({
    id: "wf-2",
    chatId: "chat-wifi",
    parentId: "wf-1",
    role: "assistant",
    model: "openai/gpt-5.1",
    usage: { inputTokens: 1840, outputTokens: 402, reasoningTokens: 236 },
    reasoning:
      "The user wants the practical difference, then a recommendation for a small apartment. Key points: band count, the extra 5 GHz (or 6 GHz) radio, congestion, mesh backhaul. In a small space a single good dual-band router (or Wi‑Fi 6E/7 with 6 GHz) is usually enough.",
    toolCalls: [{ id: "call-wifi-1", name: "web.search", title: "Search the Web", arguments: { query: "dual-band vs tri-band router difference 2026" }, status: "done", result: { results: 5 } }],
    content:
      "A **dual-band** router broadcasts on two frequency bands (2.4 GHz and 5 GHz). A **tri-band** router adds a third radio — usually a second 5 GHz band or, on Wi‑Fi 6E/7 models, a 6 GHz band.\n\n| | Dual-band | Tri-band |\n|---|---|---|\n| Bands | 2.4 GHz + 5 GHz | 2.4 GHz + 5 GHz + 5/6 GHz |\n| Best for | Apartments, few devices | Many devices, mesh systems |\n| Price | Lower | Higher |\n\nThe extra band doesn’t make a single device faster. It spreads devices across more channels and gives mesh nodes a dedicated link to each other.\n\n**For a small apartment:** a good dual-band Wi‑Fi 6 router is almost always enough. Tri-band pays off with dozens of connected devices or a mesh setup across several rooms.",
    createdAt: wifi + 8000,
    updatedAt: wifi + 3 * min,
  }),

  msg({ id: "sh-1", chatId: "chat-shell", role: "user", content: "Rename all .jpeg files to .jpg in this folder", createdAt: shell }),
  msg({ id: "sh-2", chatId: "chat-shell", parentId: "sh-1", role: "assistant", model: "openai/gpt-5.1", content: "```bash\nfor f in *.jpeg; do\n  mv -- \"$f\" \"${f%.jpeg}.jpg\"\ndone\n```\n\nThe `--` protects file names that start with a dash.", createdAt: shell + 3000 }),
];

export const AI_PRESETS: AIPreset[] = [
  { id: "preset-coding", name: "Coding Expert", icon: "code-16", description: "Precise answers with idiomatic code.", instructions: "You are a senior software engineer. Prefer short, correct, idiomatic code with brief explanations.", creativity: "low", webSearch: false, tools: [], builtin: true, createdAt: now - 200 * day, updatedAt: now - 200 * day },
  { id: "preset-writer", name: "Writing Assistant", icon: "pencil-16", description: "Clear, friendly prose.", instructions: "You help people write clearly. Keep the author's voice and explain notable edits.", creativity: "medium", webSearch: false, tools: [], builtin: true, createdAt: now - 200 * day, updatedAt: now - 200 * day },
  { id: "preset-research", name: "Research", icon: "globe-01-16", description: "Searches the web and cites sources.", instructions: "Research the question with web search and cite your sources.", creativity: "low", webSearch: true, tools: ["web"], createdAt: now - 30 * day, updatedAt: now - 30 * day },
];

export const AI_COMMANDS: AICommand[] = [
  { id: "improve-writing", name: "Improve Writing", icon: "pencil-16", prompt: "Rewrite the text below so it reads clearly and naturally. Keep its meaning, language and tone. Reply with the rewritten text only.\n\n{selection}", creativity: "low", output: "quick-ai", builtin: true, createdAt: now - 200 * day, updatedAt: now - 200 * day },
  { id: "fix-spelling-grammar", name: "Fix Spelling and Grammar", icon: "checkmark-16", prompt: "Correct the spelling, grammar and punctuation of the text below without changing its wording otherwise. Reply with the corrected text only.\n\n{selection}", creativity: "none", output: "quick-ai", builtin: true, createdAt: now - 200 * day, updatedAt: now - 200 * day },
  { id: "explain-this-in-simple-terms", name: "Explain This in Simple Terms", icon: "light-bulb-16", prompt: "Explain the following to someone without background knowledge, in a few short paragraphs:\n\n{selection}", creativity: "medium", output: "quick-ai", builtin: true, createdAt: now - 200 * day, updatedAt: now - 200 * day },
  { id: "find-bugs", name: "Find Bugs in Code", icon: "code-16", prompt: "Review this code for bugs. List each problem with a short explanation and a fix.\n\n{selection | raw}", creativity: "low", output: "quick-ai", builtin: true, createdAt: now - 200 * day, updatedAt: now - 200 * day },
  { id: "summarize-website", name: "Summarize Webpage", icon: "globe-01-16", prompt: "Summarize this page in a short paragraph and a list of key points.\n\n{browser-tab.content format=\"markdown\"}", creativity: "low", output: "quick-ai", builtin: true, createdAt: now - 200 * day, updatedAt: now - 200 * day },
];

const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

export const AI_TOOLS: AIToolInfo[] = [
  { name: "web.search", title: "Search the Web", description: "Search the web for current information.", toolset: "web", toolsetTitle: "Web", icon: "globe-01-16", inputSchema: schema({ query: { type: "string" } }, ["query"]) },
  { name: "web.read", title: "Read Webpage", description: "Read the text of a webpage.", toolset: "web", toolsetTitle: "Web", icon: "globe-01-16", inputSchema: schema({ url: { type: "string" } }, ["url"]) },
  { name: "ext:github.search-issues", title: "Search Issues", description: "Search GitHub issues and pull requests.", toolset: "ext:github", toolsetTitle: "GitHub", icon: "code-16", inputSchema: schema({ query: { type: "string" } }, ["query"]) },
  { name: "ext:github.create-issue", title: "Create Issue", description: "Open a new GitHub issue.", toolset: "ext:github", toolsetTitle: "GitHub", icon: "code-16", inputSchema: schema({ repository: { type: "string" }, title: { type: "string" }, body: { type: "string" } }, ["repository", "title"]), requiresConfirmation: true },
  { name: "mcp:linear.list_issues", title: "List Issues", description: "List Linear issues assigned to you.", toolset: "mcp:linear", toolsetTitle: "Linear", icon: "bolt-16", inputSchema: schema({ state: { type: "string" } }) },
  { name: "mcp:linear.create_issue", title: "Create Issue", description: "Create a Linear issue.", toolset: "mcp:linear", toolsetTitle: "Linear", icon: "bolt-16", inputSchema: schema({ title: { type: "string" }, team: { type: "string" } }, ["title"]), requiresConfirmation: true },
  { name: "datetime.now", title: "Current Date and Time", description: "Get the current local date, time, and time zone.", toolset: "builtin", toolsetTitle: "System", inputSchema: schema({}) },
  { name: "clipboard.read", title: "Read Clipboard", description: "Read the user's current clipboard as text.", toolset: "builtin", toolsetTitle: "System", inputSchema: schema({}) },
  { name: "system.notification", title: "Show Notification", description: "Display a notification on the user's Mac.", toolset: "builtin", toolsetTitle: "System", inputSchema: schema({ title: { type: "string" } }, ["title"]), requiresConfirmation: true },
];

/** Canned answers for the mock's streaming responses, picked by keywords in the prompt. */
export const AI_ANSWERS: { match: RegExp; reasoning?: string; answer: string }[] = [
  {
    match: /launcher/i,
    reasoning: "They want a plain definition, then what a launcher does day to day and an example of using one.",
    answer:
      "A **launcher** is an app that lets you start programs, open files and run actions from a single search field instead of clicking through menus and folders.\n\nYou press a hotkey, type a few letters, and press ↵. Most launchers can also:\n\n- search files, contacts and the web\n- calculate, convert units and currencies\n- run scripts, snippets and window commands\n- ask an AI model a quick question\n\nOn macOS, Spotlight is the built-in launcher; Surgecast is a launcher you can extend with your own commands and AI providers.",
  },
  {
    match: /debounce|throttle|typescript|function|code/i,
    reasoning: "A small, typed implementation plus a usage example is the most useful answer here.",
    answer:
      "Here’s a small, fully typed `debounce` helper:\n\n```ts\nexport function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {\n  let timer: ReturnType<typeof setTimeout> | undefined;\n  return (...args: T) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), ms);\n  };\n}\n\nconst search = debounce((query: string) => console.log(\"search\", query), 250);\nsearch(\"sur\");\nsearch(\"surge\"); // only this call runs, 250 ms later\n```\n\nUse **debounce** when you care about the *final* value (search fields) and **throttle** when you need regular updates while something keeps happening (scrolling).",
  },
  {
    match: /compare|difference|vs\.?|versus|table/i,
    answer:
      "Here’s a quick comparison:\n\n| | Option A | Option B |\n|---|---|---|\n| Speed | Fast | Faster |\n| Setup | Minimal | More involved |\n| Cost | Free | Paid |\n\nIf you’re just getting started, **Option A** is the simpler choice; switch when you outgrow it.",
  },
];

export const AI_DEFAULT_ANSWER = (prompt: string) =>
  `Good question! Here’s a short answer to “${prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt}”:\n\n1. **Start with the goal.** Decide what a good result looks like.\n2. **Break it down.** Split the work into small steps you can check.\n3. **Iterate.** Try the simplest version first, then refine it.\n\nWant me to go into more detail on any of these?`;
