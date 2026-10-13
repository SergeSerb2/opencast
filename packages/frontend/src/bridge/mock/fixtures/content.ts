import type { AIProvider, ClipboardItem, InstalledExtension, Note, Snippet } from "@surgecast/protocol";

const now = Date.now();
const min = 60_000;
const hour = 60 * min;
const day = 24 * hour;

/** A small checkerboard-ish gradient image so clipboard image items render in the browser. */
export const SAMPLE_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b5cff"/><stop offset="1" stop-color="#ff6fae"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><circle cx="470" cy="140" r="70" fill="#ffd45c" opacity=".9"/><path d="M0 330 170 190l120 110 90-70 260 170H0z" fill="#2b1f5c" opacity=".55"/></svg>`,
  );

export const CLIPBOARD: ClipboardItem[] = [
  { id: "c1", kind: "text", title: "Ship the launcher redesign behind the glass flag", text: "Ship the launcher redesign behind the glass flag\n\n- footer pills\n- action panel\n- progressive blur", pinned: false, copyCount: 1, characters: 92, words: 15, contentHash: "h1", createdAt: now - 4 * min, lastCopiedAt: now - 4 * min, sourceApp: { name: "Slack", bundleId: "com.tinyspeck.slackmacgap", path: "/Applications/Slack.app" } },
  { id: "c2", kind: "link", title: "https://github.com/surgecast/surgecast/pull/128", text: "https://github.com/surgecast/surgecast/pull/128", url: "https://github.com/surgecast/surgecast/pull/128", pinned: true, copyCount: 3, characters: 46, words: 1, contentHash: "h2", createdAt: now - 25 * min, lastCopiedAt: now - 20 * min, sourceApp: { name: "Safari", bundleId: "com.apple.Safari", path: "/Applications/Safari.app" } },
  { id: "c3", kind: "color", title: "#7C5CFF", text: "#7C5CFF", color: "#7C5CFF", pinned: false, copyCount: 1, characters: 7, words: 1, contentHash: "h3", createdAt: now - 1 * hour, lastCopiedAt: now - 1 * hour, sourceApp: { name: "Figma", bundleId: "com.figma.Desktop", path: "/Applications/Figma.app" } },
  { id: "c4", kind: "image", title: "Image (640×400)", imagePath: SAMPLE_IMAGE, imageWidth: 640, imageHeight: 400, ocrText: "", pinned: false, copyCount: 1, byteSize: 182_400, contentHash: "h4", createdAt: now - 3 * hour, lastCopiedAt: now - 3 * hour, sourceApp: { name: "Preview", bundleId: "com.apple.Preview", path: "/System/Applications/Preview.app" } },
  { id: "c5", kind: "file", title: "Quarterly Report.pdf", filePaths: ["/Users/me/Documents/Quarterly Report.pdf"], pinned: false, copyCount: 1, byteSize: 2_480_000, contentHash: "h5", createdAt: now - 1 * day - 2 * hour, lastCopiedAt: now - 1 * day - 2 * hour, sourceApp: { name: "Finder", bundleId: "com.apple.finder", path: "/System/Library/CoreServices/Finder.app" } },
  { id: "c6", kind: "text", title: "const theme = usePalette(appearance);", text: "const theme = usePalette(appearance);\nconst vars = paletteToCssVars(theme);", pinned: false, copyCount: 2, characters: 74, words: 6, contentHash: "h6", createdAt: now - 2 * day, lastCopiedAt: now - 2 * day, sourceApp: { name: "Visual Studio Code", bundleId: "com.microsoft.VSCode", path: "/Applications/Visual Studio Code.app" } },
];

export const SNIPPETS: Snippet[] = [
  { id: "s1", name: "Email Signature", text: "Best,\n{argument name=\"name\" default=\"Alex\"}\nSurgecast", keyword: ";sig", tags: ["email"], copyCount: 12, createdAt: now - 30 * day, updatedAt: now - 3 * day },
  { id: "s2", name: "Today's Date", text: "{date format=\"yyyy-MM-dd\"}", keyword: ";date", copyCount: 40, createdAt: now - 60 * day, updatedAt: now - 60 * day },
  { id: "s3", name: "Meeting Notes Template", text: "## {date}\n\n**Attendees:** {cursor}\n\n### Notes\n\n### Action items\n", tags: ["work"], copyCount: 5, createdAt: now - 10 * day, updatedAt: now - 1 * day },
];

const LAUNCH_NOTE = [
  "# Launch checklist",
  "",
  "Ship **Surgecast 0.1** with the new glass interface. Details live in [the roadmap](https://github.com/surgecast/surgecast).",
  "",
  "## Before release",
  "",
  "- [x] Glass footer pills",
  "- [x] Action panel",
  "- [ ] Compact mode",
  "- [ ] Deploy the sync worker",
  "",
  "## Steps",
  "",
  "1. Run `pnpm build`",
  "2. Sign the app bundle",
  "  - Notarize",
  "  - Staple the ticket",
  "",
  "> Keep the changelog short and friendly.",
  "",
  "```ts",
  'const release = await publish({ channel: "beta" });',
  "console.log(release.version);",
  "```",
  "",
  "---",
  "",
  "Updated after the design review.",
].join("\n");

export const NOTES: Note[] = [
  { id: "n1", title: "Launch checklist", content: LAUNCH_NOTE, pinned: true, caret: 0, createdAt: now - 5 * day, updatedAt: now - 2 * hour, lastOpenedAt: now - 1 * min },
  { id: "n2", title: "Ideas", content: "# Ideas\n\nA **calculator** that understands `3 weeks from today` and time zones.\n\n- Clipboard pinboards\n- Window layouts per display", createdAt: now - 12 * day, updatedAt: now - 1 * day, lastOpenedAt: now - 32 * min },
  { id: "n3", title: "Week / Work", content: "Week / Work\n\n- [ ] Review the notes window PR\n- [ ] Plan the 0.2 milestone\n- [x] Fix the snippet keyword bug", createdAt: now - 20 * day, updatedAt: now - 3 * day, lastOpenedAt: now - 2 * day },
  { id: "n4", title: "Week / Personal", content: "Week / Personal\n\nBook the bike service and call the bank about the card.", createdAt: now - 21 * day, updatedAt: now - 4 * day, lastOpenedAt: now - 5 * day },
  { id: "n5", title: "Books", content: "Books\n\n- *The Design of Everyday Things*\n- *A Pattern Language*\n- *Thinking in Systems*", pinned: true, createdAt: now - 60 * day, updatedAt: now - 30 * day, lastOpenedAt: now - 31 * day },
];

export const PROVIDERS: (AIProvider & { hasApiKey: boolean })[] = [
  {
    id: "openai",
    name: "OpenAI",
    template: "openai",
    api: "openai",
    baseUrl: "https://api.openai.com/v1",
    enabled: true,
    autoFetchModels: true,
    hasApiKey: true,
    models: [
      { id: "gpt-5.1", name: "GPT-5.1", contextWindow: 400_000, capabilities: { vision: true, tools: true, reasoning: true }, enabled: true },
      { id: "gpt-5.1-mini", name: "GPT-5.1 mini", contextWindow: 400_000, capabilities: { vision: true, tools: true }, enabled: true },
    ],
    createdAt: now - 90 * day,
    updatedAt: now - 2 * day,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    template: "anthropic",
    api: "anthropic",
    baseUrl: "https://api.anthropic.com",
    enabled: true,
    autoFetchModels: true,
    hasApiKey: true,
    models: [{ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", contextWindow: 500_000, capabilities: { vision: true, tools: true, reasoning: true, pdf: true }, enabled: true }],
    createdAt: now - 60 * day,
    updatedAt: now - 5 * day,
  },
  {
    id: "ollama",
    name: "Ollama",
    template: "ollama",
    api: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    enabled: true,
    autoFetchModels: true,
    hasApiKey: false,
    models: [{ id: "llama4:8b", name: "Llama 4 8B", capabilities: { tools: true }, enabled: true }],
    createdAt: now - 20 * day,
    updatedAt: now - 20 * day,
  },
];

export const EXTENSIONS: InstalledExtension[] = [
  {
    name: "github",
    title: "GitHub",
    description: "Search pull requests, issues and repositories.",
    author: "surgecast",
    source: "store",
    version: "1.8.0",
    enabled: true,
    installedAt: now - 30 * day,
    updatedAt: now - 3 * day,
    commands: [
      { name: "my-pull-requests", title: "My Pull Requests", mode: "view" },
      { name: "create-issue", title: "Create Issue", mode: "view" },
      { name: "repository-readme", title: "Repository Readme", mode: "view" },
    ],
    tools: [],
    preferences: [
      { name: "token", title: "Personal Access Token", description: "Used to read and create issues.", type: "password", required: true, placeholder: "ghp_…" },
      { name: "defaultRepo", title: "Default Repository", type: "textfield", required: false, default: "surgecast/surgecast" },
      { name: "includeDrafts", title: "Pull Requests", label: "Include drafts", type: "checkbox", required: false, default: true },
      { name: "sort", title: "Sort By", type: "dropdown", required: false, default: "updated", data: [{ title: "Recently Updated", value: "updated" }, { title: "Newest", value: "created" }, { title: "Most Commented", value: "comments" }] },
    ],
  },
  {
    name: "weather",
    title: "Weather",
    author: "surgecast",
    source: "store",
    enabled: true,
    installedAt: now - 10 * day,
    updatedAt: now - 10 * day,
    commands: [{ name: "forecast", title: "Weather Forecast", mode: "view", preferences: [{ name: "city", title: "City", type: "textfield", required: true, placeholder: "Berlin" }] }],
    tools: [],
    preferences: [{ name: "units", title: "Units", type: "dropdown", required: false, default: "metric", data: [{ title: "Metric", value: "metric" }, { title: "Imperial", value: "imperial" }] }],
  },
];
