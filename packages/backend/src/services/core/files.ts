import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { basename, relative, sep } from "node:path";
import { promisify } from "node:util";
import type { FileResult } from "@surgecast/protocol";
import type { AppContext, Service } from "../../context";
import { boundedLimit, expandPath } from "./shared";
import { matchesIgnoreFiles } from "./file-ignores";
import { RpcError } from "../../util/errors";
const exec = promisify(execFile);
export function spotlightQuery(query: string, content = false): string {
  const escaped = query
    .replace(/[\\"*?]/g, (ch) => `\\${ch}`)
    .replace(/[\r\n\x00]/g, " ");
  const name = `kMDItemDisplayName == "*${escaped}*"cd`;
  return content ? `(${name}) || (kMDItemTextContent == "*${escaped}*"cd)` : name;
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
  ).filter(root => ctx.settings.get("files.indexNetworkAndRemovableVolumes") || !root.startsWith("/Volumes/"));
  if (!roots.length || (!query.trim() && !recent)) return [];
  const predicate = recent
    ? "kMDItemLastUsedDate >= $time.today(-30)"
    : spotlightQuery(query, ctx.settings.get("files.contentSearch"));
  const outputs = await Promise.all(
    roots.map(async (root) =>
      (await stat(root).catch(() => null)) ? exec("/usr/bin/mdfind", ["-0", "-onlyin", root, predicate], {
        signal,
        maxBuffer: 16 * 1024 * 1024,
        timeout: 10000,
      }) : { stdout: "" },
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
  const ignoreCache = new Map<string, Promise<string[]>>();
  const eligible = ctx.settings.get("files.useIgnoreFiles") ? (await Promise.all(paths.map(async path => {
    const root = roots.filter(r => !relative(r, path).startsWith("..")).sort((a, b) => a.length - b.length)[0];
    return root && await matchesIgnoreFiles(path, root, ignoreCache) ? null : path;
  }))).filter((path): path is string => !!path) : paths;
  const results = await Promise.all(
    eligible.slice(0, recent ? 500 : boundedLimit(limit)).map(async (path) => {
      try {
        const info = await stat(path);
        const meta = recent
          ? await ctx.native.call("files.metadata", { path }).catch(() => null)
          : null;
        const file = {
          path,
          name: basename(path),
          kind: info.isDirectory() ? "Folder" : "File",
          modified: info.mtimeMs,
          size: info.size,
          lastUsed: meta?.lastOpened ? Date.parse(meta.lastOpened) : 0,
        };
        if (path.startsWith("/Volumes/")) ctx.db.run("INSERT OR REPLACE INTO file_volume_cache (path,data) VALUES (?,?)", path, JSON.stringify(file));
        return file;
      } catch {
        return null;
      }
    }),
  );
  if (ctx.settings.get("files.keepRemovedVolumeFiles") && ctx.settings.get("files.indexNetworkAndRemovableVolumes")) {
    for (const row of ctx.db.all<{ data: string }>("SELECT data FROM file_volume_cache")) {
      const file = JSON.parse(row.data) as NonNullable<typeof results[number]>;
      const volume = file.path.split("/").slice(0, 3).join("/");
      if (!roots.some(root => { const rel = relative(root, file.path); return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep)); }) ||
        ignoredPath(file.path, ctx.settings.get("files.ignorePatterns"), ctx.settings.get("files.includeHiddenFiles")) ||
        (!recent && !file.name.toLowerCase().includes(query.toLowerCase())) || await stat(volume).catch(() => null)) continue;
      results.push(file);
    }
  }
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
    ctx.db.addMigrations({ id: "core-files-volume-cache-001", up: "CREATE TABLE file_volume_cache (path TEXT PRIMARY KEY, data TEXT NOT NULL)" });
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
