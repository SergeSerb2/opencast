import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { AppContext } from "../../context";
import { expandPath } from "./shared";
const MANAGED = /^surgecast-backup-\d{4}-\d{2}-\d{2}T[\d-]+Z\.surgeconfig$/;
const INTERVAL = { daily: 86400000, weekly: 7 * 86400000, monthly: 30 * 86400000 };
/** Only prune our own completed exports, after the new encrypted backup is durable. */
export class ScheduledBackup {
  private pending?: Promise<void>;
  private stopped = false;
  private timer: NodeJS.Timeout;
  constructor(private ctx: AppContext, private exportData: (ctx: AppContext, params: { path: string; password: string }) => Promise<unknown>) {
    this.timer = setInterval(() => void this.tick(), 60000);
    this.timer.unref();
  }
  tick(now = Date.now()): Promise<void> {
    if (this.stopped) return Promise.resolve();
    return this.pending ??= this.run(now).finally(() => { this.pending = undefined; });
  }
  private async run(now: number): Promise<void> {
    try {
      const { settings, secrets, native } = this.ctx;
      const frequency = settings.get("advanced.backupFrequency"), location = settings.get("advanced.backupLocation");
      if (frequency === "never" || !location) return;
      const directory = expandPath(location);
      const files = await readdir(directory).catch(() => []);
      const backups = (await Promise.all(files.filter(f => MANAGED.test(f)).map(async name => ({ name, time: (await stat(join(directory, name))).mtimeMs })))).sort((a, b) => b.time - a.time);
      if (backups[0] && now - backups[0].time < INTERVAL[frequency]) return;
      if (settings.get("advanced.backupSkipOnBattery") && await native.call("system.onBattery", undefined)) return;
      const password = await secrets.get("data.backup:passphrase");
      if (!password || this.stopped) return;
      await mkdir(directory, { recursive: true });
      const name = `surgecast-backup-${new Date(now).toISOString().replace(/[:.]/g, "-")}.surgeconfig`;
      await this.exportData(this.ctx, { path: join(directory, name), password });
      const keep = settings.get("advanced.backupAutoDelete");
      if (keep !== "never") for (const backup of backups.slice(keep - 1)) await unlink(join(directory, backup.name));
    } catch {
      // Export and Keychain errors can carry secret parameters. Never log them.
      this.ctx.log.warn("Scheduled backup failed");
    }
  }
  async stop(): Promise<void> { this.stopped = true; clearInterval(this.timer); await this.pending; }
}
