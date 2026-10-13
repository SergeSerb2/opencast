import type { CommandInfo, CommandPrefs, LaunchResult } from "@opencast/protocol";
import type { CommandProvider, CommandRegistry, LaunchRequest } from "../context";
import type { EntityStore } from "../db/entities";
import type { EventBus } from "../events";
import { RpcError } from "../util/errors";
import { createLogger } from "../util/log";

const log = createLogger("commands");

/**
 * Merges the command lists of all providers, applies user prefs
 * (alias, hotkey, favorite, enabled) from the "commandPrefs" collection,
 * caches per provider, and routes launches back to the owning provider.
 */
export class DefaultCommandRegistry implements CommandRegistry {
  private readonly providers = new Map<string, CommandProvider>();
  private readonly generations = new Map<string, number>();
  private readonly cache = new Map<string, CommandInfo[]>();
  private readonly owner = new Map<string, string>();

  constructor(
    private readonly entities: EntityStore,
    private readonly events: EventBus,
  ) {
    entities.onChange((change) => {
      if (change.collection === "commandPrefs") this.events.emit("commands.changed", { reason: "prefs" });
    });
  }

  registerProvider(provider: CommandProvider): void {
    if (this.providers.has(provider.id)) throw new Error(`Command provider registered twice: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }

  invalidate(providerId?: string): void {
    for (const id of providerId ? [providerId] : this.providers.keys()) {
      this.cache.delete(id);
      this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
    }
    this.events.emit("commands.changed", { reason: providerId ?? "all" });
  }

  async all(options?: { includeDisabled?: boolean }): Promise<CommandInfo[]> {
    const prefs = new Map(this.entities.list<CommandPrefs>("commandPrefs").map((r) => [r.id, r.data]));
    const out: CommandInfo[] = [];
    for (const provider of this.providers.values()) {
      for (const cmd of await this.listProvider(provider)) {
        const merged = applyPrefs(cmd, prefs.get(cmd.id) ?? (cmd.id === "builtin:core.copyOpenCastVersion"
          ? prefs.get("builtin:core.copySurgecastVersion") : undefined));
        if (merged.enabled || options?.includeDisabled) out.push(merged);
      }
    }
    return out;
  }

  async get(id: string): Promise<CommandInfo | undefined> {
    const all = await this.all({ includeDisabled: true });
    return all.find((c) => c.id === id);
  }

  async launch(id: string, request: LaunchRequest): Promise<LaunchResult> {
    if (!this.owner.has(id)) await this.all({ includeDisabled: true });
    const providerId = this.owner.get(id);
    const provider = providerId ? this.providers.get(providerId) : undefined;
    const command = await this.get(id);
    if (!provider || !command) throw RpcError.notFound(`Command ${id}`);
    try {
      return await provider.launch(command, request);
    } catch (error) {
      log.error(`launch ${id} failed`, error);
      if (error instanceof RpcError) throw error;
      return { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  private async listProvider(provider: CommandProvider): Promise<CommandInfo[]> {
    while (true) {
      let list = this.cache.get(provider.id);
      if (list) return list;
      const generation = this.generations.get(provider.id) ?? 0;
      try {
        list = await provider.list();
      } catch (error) {
        log.error(`provider ${provider.id} failed to list commands`, error);
        list = [];
      }
      if (generation !== (this.generations.get(provider.id) ?? 0)) continue;
      this.cache.set(provider.id, list);
      for (const [id, owner] of this.owner) if (owner === provider.id) this.owner.delete(id);
      for (const cmd of list) this.owner.set(cmd.id, provider.id);
      return list;
    }
  }
}

function applyPrefs(cmd: CommandInfo, prefs: CommandPrefs | undefined): CommandInfo {
  if (!prefs) return cmd;
  return {
    ...cmd,
    alias: prefs.alias ?? cmd.alias,
    hotkey: prefs.hotkey ?? cmd.hotkey,
    favorite: prefs.favoriteOrder !== undefined ? true : cmd.favorite,
    enabled: prefs.enabled ?? cmd.enabled,
  };
}
