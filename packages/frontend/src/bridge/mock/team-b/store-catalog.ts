import type { CommandMode, ExtensionPreference, StoreExtension } from "@opencast/protocol";

/**
 * Fictional Store catalog for the mock backend: tile icons, avatars and
 * screenshots are generated SVGs (no network), READMEs are written here.
 */

const DAY = 86_400_000;
const now = Date.now();

const svgUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`;

/** White 24×24 stroke glyphs drawn for the mock icons. */
const GLYPHS = {
  branch: "M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a9 9 0 0 1-9 9",
  stripes: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M5 15l4 4 M4 10l10 10 M6 6l12 12 M10 4l10 10",
  music: "M9 18V5l12-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  mug: "M5 9h10v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z M15 12h2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2 M6 5c1-1 2-1 3 0s2 1 3 0 2-1 3 0",
  diamond: "M12 3l9 9-9 9-9-9z M12 8l4 4-4 4-4-4z",
  hash: "M10 3L8 21 M16 3l-2 18 M4 9h16 M3 15h16",
  page: "M6 3h9l4 4v14H6z M10 17V9l5 8V9",
  check: "M4 12.5l5 5L20 6.5",
  dropper: "M15 4l5 5 M18 6.5l-9.5 9.5L4 17l1-4.5L14.5 3",
  cross: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M15 9l-6 6 M9 9l6 6",
  containers: "M3 12h18 M5 12V9h3v3 M8 12V9h3v3 M11 12V9h3v3 M8 9V6h3v3 M3 12c0 5 4 8 9 8s8-3 9-8",
  weather: "M12 3v2 M5.6 5.6l1.4 1.4 M3 12h2 M16.5 10.5a5 5 0 0 0-9-2 M7 20h10a3 3 0 0 0 0-6 5 5 0 0 0-9.6 1.4A2.4 2.4 0 0 0 7 20z",
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  book: "M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z M4 20V5 M8 7h7",
  translate: "M4 5h8 M8 3v2 M6 5c0 4 3 7 6 8 M11 5c-1 4-4 7-7 8 M13 21l4-9 4 9 M14.5 18h5",
  frame: "M3 8h18 M3 16h18 M8 3v18 M16 3v18",
  coffee: "M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M16 11h2a2 2 0 0 1 0 4h-2 M8 3v3 M12 3v3",
  code: "M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16",
  coins: "M12 3v18 M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  news: "M7 6l5 7 5-7 M12 13v6",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 14s1.5 2 4 2 4-2 4-2 M9 9.5h.01 M15 9.5h.01",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2",
  wave: "M3 10c2-4 5-4 7 0s5 4 7 0 2-2 4-2 M3 16c2-4 5-4 7 0s5 4 7 0 2-2 4-2",
  gauge: "M12 14l4-4 M3.5 18a10 10 0 1 1 17 0",
  standup: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20a5 5 0 0 1 10 0 M11 20a5 5 0 0 1 10 0",
} as const;

export type Glyph = keyof typeof GLYPHS;

/** Rounded-square tile with a gradient and a white glyph, like a Store extension icon. */
export function tileIconUrl(glyph: Glyph, top: string, bottom: string): string {
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="14" fill="url(#g)"/><rect x="2.5" y="2.5" width="59" height="59" rx="13.5" fill="none" stroke="#ffffff" stroke-opacity="0.18"/><g transform="translate(14 14) scale(1.5)" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${GLYPHS[glyph]}"/></g></svg>`,
  );
}

function avatarUrl(initials: string, top: string, bottom: string): string {
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><circle cx="32" cy="32" r="32" fill="url(#a)"/><text x="32" y="41" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="25" font-weight="600" fill="#ffffff">${initials}</text></svg>`,
  );
}

/** A 16:10 mock screenshot: a launcher window with list rows, a detail pane or a grid. */
function screenshotUrl(title: string, top: string, bottom: string, layout: "list" | "detail" | "grid", seed: number): string {
  const rows = Array.from({ length: 6 }, (_, row) => {
    const i = row + seed * 3;
    const y = 214 + row * 64;
    const selected = row === 0 ? `<rect x="232" y="${y - 8}" width="${layout === "detail" ? 344 : 816}" height="56" rx="14" fill="#ffffff" fill-opacity="0.09"/>` : "";
    return `${selected}<rect x="252" y="${y + 6}" width="28" height="28" rx="8" fill="${i % 2 ? bottom : top}"/><rect x="298" y="${y + 13}" width="${150 + ((i * 47) % 120)}" height="13" rx="6.5" fill="#ffffff" fill-opacity="0.82"/>${layout === "list" ? `<rect x="${500 + ((i * 47) % 120)}" y="${y + 13}" width="${90 + ((i * 31) % 70)}" height="13" rx="6.5" fill="#ffffff" fill-opacity="0.35"/><rect x="960" y="${y + 13}" width="60" height="13" rx="6.5" fill="#ffffff" fill-opacity="0.3"/>` : ""}`;
  }).join("");
  const detail =
    layout === "detail"
      ? `<rect x="600" y="140" width="1" height="470" fill="#ffffff" fill-opacity="0.12"/><rect x="636" y="200" width="300" height="22" rx="11" fill="#ffffff" fill-opacity="0.85"/><rect x="636" y="244" width="380" height="12" rx="6" fill="#ffffff" fill-opacity="0.4"/><rect x="636" y="268" width="340" height="12" rx="6" fill="#ffffff" fill-opacity="0.4"/><rect x="636" y="308" width="392" height="120" rx="14" fill="${top}" fill-opacity="0.35"/>${[0, 1, 2, 3].map((i) => `<rect x="636" y="${460 + i * 34}" width="120" height="11" rx="5.5" fill="#ffffff" fill-opacity="0.35"/><rect x="${900 - i * 20}" y="${460 + i * 34}" width="${128 + i * 20}" height="11" rx="5.5" fill="#ffffff" fill-opacity="0.7"/>`).join("")}`
      : "";
  const tiles =
    layout === "grid"
      ? Array.from(
          { length: 8 },
          (_, i) => `<rect x="${246 + (i % 4) * 200}" y="${200 + Math.floor(i / 4) * 200}" width="180" height="180" rx="18" fill="${i % 3 ? top : bottom}" fill-opacity="${0.35 + (i % 4) * 0.15}"/>`,
        ).join("")
      : "";
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="#14141a"/></linearGradient></defs><rect width="1280" height="800" fill="url(#b)"/><rect x="200" y="80" width="880" height="620" rx="30" fill="#1f1f27" fill-opacity="0.92"/><rect x="200.5" y="80.5" width="879" height="619" rx="29.5" fill="none" stroke="#ffffff" stroke-opacity="0.12"/><text x="244" y="132" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="26" fill="#ffffff" fill-opacity="0.45">${title}</text><rect x="200" y="160" width="880" height="1" fill="#ffffff" fill-opacity="0.08"/>${layout === "grid" ? tiles : rows}${detail}<rect x="216" y="640" width="200" height="40" rx="20" fill="#ffffff" fill-opacity="0.08"/><rect x="864" y="640" width="200" height="40" rx="20" fill="#ffffff" fill-opacity="0.08"/></svg>`,
  );
}

interface Developer {
  handle: string;
  name: string;
  avatar: string;
}

function developer(handle: string, name: string, top: string, bottom: string): Developer {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
  return { handle, name, avatar: avatarUrl(initials, top, bottom) };
}

const DEV = {
  mira: developer("mira", "Mira Okafor", "#FF9A62", "#E2557A"),
  theo: developer("theo", "Theo Lindqvist", "#62B6FF", "#4B5CE6"),
  ana: developer("ana", "Ana Ribeiro", "#5FE0A0", "#1F9E8E"),
  kenji: developer("kenji", "Kenji Morita", "#C08CFF", "#7A4FE0"),
  sasha: developer("sasha", "Sasha Novak", "#FFD45C", "#F08A24"),
  lior: developer("lior", "Lior Ben-Ami", "#7CE0E8", "#2C8FD6"),
  priya: developer("priya", "Priya Raman", "#FF8AB8", "#C03D82"),
  jonas: developer("jonas", "Jonas Weber", "#A6B4C8", "#56627A"),
};

interface CatalogCommand {
  name: string;
  title: string;
  description: string;
  mode: CommandMode;
}

interface CatalogEntry {
  name: string;
  title: string;
  description: string;
  author: Developer;
  owner?: { handle: string; name: string; avatar?: string };
  categories: string[];
  downloads: number;
  version: string;
  updatedDaysAgo: number;
  glyph: Glyph;
  colors: [string, string];
  commands: CatalogCommand[];
  tools?: { name: string; title: string; description: string }[];
  preferences?: ExtensionPreference[];
  platforms?: string[];
  features: string[];
  setup: string[];
  code: { lang: string; text: string };
  shots: ("list" | "detail" | "grid")[];
}

const view = (name: string, title: string, description: string): CatalogCommand => ({ name, title, description, mode: "view" });
const noView = (name: string, title: string, description: string): CatalogCommand => ({ name, title, description, mode: "no-view" });
const menuBar = (name: string, title: string, description: string): CatalogCommand => ({ name, title, description, mode: "menu-bar" });
const token = (title: string, placeholder: string): ExtensionPreference => ({
  name: "token",
  title,
  type: "password",
  required: true,
  placeholder,
  description: `Used to talk to the ${title.split(" ")[0]} API on your behalf.`,
});

const ENTRIES: CatalogEntry[] = [
  {
    name: "github",
    title: "GitHub",
    description: "Review pull requests, triage issues and jump to repositories without leaving the keyboard.",
    author: DEV.mira,
    categories: ["Developer Tools", "Productivity"],
    downloads: 412_880,
    version: "1.9.2",
    updatedDaysAgo: 2,
    glyph: "branch",
    colors: ["#5E6270", "#24262D"],
    commands: [
      view("my-pull-requests", "My Pull Requests", "Pull requests you opened, were asked to review or are mentioned in."),
      view("create-issue", "Create Issue", "File a new issue with labels, assignees and a milestone."),
      view("repository-readme", "Repository Readme", "Read a repository's README rendered in place."),
    ],
    tools: [{ name: "search-issues", title: "Search Issues", description: "Find issues and pull requests across your repositories." }],
    features: ["Review queue grouped by repository", "Create issues from any selection", "Open files and commits in the browser or your editor"],
    setup: ["Create a fine-grained personal access token with read access to pull requests and issues.", "Run **My Pull Requests** and paste the token when asked."],
    code: { lang: "sh", text: '# Check that the token can read your repositories\ncurl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user/repos?per_page=1' },
    shots: ["detail", "list", "list"],
  },
  {
    name: "linear",
    title: "Linear",
    description: "Create, search and update Linear issues, and keep an eye on your active cycle.",
    author: DEV.theo,
    categories: ["Productivity", "Developer Tools"],
    downloads: 186_420,
    version: "2.4.0",
    updatedDaysAgo: 5,
    glyph: "stripes",
    colors: ["#7C8CFF", "#4B4FD8"],
    commands: [
      view("create-issue", "Create Issue", "Start a new issue with team, priority and estimate."),
      view("my-issues", "My Issues", "Issues assigned to you, grouped by status."),
      view("active-cycle", "Active Cycle", "Progress of your team's current cycle."),
      menuBar("menu-bar", "Assigned Issues", "Your open issue count in the menu bar."),
    ],
    tools: [
      { name: "create-issue", title: "Create Issue", description: "Create an issue from a natural-language request." },
      { name: "update-issue", title: "Update Issue", description: "Change status, assignee or priority of an issue." },
    ],
    preferences: [token("Linear API Key", "lin_api_…")],
    features: ["Fast issue creation with templates", "Cycle burndown at a glance", "Menu bar counter for assigned issues"],
    setup: ["Open Linear → Settings → API and create a personal API key.", "Paste it into the extension preferences."],
    code: { lang: "json", text: '{\n  "team": "ENG",\n  "defaultPriority": 2,\n  "showCompleted": false\n}' },
    shots: ["list", "detail", "list"],
  },
  {
    name: "spotify-player",
    title: "Spotify Player",
    description: "Control playback, search the catalog and like the song that's playing.",
    author: DEV.ana,
    categories: ["Media"],
    downloads: 268_031,
    version: "3.4.1",
    updatedDaysAgo: 9,
    glyph: "music",
    colors: ["#5FE0A0", "#16A35A"],
    commands: [
      view("search", "Search", "Search songs, albums, artists and playlists."),
      noView("toggle-play", "Toggle Play/Pause", "Pause or resume what's playing."),
      noView("like-current", "Like Current Song", "Save the playing song to your library."),
      menuBar("now-playing", "Now Playing", "The current track in the menu bar."),
    ],
    tools: [{ name: "play", title: "Play", description: "Play a song, album or playlist by name." }],
    features: ["Search with instant previews", "Global playback hotkeys", "Now Playing in the menu bar"],
    setup: ["Run any command and sign in with Spotify when the browser opens."],
    code: { lang: "sh", text: "# Bind Toggle Play/Pause to a hotkey in Settings → Extensions" },
    shots: ["grid", "list"],
  },
  {
    name: "brew",
    title: "Brew",
    description: "Search, install and upgrade Homebrew formulae and casks.",
    author: DEV.kenji,
    categories: ["Developer Tools", "System"],
    downloads: 154_220,
    version: "1.12.0",
    updatedDaysAgo: 14,
    glyph: "mug",
    colors: ["#FFB25C", "#E0761C"],
    commands: [
      view("search", "Search", "Search formulae and casks with descriptions."),
      view("installed", "Show Installed", "Everything Homebrew installed, with versions."),
      view("outdated", "Show Outdated", "Packages with newer versions available."),
      noView("upgrade", "Upgrade All", "Upgrade every outdated package."),
    ],
    features: ["Search the full formula and cask index", "Upgrade outdated packages in the background", "Copy install commands"],
    setup: ["Install [Homebrew](https://brew.sh) if you haven't already.", "The extension finds `brew` in `/opt/homebrew/bin` or `/usr/local/bin`."],
    code: { lang: "sh", text: "brew update && brew outdated --greedy" },
    shots: ["list", "list"],
  },
  {
    name: "jira",
    title: "Jira",
    description: "Search issues with JQL, create tickets and move work across your boards.",
    author: DEV.sasha,
    categories: ["Productivity", "Developer Tools"],
    downloads: 98_310,
    version: "4.0.3",
    updatedDaysAgo: 21,
    glyph: "diamond",
    colors: ["#5AB8FF", "#1D6FE0"],
    commands: [
      view("search-issues", "Search Issues", "Full-text and JQL search."),
      view("my-issues", "My Issues", "Open issues assigned to you."),
      view("create-issue", "Create Issue", "Create an issue in any project."),
    ],
    preferences: [{ name: "site", title: "Jira Site", type: "textfield", required: true, placeholder: "acme.atlassian.net" }, token("Jira API Token", "Token")],
    features: ["JQL with autocompletion", "Transition issues from the action panel", "Works with Jira Cloud and Data Center"],
    setup: ["Create an API token at id.atlassian.com.", "Enter your site and token in the preferences."],
    code: { lang: "sql", text: "project = ENG AND assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC" },
    shots: ["detail", "list"],
  },
  {
    name: "slack",
    title: "Slack",
    description: "Jump to channels and DMs, search messages and set your status.",
    author: DEV.lior,
    categories: ["Communication"],
    downloads: 143_905,
    version: "2.8.1",
    updatedDaysAgo: 6,
    glyph: "hash",
    colors: ["#B58CFF", "#6E3CC8"],
    commands: [
      view("open-channel", "Open Channel", "Search channels and direct messages."),
      view("search-messages", "Search Messages", "Find messages across your workspace."),
      view("set-status", "Set Status", "Pick a status preset or write your own."),
      noView("toggle-dnd", "Toggle Do Not Disturb", "Pause notifications for an hour."),
    ],
    features: ["Open conversations in the desktop app", "Status presets with expiry", "Unread badges in search results"],
    setup: ["Run any command and authorize the workspace in your browser."],
    code: { lang: "json", text: '{\n  "statusPresets": [":coffee: Focus", ":palm_tree: Out"]\n}' },
    shots: ["list", "detail"],
  },
  {
    name: "notion",
    title: "Notion",
    description: "Search pages and databases, capture quick notes and add database items.",
    author: DEV.priya,
    categories: ["Productivity", "Documentation"],
    downloads: 201_377,
    version: "1.6.4",
    updatedDaysAgo: 3,
    glyph: "page",
    colors: ["#8E95A6", "#3A3F4B"],
    commands: [
      view("search-page", "Search Pages", "Search every page you have access to."),
      view("create-page", "Create Database Page", "Add an item to a database with its properties."),
      noView("quick-capture", "Quick Capture", "Append text to your inbox page."),
    ],
    tools: [
      { name: "search-pages", title: "Search Pages", description: "Find pages and read their content." },
      { name: "append-to-page", title: "Append to Page", description: "Add text to the end of a page." },
    ],
    features: ["Instant page search with previews", "Database forms generated from your schema", "Quick capture to an inbox page"],
    setup: ["Run **Search Pages** and connect your workspace.", "Share the pages you want to search with the integration."],
    code: { lang: "md", text: "- [ ] Draft the launch post\n- [ ] Review analytics" },
    shots: ["detail", "list", "detail"],
  },
  {
    name: "todoist",
    title: "Todoist",
    description: "Add tasks in natural language and work through today's list.",
    author: DEV.ana,
    categories: ["Productivity"],
    downloads: 120_640,
    version: "5.1.0",
    updatedDaysAgo: 11,
    glyph: "check",
    colors: ["#FF7B6B", "#D9372F"],
    commands: [
      view("today", "Today", "Tasks due today and overdue."),
      view("create-task", "Create Task", "Add a task with project, labels and due date."),
      menuBar("menu-bar", "Today in Menu Bar", "Your next task in the menu bar."),
    ],
    tools: [{ name: "add-task", title: "Add Task", description: "Create a task from a sentence like “Call Mia tomorrow at 3pm”." }],
    features: ["Natural language due dates", "Complete and reschedule from the action panel", "Next task in the menu bar"],
    setup: ["Sign in with Todoist the first time you run a command."],
    code: { lang: "text", text: "Pay rent every 1st #Home p1" },
    shots: ["list", "detail"],
  },
  {
    name: "color-picker",
    title: "Color Picker",
    description: "Pick a color anywhere on screen and keep a history of your picks.",
    author: DEV.kenji,
    categories: ["Design Tools"],
    downloads: 233_118,
    version: "1.4.2",
    updatedDaysAgo: 30,
    glyph: "dropper",
    colors: ["#FF7BC1", "#9D4BE0"],
    commands: [
      noView("pick-color", "Pick Color", "Pick a color and copy it in your preferred format."),
      view("history", "Color History", "Colors you picked, with formats to copy."),
      view("generate-palette", "Generate Palette", "Shades and tints for a base color."),
    ],
    features: ["HEX, RGB, HSL and OKLCH output", "Palette generator", "Searchable history"],
    setup: ["Grant Screen Recording permission the first time you pick a color."],
    code: { lang: "css", text: ":root {\n  --brand: oklch(68% 0.19 25);\n}" },
    shots: ["grid", "list"],
  },
  {
    name: "kill-process",
    title: "Kill Process",
    description: "Find processes by name and terminate them, sorted by CPU or memory.",
    author: DEV.jonas,
    categories: ["System"],
    downloads: 175_002,
    version: "1.3.0",
    updatedDaysAgo: 45,
    glyph: "cross",
    colors: ["#FF6B6B", "#B5223A"],
    commands: [view("index", "Kill Process", "Search running processes and quit them.")],
    features: ["Sort by CPU or memory", "Force quit stubborn processes", "Shows the app icon for each process"],
    setup: ["No setup needed."],
    code: { lang: "sh", text: "ps -Ao pid,pcpu,comm -r | head -5" },
    shots: ["list"],
  },
  {
    name: "docker",
    title: "Docker",
    description: "Start, stop and inspect containers, images and compose projects.",
    author: DEV.theo,
    owner: { handle: "container-tools", name: "Container Tools", avatar: avatarUrl("CT", "#52C1F5", "#1B78D1") },
    categories: ["Developer Tools"],
    downloads: 89_754,
    version: "2.2.0",
    updatedDaysAgo: 18,
    glyph: "containers",
    colors: ["#52C1F5", "#1B78D1"],
    commands: [
      view("containers", "Containers", "Running and stopped containers."),
      view("images", "Images", "Local images with sizes."),
      view("compose", "Compose Projects", "Compose projects and their services."),
    ],
    features: ["Live container status", "Tail logs in a detail view", "Works with Docker Desktop, OrbStack and Colima"],
    setup: ["Make sure the Docker socket is reachable at `/var/run/docker.sock`."],
    code: { lang: "yaml", text: 'services:\n  web:\n    image: nginx:alpine\n    ports: ["8080:80"]' },
    shots: ["list", "detail"],
  },
  {
    name: "weather",
    title: "Weather",
    description: "Current conditions and a seven-day forecast for any city.",
    author: DEV.sasha,
    categories: ["Web"],
    downloads: 132_560,
    version: "2.2.0",
    updatedDaysAgo: 4,
    glyph: "weather",
    colors: ["#62C6FF", "#2F7FE6"],
    commands: [view("forecast", "Weather Forecast", "Today and the next seven days."), menuBar("menu-bar", "Weather in Menu Bar", "Temperature and conditions in the menu bar.")],
    preferences: [
      {
        name: "units",
        title: "Units",
        type: "dropdown",
        required: false,
        default: "metric",
        data: [
          { title: "Metric", value: "metric" },
          { title: "Imperial", value: "imperial" },
        ],
      },
    ],
    features: ["Hourly and daily forecasts", "Metric and imperial units", "Menu bar temperature"],
    setup: ["Set your city when you first open the forecast."],
    code: { lang: "json", text: '{ "city": "Lisbon", "units": "metric" }' },
    shots: ["detail"],
  },
  {
    name: "unsplash",
    title: "Unsplash",
    description: "Search free high-resolution photos and set them as your wallpaper.",
    author: DEV.priya,
    categories: ["Media", "Design Tools"],
    downloads: 94_211,
    version: "3.0.5",
    updatedDaysAgo: 27,
    glyph: "camera",
    colors: ["#3A3F4B", "#121318"],
    commands: [view("search-photos", "Search Photos", "Search photos with a grid preview."), noView("random-wallpaper", "Random Wallpaper", "Set a random photo as your desktop picture.")],
    features: ["Grid previews", "Download in any size", "Daily wallpaper"],
    setup: ["No account needed."],
    code: { lang: "sh", text: "# Wallpapers are saved to ~/Pictures/Unsplash" },
    shots: ["grid", "grid"],
  },
  {
    name: "translate",
    title: "Quick Translate",
    description: "Translate text between more than a hundred languages as you type.",
    author: DEV.lior,
    categories: ["Productivity"],
    downloads: 158_903,
    version: "1.8.0",
    updatedDaysAgo: 8,
    glyph: "translate",
    colors: ["#5FD0C0", "#1B8E9E"],
    commands: [view("translate", "Translate", "Translate text with language detection."), noView("translate-selection", "Translate Selected Text", "Translate the selection and paste it back.")],
    features: ["Detects the source language", "Swap languages with one shortcut", "Translate the current selection"],
    setup: ["Pick your two most used languages in the preferences."],
    code: { lang: "text", text: "Bonjour tout le monde → Hello everyone" },
    shots: ["detail"],
  },
  {
    name: "figma-files",
    title: "Figma File Search",
    description: "Find Figma files and projects, and open them in the desktop app.",
    author: DEV.mira,
    categories: ["Design Tools"],
    downloads: 76_402,
    version: "1.2.1",
    updatedDaysAgo: 33,
    glyph: "frame",
    colors: ["#FF9A62", "#E04F6E"],
    commands: [view("search", "Search Files", "Search files across teams and projects."), menuBar("recent", "Recent Files", "Recently opened files in the menu bar.")],
    preferences: [token("Figma Access Token", "figd_…")],
    features: ["Thumbnails in a grid", "Open in the desktop app or browser", "Starred files first"],
    setup: ["Create a personal access token in Figma → Settings → Security."],
    code: { lang: "json", text: '{ "teamIds": ["1234567890"] }' },
    shots: ["grid", "list"],
  },
  {
    name: "coffee",
    title: "Coffee",
    description: "Keep your Mac awake for a while, or until a process finishes.",
    author: DEV.jonas,
    categories: ["System"],
    downloads: 141_277,
    version: "1.5.0",
    updatedDaysAgo: 60,
    glyph: "coffee",
    colors: ["#C8A27A", "#7A5536"],
    commands: [
      noView("caffeinate", "Caffeinate", "Prevent sleep until you decaffeinate."),
      noView("decaffeinate", "Decaffeinate", "Allow sleep again."),
      menuBar("status", "Coffee Status", "Shows whether sleep is prevented."),
    ],
    features: ["Timed sessions", "Stay awake while a process runs", "Menu bar indicator"],
    setup: ["No setup needed."],
    code: { lang: "sh", text: "caffeinate -dimsu -t 3600" },
    shots: ["list"],
  },
  {
    name: "vscode-projects",
    title: "Visual Studio Code Recent Projects",
    description: "Open recent folders, workspaces and files in VS Code.",
    author: DEV.kenji,
    categories: ["Developer Tools", "Applications"],
    downloads: 199_840,
    version: "1.10.2",
    updatedDaysAgo: 12,
    glyph: "code",
    colors: ["#5AB8FF", "#1F5FBF"],
    commands: [view("index", "Search Recent Projects", "Recent folders, workspaces and files.")],
    features: ["Works with VS Code, Insiders, Cursor and VSCodium", "Pin favorite projects", "Open in a new window"],
    setup: ["Choose your editor build in the preferences."],
    code: { lang: "json", text: '{ "build": "Code", "gitRemoteIcons": true }' },
    shots: ["list"],
  },
  {
    name: "currency-converter",
    title: "Currency Converter",
    description: "Convert between currencies and crypto with daily rates.",
    author: DEV.sasha,
    categories: ["Finance"],
    downloads: 64_118,
    version: "2.0.1",
    updatedDaysAgo: 16,
    glyph: "coins",
    colors: ["#FFD45C", "#D69A12"],
    commands: [view("convert", "Convert Currency", "Type an amount and see conversions.")],
    features: ["170+ currencies", "Favorite pairs at the top", "Offline cache of the last rates"],
    setup: ["No setup needed."],
    code: { lang: "text", text: "120 usd in eur" },
    shots: ["list"],
  },
  {
    name: "hacker-news",
    title: "Hacker News",
    description: "Front page, newest and best stories with comment counts.",
    author: DEV.theo,
    categories: ["News"],
    downloads: 58_036,
    version: "1.7.0",
    updatedDaysAgo: 22,
    glyph: "news",
    colors: ["#FFA24A", "#E2620E"],
    commands: [view("frontpage", "Front Page", "Top stories right now."), menuBar("menu-bar", "Top Story", "The top story in the menu bar.")],
    features: ["Read comments in a detail view", "Open links in the background", "Mark stories as read"],
    setup: ["No setup needed."],
    code: { lang: "text", text: "Show HN · Ask HN · Jobs" },
    shots: ["list", "detail"],
  },
  {
    name: "giphy",
    title: "GIF Search",
    description: "Find the perfect GIF and paste it into any conversation.",
    author: DEV.ana,
    categories: ["Fun", "Media"],
    downloads: 87_300,
    version: "2.3.0",
    updatedDaysAgo: 40,
    glyph: "smile",
    colors: ["#FF8AB8", "#7A4FE0"],
    commands: [view("search", "Search GIFs", "Search trending and themed GIFs.")],
    features: ["Animated grid previews", "Copy as file or link", "Recently used GIFs"],
    setup: ["No setup needed."],
    code: { lang: "text", text: "celebrate, thumbs up, mind blown" },
    shots: ["grid"],
  },
  {
    name: "password-vault",
    title: "Password Vault",
    description: "Search vault items and copy usernames, passwords and one-time codes.",
    author: DEV.lior,
    categories: ["Security"],
    downloads: 112_455,
    version: "3.1.0",
    updatedDaysAgo: 7,
    glyph: "lock",
    colors: ["#5E86FF", "#2A3FC0"],
    commands: [view("items", "Search Vault Items", "Logins, cards and secure notes."), noView("generate-password", "Generate Password", "Create and copy a strong password.")],
    features: ["Copy one-time codes", "Concealed clipboard entries", "Locks with your Mac"],
    setup: ["Install the vault CLI and sign in once from Terminal."],
    code: { lang: "sh", text: "vault signin --account my.vault.example" },
    shots: ["list", "detail"],
  },
  {
    name: "tailwind-docs",
    title: "Tailwind CSS Docs",
    description: "Search utility classes and the Tailwind CSS documentation.",
    author: DEV.priya,
    categories: ["Documentation", "Developer Tools"],
    downloads: 49_870,
    version: "1.1.0",
    updatedDaysAgo: 50,
    glyph: "wave",
    colors: ["#52D6D0", "#1A8FB0"],
    commands: [view("search-docs", "Search Documentation", "Search guides and API pages."), view("search-classes", "Search Classes", "Find utilities and the CSS they generate.")],
    features: ["Class lookup with generated CSS", "Docs for v3 and v4", "Copy class names"],
    setup: ["No setup needed."],
    code: { lang: "html", text: '<div class="flex items-center gap-4 rounded-xl p-6">' },
    shots: ["detail"],
  },
  {
    name: "speedtest",
    title: "Speedtest",
    description: "Measure download, upload and latency from the launcher.",
    author: DEV.jonas,
    categories: ["Web", "System"],
    downloads: 71_620,
    version: "1.0.4",
    updatedDaysAgo: 75,
    glyph: "gauge",
    colors: ["#7CE0E8", "#3A6FD8"],
    commands: [view("index", "Run Speedtest", "Test your connection.")],
    platforms: ["macOS", "Windows"],
    features: ["Download, upload and ping", "Share results", "History of past runs"],
    setup: ["No setup needed."],
    code: { lang: "text", text: "Download 512 Mbps · Upload 48 Mbps · Ping 9 ms" },
    shots: ["detail"],
  },
];

export interface CatalogItem {
  listing: StoreExtension;
  readme: string;
  preferences: ExtensionPreference[];
  iconUrl: string;
}

function readme(entry: CatalogEntry, screenshot: string | undefined): string {
  const commands = entry.commands.map((c) => `| ${c.title} | ${c.description} |`).join("\n");
  return [
    `# ${entry.title}`,
    entry.description,
    screenshot ? `![${entry.title} in the launcher](${screenshot})` : "",
    "## Features",
    entry.features.map((f) => `- ${f}`).join("\n"),
    "## Setup",
    entry.setup.map((step, i) => `${i + 1}. ${step}`).join("\n"),
    "## Commands",
    `| Command | What it does |\n| --- | --- |\n${commands}`,
    "## Example",
    `\`\`\`${entry.code.lang}\n${entry.code.text}\n\`\`\``,
    `> Found a bug or have an idea? Open an issue on the extension's repository.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function toCatalogItem(entry: CatalogEntry, index: number): CatalogItem {
  const [top, bottom] = entry.colors;
  const iconUrl = tileIconUrl(entry.glyph, top, bottom);
  const screenshots = entry.shots.map((layout, seed) => screenshotUrl(entry.title, top, bottom, layout, seed));
  const ownerHandle = entry.owner?.handle ?? entry.author.handle;
  const listing: StoreExtension = {
    id: `9a1f${String(index).padStart(4, "0")}-5c2e-4c7a-9e0b-${entry.name
      .padEnd(12, "0")
      .slice(0, 12)
      .replace(/[^a-z0-9]/g, "0")}`,
    name: entry.name,
    title: entry.title,
    description: entry.description,
    author: entry.author,
    owner: entry.owner,
    icon: { light: iconUrl, dark: iconUrl },
    downloadCount: entry.downloads,
    categories: entry.categories,
    commands: entry.commands,
    tools: entry.tools,
    platforms: entry.platforms ?? ["macOS"],
    version: entry.version,
    updatedAt: now - entry.updatedDaysAgo * DAY,
    storeUrl: `https://www.raycast.com/${ownerHandle}/${entry.name}`,
    sourceUrl: `https://github.com/opencast-community/extensions/tree/main/extensions/${entry.name}`,
    readmeUrl: `https://github.com/opencast-community/extensions/blob/main/extensions/${entry.name}/README.md`,
    screenshots,
  };
  return { listing, readme: readme(entry, screenshots[0]), preferences: entry.preferences ?? [], iconUrl };
}

/** Catalog sorted by downloads, like the Store's default order. */
export const STORE_CATALOG: CatalogItem[] = ENTRIES.map(toCatalogItem).sort((a, b) => b.listing.downloadCount - a.listing.downloadCount);

/** Icon for the mock's development extension (not in the Store). */
export const STANDUP_ICON = tileIconUrl("standup", "#B58CFF", "#5E3FD0");
