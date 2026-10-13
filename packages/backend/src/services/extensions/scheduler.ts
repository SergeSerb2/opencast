import type { AppContext } from "../../context";
import { parseInterval } from "./manifest";
interface Job { interval: number; due: number; run(): Promise<void>; }
/** One job per command, no overlap, bounded concurrency, no sleep catch-up burst. */
export class ExtensionScheduler {
  private readonly jobs = new Map<string, Job>();
  private readonly running = new Set<string>();
  private sleeping = false;
  private stopped = false;
  private readonly timer: NodeJS.Timeout;
  constructor(ctx: AppContext) {
    ctx.native.on("system.willSleep", () => { this.sleeping = true; });
    ctx.native.on("system.didWake", () => { this.sleeping = false; for (const job of this.jobs.values()) job.due = Date.now() + job.interval; });
    this.timer = setInterval(() => this.tick(), 1000); this.timer.unref();
  }
  reconcile(entries: { id: string; interval?: string; run(): Promise<void> }[]): void {
    const current = new Set<string>();
    for (const entry of entries) {
      const interval = parseInterval(entry.interval); if (!interval) continue;
      current.add(entry.id); const existing = this.jobs.get(entry.id);
      this.jobs.set(entry.id, { interval, due: existing?.interval === interval ? existing.due : Date.now() + interval, run: entry.run });
    }
    for (const id of this.jobs.keys()) if (!current.has(id)) this.jobs.delete(id);
  }
  stop(): void { this.stopped = true; clearInterval(this.timer); this.jobs.clear(); }
  tick(now = Date.now()): void {
    if (this.sleeping || this.stopped) return;
    for (const [id, job] of this.jobs) {
      if (this.running.size >= 8) break;
      if (this.running.has(id) || job.due > now) continue;
      this.running.add(id); job.due = now + job.interval;
      void job.run().catch(() => { job.due = Date.now() + Math.min(job.interval, 60000); }).finally(() => this.running.delete(id));
    }
  }
}
