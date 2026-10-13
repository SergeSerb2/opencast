import type { BackendEvents } from "@opencast/protocol";
import { backend, type BackendClient } from "../../../bridge/backend";

export type ScriptCompletion = BackendEvents["scripts.completed"];

/** Everything received for one execution so far (immutable snapshot). */
export interface ScriptExecution {
  output: string;
  completion?: ScriptCompletion;
}

/** Executions kept without a viewer (inline scripts refresh in the background too). */
const MAX_UNWATCHED = 16;

/**
 * Buffers `scripts.output` / `scripts.completed` by execution id. The backend
 * starts streaming right after `commands.launch` / `scripts.start` return,
 * before the output view has mounted and subscribed, so chunks are collected
 * from the moment the launcher boots.
 */
export class ScriptExecutionStore {
  private executions = new Map<string, ScriptExecution>();
  private listeners = new Map<string, Set<() => void>>();

  get(executionId: string): ScriptExecution | undefined {
    return this.executions.get(executionId);
  }

  subscribe(executionId: string, listener: () => void): () => void {
    let set = this.listeners.get(executionId);
    if (!set) this.listeners.set(executionId, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(executionId);
    };
  }

  append(executionId: string, chunk: string): void {
    const current = this.executions.get(executionId);
    this.update(executionId, { output: (current?.output ?? "") + chunk, completion: current?.completion });
  }

  complete(event: ScriptCompletion): void {
    const current = this.executions.get(event.executionId);
    this.update(event.executionId, { output: current?.output ?? "", completion: event });
  }

  /** Listen to a backend's script events; returns the unsubscribe function. */
  attach(source: Pick<BackendClient, "on">): () => void {
    const offs = [source.on("scripts.output", ({ executionId, chunk }) => this.append(executionId, chunk)), source.on("scripts.completed", (event) => this.complete(event))];
    return () => offs.forEach((off) => off());
  }

  private update(executionId: string, next: ScriptExecution): void {
    // Re-insert so Map order doubles as recency for eviction.
    this.executions.delete(executionId);
    this.executions.set(executionId, next);
    this.evict();
    this.listeners.get(executionId)?.forEach((listener) => listener());
  }

  private evict(): void {
    const unwatched = [...this.executions.keys()].filter((id) => !this.listeners.has(id));
    for (const id of unwatched.slice(0, Math.max(0, unwatched.length - MAX_UNWATCHED))) this.executions.delete(id);
  }
}

export const scriptExecutions = new ScriptExecutionStore();

let tracking = false;

/** Start buffering script output for this page (idempotent). */
export function trackScriptExecutions(): void {
  if (tracking) return;
  tracking = true;
  scriptExecutions.attach(backend);
}

/** How long launch arguments stay attributable to the output view the launch opens. */
const LAUNCH_WINDOW_MS = 10_000;
const launchArguments = new Map<string, { values: string[]; at: number }>();

/**
 * Record the argument values of a launch from Search Script Commands. The
 * output view it opens reads them for "Run Again": the backend's view props
 * only carry the execution id and path.
 */
export function rememberLaunchArguments(path: string, values: string[], now = Date.now()): void {
  launchArguments.set(path, { values, at: now });
}

/** Values of a launch of `path` in the last few seconds, if any. */
export function recentLaunchArguments(path: string, now = Date.now()): string[] | undefined {
  const entry = launchArguments.get(path);
  return entry && now - entry.at <= LAUNCH_WINDOW_MS ? entry.values : undefined;
}
