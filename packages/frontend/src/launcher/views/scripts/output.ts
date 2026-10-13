/**
 * Pure helpers for the script output view: terminal text cleanup and the
 * status line shown under the output.
 */

/**
 * ANSI/VT escape sequences: CSI (`ESC [ … final`, including the 8-bit `0x9B`
 * form), OSC (`ESC ] … BEL` or `ESC ] … ESC \`, e.g. hyperlinks and window
 * titles) and the remaining two-byte escapes (`ESC (B`, `ESC =`, …).
 */
const ANSI_PATTERN = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b[ -/]*[0-~]/g;

/** Control characters other than tab and newline (bell, backspace, form feed…). */
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Remove ANSI escape sequences (colors, cursor movement, hyperlinks). */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

/**
 * Turn raw script output into plain text the way a terminal would show it:
 * escapes removed, CRLF normalized, and a lone carriage return (progress
 * bars) keeping only what was written after it on that line.
 */
export function terminalText(raw: string): string {
  return stripAnsi(raw)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const cr = line.lastIndexOf("\r");
      return cr === -1 ? line : line.slice(cr + 1);
    })
    .join("\n")
    .replace(CONTROL_PATTERN, "");
}

/** Very long output is trimmed from the start so the view stays responsive. */
export const MAX_RENDERED_CHARS = 512 * 1024;

export function visibleOutput(text: string, limit = MAX_RENDERED_CHARS): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  const start = text.indexOf("\n", text.length - limit);
  return { text: text.slice(start === -1 ? text.length - limit : start + 1), truncated: true };
}

/** "0.42s", "12.3s", "2m 05s". */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 10) return `${seconds.toFixed(2)}s`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(Math.floor(seconds % 60)).padStart(2, "0")}s`;
}

export type OutputPhase =
  | { kind: "starting" }
  | { kind: "running" }
  | { kind: "finished"; exitCode: number; durationMs?: number; error?: string; cancelled: boolean };

export type StatusTone = "muted" | "success" | "error";

/** Status line under the output: "Running System Uptime…", "Finished in 0.42s", "Failed with exit code 1 after 1.20s". */
export function outputStatus(phase: OutputPhase, title: string): { text: string; tone: StatusTone } {
  switch (phase.kind) {
    case "starting":
      return { text: "Starting…", tone: "muted" };
    case "running":
      return { text: `Running ${title}…`, tone: "muted" };
    case "finished": {
      const after = phase.durationMs === undefined ? "" : formatDuration(phase.durationMs);
      if (phase.cancelled) return { text: after ? `Stopped after ${after}` : "Stopped", tone: "muted" };
      if (phase.exitCode === 0 && !phase.error) return { text: after ? `Finished in ${after}` : "Finished", tone: "success" };
      const code = phase.exitCode < 0 ? "Failed" : `Failed with exit code ${phase.exitCode}`;
      return { text: after ? `${code} after ${after}` : code, tone: "error" };
    }
  }
}
