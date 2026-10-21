import { createHash } from "node:crypto";
import type { NativeApi } from "../native/client";

export interface SecretChange {
  account: string;
  deleted: boolean;
  valueHash: string | null;
  source: "local" | "sync";
}
interface SecretAccess {
  get(account: string, options?: { fresh?: boolean }): Promise<string | null>;
  set(account: string, value: string, source?: SecretChange["source"]): Promise<void>;
  delete(account: string, source?: SecretChange["source"]): Promise<void>;
}
export function secretHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

/**
 * API keys, OAuth tokens, the sync passphrase-derived key, extension password
 * preferences. Stored in the macOS Keychain (service "app.opencast") through
 * the native host; cached in memory for the life of the process.
 *
 * Account naming: "<area>:<id>[:<field>]", e.g. "ai.provider:openai:apiKey",
 * "sync:masterKey", "ext:<extensionName>:pref:<name>", "oauth:<extension>:<provider>".
 */
export class SecretsService {
  private readonly cache = new Map<string, string | null>();
  private readonly listeners = new Set<(change: SecretChange) => void>();
  private writes = Promise.resolve();

  constructor(private readonly native: NativeApi) {}

  private async read(account: string, options?: { fresh?: boolean }): Promise<string | null> {
    if (!options?.fresh && this.cache.has(account)) return this.cache.get(account) ?? null;
    let value: string | null;
    try { value = (await this.native.call("keychain.get", { account })) ?? null; }
    catch { throw new Error("Unable to read from Keychain"); }
    this.cache.set(account, value);
    return value;
  }

  private async write(account: string, value: string | null, source: SecretChange["source"]): Promise<void> {
    try {
      if (value === null) await this.native.call("keychain.delete", { account });
      else await this.native.call("keychain.set", { account, value });
    } catch { throw new Error("Unable to write to Keychain"); }
    this.cache.set(account, value);
    const change = { account, deleted: value === null, valueHash: value === null ? null : secretHash(value), source };
    for (const listener of this.listeners) listener(change);
  }

  /** Keep native writes and their metadata updates ordered, including across sync awaits. */
  withLock<T>(fn: (secrets: SecretAccess) => Promise<T>): Promise<T> {
    const next = this.writes.then(() => fn({
      get: (account, options) => this.read(account, options),
      set: (account, value, source = "local") => this.write(account, value, source),
      delete: (account, source = "local") => this.write(account, null, source),
    }));
    this.writes = next.then(() => {}, () => {});
    return next;
  }

  get(account: string): Promise<string | null> { return this.withLock(secrets => secrets.get(account)); }
  set(account: string, value: string): Promise<void> { return this.withLock(secrets => secrets.set(account, value)); }
  delete(account: string): Promise<void> { return this.withLock(secrets => secrets.delete(account)); }

  onChange(listener: (change: SecretChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async has(account: string): Promise<boolean> {
    return (await this.get(account)) !== null;
  }
}
