import type { NativeApi } from "../native/client";

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

  constructor(private readonly native: NativeApi) {}

  async get(account: string): Promise<string | null> {
    if (this.cache.has(account)) return this.cache.get(account) ?? null;
    const value = (await this.native.call("keychain.get", { account })) ?? null;
    this.cache.set(account, value);
    return value;
  }

  async set(account: string, value: string): Promise<void> {
    await this.native.call("keychain.set", { account, value });
    this.cache.set(account, value);
  }

  async delete(account: string): Promise<void> {
    await this.native.call("keychain.delete", { account });
    this.cache.set(account, null);
  }

  async has(account: string): Promise<boolean> {
    return (await this.get(account)) !== null;
  }
}
