import { SYNC_MAX_REQUEST_BYTES } from "@opencast/protocol";

export const SYNC_CONNECTION_MESSAGES = {
  dns: "Could not find the sync server. Check the server URL.",
  tls: "Could not make a secure connection to the sync server. Check its HTTPS certificate.",
  timeout: "The sync server took too long to respond. Try again.",
  unreachable: "Sync server is unreachable",
  notServer: "That server is not an OpenCast sync server",
  malformedVault: "The vault on this server is not readable by this version of OpenCast",
  unconfigured: "Set the SYNC_TOKEN secret on your Worker before connecting.",
  joinMissing: "No vault exists for that token. Check the server URL and token.",
  createExists: "A vault already exists for that token. Join it instead.",
  shortPassphrase: "Use at least 12 characters for a new vault passphrase",
} as const;

export class SyncHttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    const message = ({ device_revoked: "This device was removed. Reconnect to register it again.", unauthorized: "Invalid sync server token",
      vault_changed: "Remote vault changed; reconnect with the passphrase", vault_not_found: "Remote vault was removed; reconnect with the passphrase",
      record_missing: "A remote record expired; retrying from the beginning", events_unavailable: "Server uses polling only" } as Record<string, string>)[code];
    super(status === 401 ? "Invalid sync server token" : message ?? `Sync server request failed (${status})`);
  }
}
export class SyncNetworkError extends Error {
  constructor(cause?: unknown) {
    const codes: string[] = [];
    const inspect = (value: unknown, depth = 0): void => {
      if (!value || typeof value !== "object" || depth > 5) return;
      const error = value as { name?: string; code?: string; cause?: unknown; errors?: unknown[] };
      if (error.code) codes.push(error.code);
      if (error.name) codes.push(error.name);
      inspect(error.cause, depth + 1);
      if (Array.isArray(error.errors)) for (const nested of error.errors) inspect(nested, depth + 1);
    };
    inspect(cause);
    super(codes.some(code => ["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL"].includes(code)) ? SYNC_CONNECTION_MESSAGES.dns
      : codes.some(code => /TLS|SSL|CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)) ? SYNC_CONNECTION_MESSAGES.tls
      : codes.some(code => /TIMEOUT|TIMEDOUT|TimeoutError/.test(code)) ? SYNC_CONNECTION_MESSAGES.timeout
      : SYNC_CONNECTION_MESSAGES.unreachable);
  }
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
    return { Authorization: `Bearer ${this.token}`, "X-OpenCast-Device": this.deviceId, "X-Surgecast-Device": this.deviceId, ...extra };
  }
  async request<T>(path: string, method = "GET", data?: unknown, extra?: Record<string, string>): Promise<T> {
    const response = await fetch(this.serverUrl + path, { method, headers: this.headers({ "Content-Type": "application/json", ...extra }),
      body: data === undefined ? undefined : JSON.stringify(data), redirect: "error", signal: AbortSignal.any([this.signal, AbortSignal.timeout(30000)]) }).catch(error => { throw new SyncNetworkError(error); });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read().catch(error => { throw new SyncNetworkError(error); });
          if (done) break;
          length += value.byteLength;
          if (length > SYNC_MAX_REQUEST_BYTES * 2) { await reader.cancel(); throw new Error("Sync server response exceeds 8 MiB"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    let parsed: unknown;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch {
      if (!response.ok) throw new SyncHttpError(response.status, "request_failed");
      throw new Error("Invalid JSON from sync server");
    }
    if (!response.ok) {
      const code = (parsed as { error?: unknown })?.error;
      throw new SyncHttpError(response.status, typeof code === "string" ? code : "request_failed");
    }
    return parsed as T;
  }
}
