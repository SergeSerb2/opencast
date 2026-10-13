import { SYNC_MAX_REQUEST_BYTES } from "@surgecast/protocol";

export class SyncHttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    const message = ({ device_revoked: "This device was removed. Reconnect to register it again.", unauthorized: "Invalid sync server token",
      vault_changed: "Remote vault changed; reconnect with the passphrase", vault_not_found: "Remote vault was removed; reconnect with the passphrase",
      record_missing: "A remote record expired; retrying from the beginning", events_unavailable: "Server uses polling only" } as Record<string, string>)[code];
    super(message ?? `Sync server request failed (${status})`);
  }
}
export class SyncNetworkError extends Error {
  constructor() { super("Sync server is unreachable"); }
}
export function normalizeServerUrl(input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Invalid sync server URL"); }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))))
    throw new Error("Sync requires HTTPS (HTTP is allowed only for localhost development)");
  return url.toString().replace(/\/+$/, "");
}
export class SyncHttp {
  constructor(readonly serverUrl: string, private readonly token: string, readonly deviceId: string, private readonly signal: AbortSignal) {}
  headers(extra?: Record<string, string>): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, "X-Surgecast-Device": this.deviceId, ...extra };
  }
  async request<T>(path: string, method = "GET", data?: unknown, extra?: Record<string, string>): Promise<T> {
    const response = await fetch(this.serverUrl + path, { method, headers: this.headers({ "Content-Type": "application/json", ...extra }),
      body: data === undefined ? undefined : JSON.stringify(data), redirect: "error", signal: AbortSignal.any([this.signal, AbortSignal.timeout(30000)]) }).catch(() => { throw new SyncNetworkError(); });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read().catch(() => { throw new SyncNetworkError(); });
          if (done) break;
          length += value.byteLength;
          if (length > SYNC_MAX_REQUEST_BYTES * 2) { await reader.cancel(); throw new Error("Sync server response exceeds 8 MiB"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    let parsed: unknown;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("Invalid JSON from sync server"); }
    if (!response.ok) {
      const code = (parsed as { error?: unknown })?.error;
      throw new SyncHttpError(response.status, typeof code === "string" ? code : "request_failed");
    }
    return parsed as T;
  }
}
