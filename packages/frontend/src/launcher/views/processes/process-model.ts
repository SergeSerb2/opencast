import type { ImageLike, ProcessInfo } from "@opencast/protocol";
import { fuzzyFilter, type MatchRange } from "../../../lib/fuzzy";

export type ProcessScope = "all" | "apps";
export type ProcessSort = "cpu" | "memory";

/** Search-bar dropdown choices (grouped by scope): what to show and how to sort it. */
export const PROCESS_FILTERS: { value: string; title: string; section: string; scope: ProcessScope; sort: ProcessSort }[] = [
  { value: "all:cpu", title: "All by CPU", section: "All Processes", scope: "all", sort: "cpu" },
  { value: "all:memory", title: "All by Memory", section: "All Processes", scope: "all", sort: "memory" },
  { value: "apps:cpu", title: "Apps by CPU", section: "Applications", scope: "apps", sort: "cpu" },
  { value: "apps:memory", title: "Apps by Memory", section: "Applications", scope: "apps", sort: "memory" },
];

export function parseFilter(value: string | undefined): { scope: ProcessScope; sort: ProcessSort } {
  const filter = PROCESS_FILTERS.find((f) => f.value === value) ?? PROCESS_FILTERS[0];
  return { scope: filter.scope, sort: filter.sort };
}

/** Processes in scope, heaviest first by the chosen metric (ties by name, then PID). */
export function visibleProcesses(processes: ProcessInfo[], scope: ProcessScope, sort: ProcessSort): ProcessInfo[] {
  const metric = (p: ProcessInfo) => (sort === "cpu" ? p.cpuPercent : p.memoryBytes);
  return processes.filter((p) => scope === "all" || p.app).sort((a, b) => metric(b) - metric(a) || a.name.localeCompare(b.name) || a.pid - b.pid);
}

/**
 * Processes matching a search (name, PID, executable or bundle id), keeping
 * the metric order; title match ranges for highlighting.
 */
export function searchProcesses(processes: ProcessInfo[], query: string): { process: ProcessInfo; titleRanges: MatchRange[] }[] {
  const text = query.trim();
  if (!text) return processes.map((process) => ({ process, titleRanges: [] }));
  const hits = new Map(
    fuzzyFilter(processes, text, (p) => [
      { text: p.name, highlight: true },
      { text: String(p.pid) },
      { text: p.executable.split("/").pop() ?? "", weight: 0.8 },
      { text: p.app?.bundleId ?? "", weight: 0.6 },
    ]).map((hit) => [hit.item, hit.ranges]),
  );
  return processes.flatMap((process) => {
    const ranges = hits.get(process);
    return ranges ? [{ process, titleRanges: ranges }] : [];
  });
}

/** "512 KB", "612 MB", "1.48 GB" (binary units, like Activity Monitor). */
export function formatMemory(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(0, Math.round(kb))} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
}

export function formatCpu(percent: number): string {
  return `${(Math.round(percent * 10) / 10).toFixed(1)}%`;
}

/** Outermost .app bundle containing an executable (helpers resolve to their app). */
export function bundlePath(executable: string): string | undefined {
  const match = /^(\/.*?\.app)(\/|$)/.exec(executable);
  return match?.[1];
}

/** Icon: the app's (or the enclosing app's) Finder icon, otherwise a terminal glyph. */
export function processIcon(process: ProcessInfo): ImageLike {
  const path = process.app?.path ?? bundlePath(process.executable);
  return path ? { fileIcon: path } : "terminal-16";
}

/** What "Show in Finder" reveals, if the process has a location on disk. */
export function revealPath(process: ProcessInfo): string | undefined {
  return process.app?.path ?? bundlePath(process.executable) ?? (process.executable.startsWith("/") ? process.executable : undefined);
}
