import { spawn, type ChildProcess } from "node:child_process";
import {
  readFile,
  readdir,
  stat,
  writeFile,
  mkdir,
  chmod,
} from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from "node:path";
import { randomUUID } from "node:crypto";
import type { CommandInfo, ScriptCommand } from "@surgecast/protocol";
import type { AppContext, Service } from "../../context";
import { background, expandPath, nonempty } from "./shared";
import { RpcError } from "../../util/errors";

export function refreshInterval(value?: string): number | null {
  const m = /^(\d+(?:\.\d+)?)(s|m|h|d)$/.exec(value ?? "");
  const n = m
    ? Number(m[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]]!
    : 0;
  return n >= 10000 && n <= 2147483647 ? n : null;
}
export function parseScriptMetadata(
  source: string,
  path: string,
): ScriptCommand | null {
  const metadata: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const m = /^(?:#|REM|::|\/\/)\s*@raycast\.(\w+)\s+(.*)/i.exec(line);
    if (m) metadata[m[1].toLowerCase()] = m[2].trim();
  }
  if (
    parseInt(metadata.schemaversion) !== 1 ||
    !metadata.title ||
    !metadata.mode
  )
    return null;
  const modeName = metadata.mode.toLowerCase();
  let mode: ScriptCommand["mode"] =
    modeName === "fulloutput" || modeName === "full-output"
      ? "fullOutput"
      : ["silent", "inline"].includes(modeName)
        ? (modeName as "silent" | "inline")
        : "compact";
  if (mode === "inline" && !refreshInterval(metadata.refreshtime))
    mode = "compact";
  const args: ScriptCommand["arguments"] = [];
  if (mode !== "inline")
    for (let i = 1; i <= 3; i++) {
      try {
        if (!metadata[`argument${i}`]) continue;
        const argument = JSON.parse(metadata[`argument${i}`]);
        if (!argument || typeof argument !== "object") continue;
        args.push({
          name: `argument${i}`,
          type:
            argument.secure === true
              ? "password"
              : argument.type === "dropdown"
                ? "dropdown"
                : "text",
          placeholder:
            typeof argument.placeholder === "string"
              ? argument.placeholder
              : "",
          required: argument.optional !== true,
          secure: argument.secure === true,
          percentEncoded: argument.percentEncoded === true,
          data: Array.isArray(argument.data)
            ? argument.data.filter(
                (d: unknown) =>
                  !!d &&
                  typeof d === "object" &&
                  typeof (d as { title?: unknown }).title === "string" &&
                  typeof (d as { value?: unknown }).value === "string",
              )
            : undefined,
        });
      } catch {
        /* Raycast ignores individual malformed argument descriptors. */
      }
    }
  const shebang = /^#!\s*(.*)/.exec(source)?.[1];
  return {
    path,
    title: metadata.title,
    mode,
    packageName:
      metadata.packagename || basename(dirname(path)).replace(/[-_]/g, " "),
    icon: metadata.icon,
    iconDark: metadata.icondark,
    description: metadata.description,
    author: metadata.author,
    authorUrl: metadata.authorurl,
    refreshTime: metadata.refreshtime,
    needsConfirmation:
      metadata.needsconfirmation === "true",
    currentDirectoryPath: metadata.currentdirectorypath,
    arguments: args,
    language: shebang ?? (extname(path) === ".go" ? "go" : undefined),
  };
}
const EXTENSIONS = new Set([".ts", ".go", ".cs",
  ".sh",
  ".bash",
  ".zsh",
  ".py",
  ".js",
  ".mjs",
  ".cjs",
  ".applescript",
  ".swift",
  ".rb",
  ".pl",
  ".php",
  ".command",
]);
interface ScriptResult {
  exitCode: number;
  output: string;
  lastLine: string;
}
class Scripts {
  commands: ScriptCommand[] = [];
  private watchers: FSWatcher[] = [];
  private timers: NodeJS.Timeout[] = [];
  private executions = new Map<string, ChildProcess>();
  private executionPaths = new Map<string, string>();
  private inlineOutput = new Map<string, string>();
  private scanning?: Promise<void>;
  private stopped = false;
  private debounce?: NodeJS.Timeout;
  constructor(private ctx: AppContext) {}
  async reload(): Promise<void> {
    if (this.scanning) return this.scanning;
    this.scanning = this.scan().finally(() => {
      this.scanning = undefined;
    });
    return this.scanning;
  }
  private async scan(): Promise<void> {
    const commands: ScriptCommand[] = [];
    const directories = this.ctx.settings
      .get("scripts.directories")
      .map(expandPath);
    for (const directory of directories) {
      try {
        const files = await readdir(directory, { withFileTypes: true });
        for (const file of files) {
          if (
            !file.isFile() ||
            file.name.includes(".template.") ||
            !EXTENSIONS.has(extname(file.name).toLowerCase())
          )
            continue;
          const path = join(directory, file.name);
          try {
            const info = await stat(path);
            if (!info.size || info.size > 2000000) continue;
            const command = parseScriptMetadata(
              await readFile(path, "utf8"),
              path,
            );
            if (command) commands.push(command);
          } catch {
            /* File may disappear during a scan. */
          }
        }
      } catch {
        commands.push(
          ...this.commands.filter((c) => dirname(c.path) === directory),
        );
      }
    }
    if (this.stopped) return;
    this.commands = [...new Map(commands.map((c) => [c.path, c])).values()];
    this.ctx.commands.invalidate("scripts");
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    for (const directory of directories) {
      try {
        const watcher = watch(directory, () => {
          clearTimeout(this.debounce);
          this.debounce = setTimeout(
            () => background(this.ctx, this.reload(), "Script discovery"),
            150,
          );
        });
        watcher.unref();
        this.watchers.push(watcher);
      } catch {
        /* Unavailable directory is preserved for later discovery. */
      }
    }
    for (const command of this.commands)
      if (command.mode === "inline") {
        const run = async () => {
          const prefs = this.ctx.entities.get<{
            enabled?: boolean;
            intervalEnabled?: boolean;
          }>("commandPrefs", `script:${command.path}`)?.data;
          if (
            command.needsConfirmation ||
            prefs?.enabled === false ||
            prefs?.intervalEnabled === false ||
            [...this.executionPaths.values()].includes(command.path) ||
            this.executions.size >= 8
          )
            return;
          try {
            const result = await this.execute(command, [], false);
            if (!result.exitCode) {
              this.inlineOutput.set(
                command.path,
                result.output.split(/\r?\n/)[0],
              );
              this.ctx.commands.invalidate("scripts");
            }
          } catch {
            /* Retry at the next interval. */
          }
        };
        const interval = refreshInterval(command.refreshTime);
        if (interval) {
          const timer = setInterval(
            () => background(this.ctx, run(), "Inline script"),
            interval,
          );
          timer.unref();
          this.timers.push(timer);
        }
        background(this.ctx, run(), "Inline script");
      }
  }
  listProvider(): CommandInfo[] {
    return this.commands.map((c) => ({
      id: `script:${c.path}`,
      kind: "script",
      title: c.title,
      subtitle:
        this.inlineOutput.get(c.path) ?? c.packageName ?? "Script Commands",
      typeLabel: "Script Command",
      icon: c.icon
        ? /^(https?:|\/)/.test(c.icon)
          ? c.icon
          : /\.(png|svg|jpg|jpeg|icns)$/i.test(c.icon)
            ? join(dirname(c.path), c.icon)
            : c.icon
        : {
            tile: { glyph: "terminal-16", background: ["#3A3F4B", "#22252D"] },
          },
      mode: c.mode === "fullOutput" ? "view" : "no-view",
      arguments: c.arguments,
      enabled: true,
      description: c.description,
      keywords: [c.packageName ?? "", c.path],
      interval: c.refreshTime,
    }));
  }
  find(path: string): ScriptCommand {
    const command = this.commands.find((c) => c.path === expandPath(path));
    if (!command) throw RpcError.notFound(`Script ${path}`);
    return command;
  }
  private async confirm(command: ScriptCommand): Promise<void> {
    if (command.needsConfirmation) {
      const result = await this.ctx.native.call("alert.show", {
        title: `Run ${command.title}?`,
        buttons: ["Run Script", "Cancel"],
        style: "warning",
      });
      if (result.index !== 0) throw RpcError.invalidParams("Script cancelled");
    }
  }
  private arguments(command: ScriptCommand, values: string[]): string[] {
    return command.arguments.map((argument, index) => {
      const value = values[index] ?? "";
      if (argument.required && !value.trim())
        throw RpcError.invalidParams(
          `Missing script argument: ${argument.placeholder || argument.name}`,
        );
      if (
        argument.type === "dropdown" &&
        value &&
        !argument.data?.some((d) => d.value === value)
      )
        throw RpcError.invalidParams(
          `Invalid script argument: ${argument.name}`,
        );
      return argument.percentEncoded ? encodeURIComponent(value) : value;
    });
  }
  setInlineOutput(path: string, output: string): void {
    this.inlineOutput.set(path, output.split(/\r?\n/)[0].trim());
    this.ctx.commands.invalidate("scripts");
  }
  async execute(
    command: ScriptCommand,
    values: string[] = [],
    confirmation = true,
    executionId = randomUUID(),
  ): Promise<ScriptResult> {
    if (confirmation) await this.confirm(command);
    if (this.stopped) throw new Error("Script service is shutting down");
    const args = this.arguments(command, values);
    const directory = command.currentDirectoryPath ?? ".";
    const cwd =
      directory.startsWith("~") || isAbsolute(directory)
        ? expandPath(directory)
        : resolve(dirname(command.path), directory);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH ?? "/usr/bin:/bin"}`,
      LANG: process.env.LANG || "en_US.UTF-8",
    };
    delete env.LC_ALL;
    const started = Date.now();
    return new Promise((resolve_, reject) => {
      const isGo = extname(command.path) === ".go";
      const isCSharp = extname(command.path) === ".cs";
      const child = spawn(isGo ? "go" : isCSharp ? "dotnet" : command.path,
        isGo ? ["run", command.path, ...args] : isCSharp ? ["run", "--file", command.path, "--", ...args] : args, {
        cwd,
        env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.executions.set(executionId, child);
      this.executionPaths.set(executionId, command.path);
      let output = "";
      let bytes = 0;
      let settled = false;
      let failure: Error | undefined;
      let fallback: NodeJS.Timeout | undefined;
      const finish = (exitCode: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        this.executions.delete(executionId);
        this.executionPaths.delete(executionId);
        child.stdout?.destroy();
        child.stderr?.destroy();
        const trimmed = output.trim();
        const result = {
          exitCode,
          output: trimmed,
          lastLine: trimmed.split(/\r?\n/).filter(Boolean).at(-1) ?? "",
        };
        this.ctx.events.emit("scripts.completed", {
          executionId,
          ...result,
          durationMs: Date.now() - started,
          error: failure?.message,
        });
        if (failure) reject(failure);
        else resolve_(result);
      };
      const chunk = (data: string, stream: "stdout" | "stderr") => {
        bytes += Buffer.byteLength(data);
        if (bytes > 8 * 1024 * 1024) {
          failure = new Error("Script output exceeded 8 MiB");
          this.terminate(child);
          return;
        }
        const text = data;
        output += text;
        this.ctx.events.emit("scripts.output", {
          executionId,
          stream,
          chunk: text,
        });
      };
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (data) => chunk(data, "stdout"));
      child.stderr?.on("data", (data) => chunk(data, "stderr"));
      child.on("error", (error) => {
        failure = new Error(
          `Cannot execute script: ${error.message}. Check its shebang and executable permissions.`,
        );
        finish(-1);
      });
      child.on("close", (code, signal) => finish(code ?? (signal ? -1 : 0)));
      child.on("exit", (code, signal) => {
        fallback = setTimeout(() => finish(code ?? (signal ? -1 : 0)), 1000);
        fallback.unref();
      });
    });
  }
  async start(command: ScriptCommand, args?: string[]): Promise<string> {
    this.arguments(command, args ?? []);
    if (this.stopped) throw new Error("Script service is shutting down");
    await this.confirm(command);
    const id = randomUUID();
    setImmediate(() =>
      background(
        this.ctx,
        this.execute(command, args, false, id),
        "Script execution",
      ),
    );
    return id;
  }
  private terminate(child: ChildProcess): void {
    child.kill("SIGTERM");
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }, 2000);
    timer.unref();
    child.once("close", () => clearTimeout(timer));
  }
  cancel(id: string): void {
    const child = this.executions.get(id);
    if (!child) throw RpcError.notFound(`Execution ${id}`);
    this.terminate(child);
  }
  shutdown(): void {
    this.stopped = true;
    clearTimeout(this.debounce);
    for (const watcher of this.watchers) watcher.close();
    for (const timer of this.timers) clearInterval(timer);
    for (const child of this.executions.values()) this.terminate(child);
  }
}
export const scriptsService: Service = {
  name: "core.scripts",
  register(ctx) {
    const scripts = new Scripts(ctx);
    ctx.onReady(() => scripts.reload());
    ctx.onShutdown(() => scripts.shutdown());
    ctx.onShutdown(
      ctx.settings.onChange((key) => {
        if (key === "scripts.directories")
          background(ctx, scripts.reload(), "Script discovery");
      }),
    );
    ctx.commands.registerProvider({
      id: "scripts",
      list: () => scripts.listProvider(),
      launch: async (cmd, request) => {
        const script = scripts.find(cmd.id.slice(7));
        const args = script.arguments.map(
          (a) => request.arguments?.[a.name] ?? "",
        );
        if (script.mode === "fullOutput")
          return {
            kind: "view",
            view: {
              id: "script-output",
              title: script.title,
              props: {
                executionId: await scripts.start(script, args),
                path: script.path,
              },
            },
          };
        if (script.mode === "silent")
          await ctx.native.call("window.hide", { kind: "main" });
        const result = await scripts.execute(script, args);
        if (result.exitCode)
          return {
            kind: "error",
            message:
              result.lastLine || `Script exited with status ${result.exitCode}`,
          };
        if (script.mode === "inline") {
          scripts.setInlineOutput(script.path, result.output);
          return { kind: "done", hud: "Refreshed", closeWindow: false };
        }
        return {
          kind: "done",
          closeWindow: script.mode === "silent",
          hud: result.lastLine || "Script Finished",
        };
      },
    });
    ctx.rpc.handleAll({
      "scripts.list": () => scripts.commands,
      "scripts.reload": async () => {
        await scripts.reload();
      },
      "scripts.directories.add": async ({ path }) => {
        const directories = ctx.settings.get("scripts.directories");
        const directory = expandPath(path);
        if (!directories.map(expandPath).includes(directory))
          ctx.settings.set("scripts.directories", [...directories, directory]);
        await scripts.reload();
      },
      "scripts.directories.remove": async ({ path }) => {
        ctx.settings.set(
          "scripts.directories",
          ctx.settings
            .get("scripts.directories")
            .filter((p) => expandPath(p) !== expandPath(path)),
        );
        await scripts.reload();
      },
      "scripts.run": ({ path, arguments: args }) =>
        scripts.execute(scripts.find(path), args),
      "scripts.start": async ({ path, arguments: args }) => ({
        executionId: await scripts.start(scripts.find(path), args),
      }),
      "scripts.cancel": ({ executionId }) => scripts.cancel(executionId),
      "scripts.create": async ({
        directory,
        title,
        mode,
        language,
        packageName,
        icon,
        needsConfirmation,
        refreshTime,
      }) => {
        nonempty(title, "Script title");
        if (/\r|\n/.test(title + (packageName ?? "") + (icon ?? "") + (refreshTime ?? "")))
          throw RpcError.invalidParams("Metadata cannot contain newlines");
        const dir = expandPath(directory);
        if (
          !ctx.settings.get("scripts.directories").map(expandPath).includes(dir)
        )
          throw RpcError.invalidParams("Choose a configured script directory");
        if (refreshTime !== undefined && !refreshInterval(refreshTime))
          throw RpcError.invalidParams("Refresh time must be between 10 seconds and 24 days");
        const templates: Record<string, [string, string, string]> = {
          bash: ["sh", "#!/bin/bash", 'printf "Hello\\n"'],
          python: ["py", "#!/usr/bin/env python3", 'print("Hello")'],
          node: ["js", "#!/usr/bin/env node", 'console.log("Hello");'],
          applescript: [
            "applescript",
            "#!/usr/bin/osascript",
            'display notification "Hello"',
          ],
          swift: ["swift", "#!/usr/bin/env swift", 'print("Hello")'],
          typescript: ["ts", "#!/usr/bin/env -S node --experimental-strip-types", 'console.log("Hello");'],
          go: ["go", "// Run with go run", `package main
import "fmt"
func main() { fmt.Println("Hello") }`],
          csharp: ["cs", "#!/usr/bin/env dotnet", 'Console.WriteLine("Hello");'],
          ruby: ["rb", "#!/usr/bin/env ruby", 'puts "Hello"'],
        };
        const template = templates[language];
        if (!template)
          throw RpcError.invalidParams("Unsupported script language");
        const [extension, shebang, body] = template;
        const comment =
          ["node", "swift", "typescript", "go", "csharp"].includes(language) ? "//" : "#";
        const name =
          title
            .normalize("NFKD")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "script";
        const path = join(dir, `${name}.${extension}`);
        await mkdir(dir, { recursive: true });
        const source = [
          shebang,
          `${comment} @raycast.schemaVersion 1`,
          `${comment} @raycast.title ${title}`,
          `${comment} @raycast.mode ${mode}`,
          ...(refreshTime || mode === "inline" ? [`${comment} @raycast.refreshTime ${refreshTime ?? "1m"}`] : []),
          ...(needsConfirmation ? [`${comment} @raycast.needsConfirmation true`] : []),
          ...(packageName
            ? [`${comment} @raycast.packageName ${packageName}`]
            : []),
          ...(icon ? [`${comment} @raycast.icon ${icon}`] : []),
          "",
          body,
          "",
        ].join("\n");
        await writeFile(path, source, { flag: "wx", mode: 0o755 });
        await chmod(path, 0o755);
        await scripts.reload();
        await scripts.reload();
        return scripts.find(path);
      },
    });
  },
};
