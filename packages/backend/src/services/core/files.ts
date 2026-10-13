import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { basename, relative, sep } from "node:path";
import { promisify } from "node:util";
import type { FileResult } from "@surgecast/protocol";
import type { AppContext, Service } from "../../context";
import { boundedLimit, expandPath } from "./shared";
import { RpcError } from "../../util/errors";
const exec = promisify(execFile);
export function spotlightQuery(query: string): string {
  const escaped = query
    .replace(/[\\"*?]/g, (ch) => `\\${ch}`)
    .replace(/[\r\n\x00]/g, " ");
  return `kMDItemDisplayName == "*${escaped}*"cd`;
}
export function ignoredPath(
  path: string,
  patterns: string[],
  hidden = false,
): boolean {
  if (
    !hidden &&
    path.split(sep).some((part) => part.startsWith(".") && part !== ".")
  )
    return true;
  return patterns.some((pattern) => {
    const regex = pattern
      .split(/([*?])/)
      .map((s) =>
        s === "*"
          ? ".*"
          : s === "?"
            ? "."
            : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("");
    return new RegExp(`(?:^|/)${regex}(?:/|$)`).test(path);
  });
}
export async function searchFiles(
  ctx: AppContext,
  query: string,
  limit = 50,
  scopes?: string[],
  signal?: AbortSignal,
  recent = false,
): Promise<FileResult[]> {
  if (process.platform !== "darwin")
    throw RpcError.invalidParams("Spotlight file search requires macOS");
  const roots = (scopes ?? ctx.settings.get("files.directories")).map(
    expandPath,
  );
  if (!roots.length || (!query.trim() && !recent)) return [];
  const predicate = recent
    ? "kMDItemLastUsedDate >= $time.today(-30)"
    : spotlightQuery(query);
  const outputs = await Promise.all(
    roots.map((root) =>
      exec("/usr/bin/mdfind", ["-0", "-onlyin", root, predicate], {
        signal,
        maxBuffer: 16 * 1024 * 1024,
        timeout: 10000,
      }),
    ),
  );
  const stdout = outputs.map((output) => output.stdout).join("\0");
  const paths = [...new Set(stdout.split("\0").filter(Boolean))].filter(
    (path) =>
      roots.some((root) => {
        const rel = relative(root, path);
        return (
          rel === "" ||
          (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(sep))
        );
      }) &&
      !ignoredPath(
        path,
        ctx.settings.get("files.ignorePatterns"),
        ctx.settings.get("files.includeHiddenFiles"),
      ),
  );
  const results = await Promise.all(
    paths.slice(0, recent ? 500 : boundedLimit(limit)).map(async (path) => {
      try {
        const info = await stat(path);
        const meta = recent
          ? await ctx.native.call("files.metadata", { path }).catch(() => null)
          : null;
        return {
          path,
          name: basename(path),
          kind: info.isDirectory() ? "Folder" : "File",
          modified: info.mtimeMs,
          size: info.size,
          lastUsed: meta?.lastOpened ? Date.parse(meta.lastOpened) : 0,
        };
      } catch {
        return null;
      }
    }),
  );
  return results
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) =>
      recent ? b.lastUsed - a.lastUsed : a.name.localeCompare(b.name),
    )
    .slice(0, boundedLimit(limit))
    .map(({ lastUsed, ...r }) => r);
}
export const filesService: Service = {
  name: "core.files",
  register(ctx) {
    const pending = new Map<string, AbortController>();
    ctx.onShutdown(() => {
      for (const controller of pending.values()) controller.abort();
      pending.clear();
    });
    ctx.rpc.handleAll({
      "files.search": async ({ query, limit, scope }, caller) => {
        pending.get(caller.connectionId)?.abort();
        const controller = new AbortController();
        pending.set(caller.connectionId, controller);
        try {
          return await searchFiles(
            ctx,
            query,
            limit,
            scope,
            AbortSignal.any([controller.signal, caller.signal]),
          );
        } catch (error) {
          if (controller.signal.aborted) return [];
          throw error;
        } finally {
          if (pending.get(caller.connectionId) === controller)
            pending.delete(caller.connectionId);
        }
      },
      "files.recent": ({ limit }, caller) =>
        searchFiles(ctx, "", limit, undefined, caller.signal, true),
    });
  },
};
