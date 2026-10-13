import { RpcErrorCode, type BackendParams, type CommandInfo, type LaunchResult, type ScriptCommand } from "@opencast/protocol";
import { RpcError } from "../../errors";
import type { MockArea, MockContext } from "./types";

function invalid(message: string): never {
  throw new RpcError({ code: RpcErrorCode.InvalidParams, message });
}
function notFound(message: string): never {
  throw new RpcError({ code: RpcErrorCode.NotFound, message });
}

const HOME = "/Users/me";
const SYSTEM_DIR = `${HOME}/scripts`;
const DEV_DIR = `${HOME}/Developer/script-commands`;
/** Used unless the page sets `?set.scripts.directories=[…]`. */
const DEFAULT_DIRECTORIES = [SYSTEM_DIR, DEV_DIR];

const expand = (path: string) => path.replace(/^~(?=\/|$)/, HOME).replace(/\/+$/, "");
const dirname = (path: string) => path.slice(0, path.lastIndexOf("/"));
const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const TEMPLATES: Record<BackendParams<"scripts.create">["language"], [extension: string, shebang: string]> = {
  bash: ["sh", "/bin/bash"],
  python: ["py", "/usr/bin/env python3"],
  node: ["js", "/usr/bin/env node"],
  typescript: ["ts", "/usr/bin/env tsx"],
  go: ["go", "/usr/bin/env -S go run"],
  csharp: ["cs", "/usr/bin/env -S dotnet run"],
  applescript: ["applescript", "/usr/bin/osascript"],
  swift: ["swift", "/usr/bin/env swift"],
  ruby: ["rb", "/usr/bin/env ruby"],
};

function seedScripts(): ScriptCommand[] {
  return [
    {
      path: `${SYSTEM_DIR}/uptime.sh`,
      title: "System Uptime",
      mode: "fullOutput",
      packageName: "System",
      icon: "⏱️",
      description: "Shows how long this Mac has been running and the current load averages.",
      arguments: [],
      language: "/bin/bash",
    },
    {
      path: `${SYSTEM_DIR}/toggle-dark-mode.applescript`,
      title: "Toggle Dark Mode",
      mode: "silent",
      packageName: "System",
      icon: "🌗",
      description: "Switches macOS between the light and dark appearance.",
      arguments: [],
      language: "/usr/bin/osascript",
    },
    {
      path: `${SYSTEM_DIR}/flush-dns.sh`,
      title: "Flush DNS Cache",
      mode: "compact",
      packageName: "System",
      icon: "🧹",
      description: "Clears the DNS cache and restarts mDNSResponder.",
      needsConfirmation: true,
      arguments: [],
      language: "/bin/bash",
    },
    {
      path: `${DEV_DIR}/brew-update.sh`,
      title: "Update Homebrew",
      mode: "fullOutput",
      packageName: "Developer Utils",
      icon: "🍺",
      description: "Updates Homebrew, upgrades outdated formulae and cleans up old versions.",
      author: "Ada Lovelace",
      authorUrl: "https://github.com/ada",
      arguments: [],
      language: "/bin/zsh",
    },
    {
      path: `${DEV_DIR}/generate-uuid.py`,
      title: "Generate UUID",
      mode: "compact",
      packageName: "Developer Utils",
      icon: "🆔",
      description: "Copies a new random UUID to the clipboard.",
      arguments: [],
      language: "/usr/bin/env python3",
    },
    {
      path: `${DEV_DIR}/kill-port.sh`,
      title: "Kill Process on Port",
      mode: "compact",
      packageName: "Developer Utils",
      icon: "🔌",
      description: "Stops whatever process is listening on a TCP port.",
      needsConfirmation: true,
      arguments: [{ name: "argument1", type: "text", placeholder: "Port", required: true }],
      language: "/bin/bash",
    },
    {
      path: `${DEV_DIR}/search-github-code.js`,
      title: "Search GitHub Code",
      mode: "silent",
      packageName: "Developer Utils",
      icon: "🐙",
      description: "Opens a GitHub code search for the query in your browser.",
      author: "Ada Lovelace",
      authorUrl: "https://github.com/ada",
      arguments: [
        { name: "argument1", type: "text", placeholder: "Query", required: true, percentEncoded: true },
        {
          name: "argument2",
          type: "dropdown",
          placeholder: "Language",
          required: false,
          data: ["TypeScript", "Swift", "Python", "Go", "Rust"].map((title) => ({ title, value: title.toLowerCase() })),
        },
      ],
      language: "/usr/bin/env node",
    },
    {
      path: `${DEV_DIR}/public-ip.sh`,
      title: "Public IP Address",
      mode: "inline",
      packageName: "Network",
      icon: "🌐",
      description: "Shows your public IP address as the command's subtitle.",
      refreshTime: "5m",
      arguments: [],
      language: "/bin/bash",
    },
  ];
}

type Chunk = [delayMs: number, stream: "stdout" | "stderr", text: string];

const BLUE = "\u001b[34m";
const BOLD = "\u001b[1m";
const RESET = "\u001b[0m";
const step = (text: string) => `${BLUE}==>${RESET} ${BOLD}${text}${RESET}\n`;

/** Streamed output of the fullOutput scripts (delays are cumulative, ~1.6 s for Homebrew). */
const STREAMS: Record<string, Chunk[]> = {
  [`${SYSTEM_DIR}/uptime.sh`]: [[140, "stdout", "10:42  up 3 days,  4:12, 2 users, load averages: 1.92 1.88 1.75\n"]],
  [`${DEV_DIR}/brew-update.sh`]: [
    [80, "stdout", step("Updating Homebrew...")],
    [180, "stdout", "Already up-to-date.\n"],
    [120, "stdout", step("Outdated Formulae")],
    [60, "stdout", "node (22.22.0) < 22.23.0\nripgrep (14.1.1) < 15.0.0\nffmpeg (8.0) < 8.0.1\n"],
    [140, "stdout", step("Upgrading 3 outdated packages:")],
    [60, "stdout", "node 22.22.0 -> 22.23.0\nripgrep 14.1.1 -> 15.0.0\nffmpeg 8.0 -> 8.0.1\n"],
    [150, "stdout", step("Pouring node--22.23.0.arm64_tahoe.bottle.tar.gz")],
    [160, "stdout", "🍺  /opt/homebrew/Cellar/node/22.23.0: 2,174 files, 78.4MB\n"],
    [120, "stdout", step("Pouring ripgrep--15.0.0.arm64_tahoe.bottle.tar.gz")],
    [90, "stdout", "🍺  /opt/homebrew/Cellar/ripgrep/15.0.0: 13 files, 6.4MB\n"],
    [60, "stderr", "Warning: ffmpeg 8.0.1 is already installed and up-to-date.\n"],
    [140, "stdout", step("Cleaning up")],
    [120, "stdout", "Removed 3 old versions (139.2MB)\n"],
  ],
};

let darkMode = true;

/** Result of the non-streaming scripts (and the final line of the streaming ones). */
function runScript(script: ScriptCommand, values: string[]): { exitCode: number; output: string } {
  switch (basename(script.path)) {
    case "toggle-dark-mode.applescript":
      darkMode = !darkMode;
      return { exitCode: 0, output: `Switched to ${darkMode ? "Dark" : "Light"} Appearance` };
    case "flush-dns.sh":
      return { exitCode: 0, output: "Flushed DNS Cache" };
    case "generate-uuid.py":
      return { exitCode: 0, output: `Copied ${crypto.randomUUID().toUpperCase()}` };
    case "kill-port.sh": {
      const port = Number(values[0]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return { exitCode: 2, output: "Port must be a number between 1 and 65535" };
      return port === 3000 ? { exitCode: 0, output: "Stopped node (PID 48211) on port 3000" } : { exitCode: 1, output: `Nothing is listening on port ${port}` };
    }
    case "search-github-code.js":
      return { exitCode: 0, output: `Opened GitHub search for “${values[0]}”` };
    case "public-ip.sh":
      return { exitCode: 0, output: "203.0.113.42" };
    default: {
      const stream = STREAMS[script.path];
      return { exitCode: 0, output: stream ? stream.map(([, , text]) => text).join("") : "Hello" };
    }
  }
}

const lastLine = (output: string) =>
  output
    .replace(/\u001b\[[0-9;]*m/g, "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1) ?? "";

function initialDirectories(): { directories: string[]; fromUrl: boolean } {
  const raw = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("set.scripts.directories");
  if (raw === null) return { directories: DEFAULT_DIRECTORIES, fromUrl: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    return { directories: Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [], fromUrl: true };
  } catch {
    return { directories: [raw], fromUrl: true };
  }
}

interface Execution {
  script: ScriptCommand;
  output: string;
  startedAt: number;
  timers: ReturnType<typeof setTimeout>[];
}

/**
 * Mock backend for script commands: discovery from `scripts.directories`,
 * streamed executions (`scripts.output` → `scripts.completed`), launches that
 * mirror the real backend per mode, creation and directory management.
 */
export function createScriptsMock(ctx: MockContext): MockArea {
  const scripts = seedScripts();
  let { directories, fromUrl } = initialDirectories();
  const executions = new Map<string, Execution>();
  let executionCounter = 0;

  const visible = () => {
    const roots = new Set(directories.map(expand));
    return scripts.filter((s) => roots.has(dirname(s.path)));
  };
  const find = (path: string) => visible().find((s) => s.path === expand(path)) ?? notFound(`Script ${path}`);

  const commandInfo = (script: ScriptCommand): CommandInfo => ({
    id: `script:${script.path}`,
    kind: "script",
    title: script.title,
    subtitle: script.mode === "inline" ? runScript(script, []).output : (script.packageName ?? "Script Commands"),
    typeLabel: "Script Command",
    icon: script.icon ?? { tile: { glyph: "terminal-16", background: ["#3A3F4B", "#22252D"] } },
    mode: script.mode === "fullOutput" ? "view" : "no-view",
    arguments: script.arguments,
    enabled: true,
    description: script.description,
    keywords: [script.packageName ?? "", script.path],
    interval: script.refreshTime,
  });

  /** Keep root search in step with the visible scripts. */
  const syncCommands = () => {
    const list = ctx.commands;
    if (list) {
      const wanted = new Map(visible().map((s) => [`script:${s.path}`, s]));
      for (let i = list.length - 1; i >= 0; i--) if (list[i].kind === "script" && !wanted.has(list[i].id)) list.splice(i, 1);
      for (const [id, script] of wanted) if (!list.some((c) => c.id === id)) list.push(commandInfo(script));
    }
    ctx.events.emit("commands.changed", { reason: "scripts" });
  };

  const setDirectories = (next: string[]) => {
    directories = next;
    ctx.events.emit("settings.changed", { key: "scripts.directories", value: next });
    syncCommands();
  };

  ctx.events.on("settings.changed", ({ key, value }) => {
    if (key !== "scripts.directories" || !Array.isArray(value) || value === directories) return;
    directories = value.filter((p): p is string => typeof p === "string");
    syncCommands();
  });

  // The base mock's settings start with no script directories; publish ours once the
  // launcher has loaded settings, and drop fixture scripts outside them from root search.
  setTimeout(() => {
    if (!fromUrl) ctx.events.emit("settings.changed", { key: "scripts.directories", value: directories });
    syncCommands();
  }, 300);

  const argumentsFor = (script: ScriptCommand, values: string[]) =>
    script.arguments.map((argument, index) => {
      const value = values[index] ?? "";
      if (argument.required && !value.trim()) invalid(`Missing script argument: ${argument.placeholder || argument.name}`);
      return value;
    });

  const start = (script: ScriptCommand, values: string[]): string => {
    const executionId = `mock-exec-${++executionCounter}`;
    const execution: Execution = { script, output: "", startedAt: Date.now(), timers: [] };
    executions.set(executionId, execution);
    const chunks: Chunk[] = STREAMS[script.path] ?? [[120, "stdout", `${runScript(script, values).output}\n`]];
    let at = 0;
    for (const [delay, stream, chunk] of chunks) {
      at += delay;
      execution.timers.push(
        setTimeout(() => {
          execution.output += chunk;
          ctx.events.emit("scripts.output", { executionId, stream, chunk });
        }, at),
      );
    }
    execution.timers.push(setTimeout(() => finish(executionId, 0), at + 60));
    return executionId;
  };

  const finish = (executionId: string, exitCode: number) => {
    const execution = executions.get(executionId);
    if (!execution) return;
    execution.timers.forEach(clearTimeout);
    executions.delete(executionId);
    const output = execution.output.trim();
    ctx.events.emit("scripts.completed", { executionId, exitCode, output, lastLine: lastLine(output), durationMs: Date.now() - execution.startedAt });
  };

  const launch = (command: CommandInfo, args?: Record<string, string>): LaunchResult | undefined => {
    if (command.kind !== "script") return undefined;
    const script = find(command.id.slice("script:".length));
    const values = argumentsFor(
      script,
      script.arguments.map((a) => args?.[a.name] ?? ""),
    );
    if (script.mode === "fullOutput") return { kind: "view", view: { id: "script-output", title: script.title, props: { executionId: start(script, values), path: script.path } } };
    const result = runScript(script, values);
    if (result.exitCode) return { kind: "error", message: lastLine(result.output) || `Script exited with status ${result.exitCode}` };
    if (script.mode === "inline") return { kind: "done", hud: "Refreshed", closeWindow: false };
    return { kind: "done", closeWindow: script.mode === "silent", hud: lastLine(result.output) || "Script Finished" };
  };

  return {
    commands: visible()
      .filter((s) => s.path !== `${SYSTEM_DIR}/uptime.sh`) // already in the shared fixtures
      .map(commandInfo),
    launch,
    handlers: {
      "scripts.list": () => visible(),
      "scripts.reload": () => syncCommands(),
      "scripts.directories.add": ({ path }) => {
        if (!directories.map(expand).includes(expand(path))) setDirectories([...directories, expand(path)]);
      },
      "scripts.directories.remove": ({ path }) => setDirectories(directories.filter((d) => expand(d) !== expand(path))),
      "scripts.start": ({ path, arguments: values }) => {
        const script = find(path);
        return { executionId: start(script, argumentsFor(script, values ?? [])) };
      },
      "scripts.cancel": ({ executionId }) => {
        if (!executions.has(executionId)) notFound(`Execution ${executionId}`);
        finish(executionId, -1);
      },
      "scripts.run": ({ path, arguments: values }) => {
        const script = find(path);
        const result = runScript(script, argumentsFor(script, values ?? []));
        return { exitCode: result.exitCode, output: result.output.trim(), lastLine: lastLine(result.output) };
      },
      "scripts.create": ({ directory, title, mode, language, packageName, icon, needsConfirmation, refreshTime }) => {
        if (!title.trim()) invalid("Script title is required");
        if (/\r|\n/.test(title + (packageName ?? "") + (icon ?? ""))) invalid("Metadata cannot contain newlines");
        const dir = expand(directory);
        if (!directories.map(expand).includes(dir)) invalid("Choose a configured script directory");
        const [extension, shebang] = TEMPLATES[language] ?? invalid("Unsupported script language");
        const slug =
          title
            .normalize("NFKD")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "script";
        const path = `${dir}/${slug}.${extension}`;
        if (scripts.some((s) => s.path === path)) invalid(`EEXIST: file already exists, open '${path}'`);
        const script: ScriptCommand = {
          path,
          title: title.trim(),
          mode,
          packageName: packageName || basename(dir).replace(/[-_]/g, " "),
          icon,
          arguments: [],
          language: shebang,
          ...(mode === "inline" ? { refreshTime: refreshTime ?? "1m" } : needsConfirmation ? { needsConfirmation: true } : {}),
        };
        scripts.push(script);
        syncCommands();
        return script;
      },
    },
  };
}
