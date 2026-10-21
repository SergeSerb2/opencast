import { normalizeServerUrl } from "./http";

const PREFIX = "opencast-sync-v1:";
const MAX_PAYLOAD_BYTES = 8 * 1024;
const INVALID_CODE = "Invalid setup code. Copy it again from your other Mac or the deploy script.";

export function validateSyncToken(token: unknown): asserts token is string {
  if (typeof token !== "string" || !token.length || token.length > 4096 || /[\r\n]/.test(token)) throw new Error("A valid sync server token is required");
}

/** The setup code contains server credentials only, never the passphrase or vault key. */
export function encodeSetupCode(serverUrl: string, token: string): string {
  validateSyncToken(token);
  const payload = Buffer.from(JSON.stringify({ url: normalizeServerUrl(serverUrl), token }), "utf8");
  if (payload.length > MAX_PAYLOAD_BYTES) throw new Error("Setup code exceeds 8 KiB");
  return PREFIX + payload.toString("base64url");
}

export function decodeSetupCode(code: string): { serverUrl: string; token: string } {
  if (typeof code !== "string") throw new Error(INVALID_CODE);
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error(INVALID_CODE);
  const encoded = trimmed.slice(PREFIX.length);
  if (encoded.length > Math.ceil(MAX_PAYLOAD_BYTES * 4 / 3)) throw new Error("Setup code exceeds 8 KiB");
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error(INVALID_CODE);
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.length > MAX_PAYLOAD_BYTES) throw new Error("Setup code exceeds 8 KiB");
  if (bytes.toString("base64url") !== encoded) throw new Error(INVALID_CODE);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error(INVALID_CODE); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(INVALID_CODE);
  const { url, token } = value as Record<string, unknown>;
  if (typeof url !== "string") throw new Error(INVALID_CODE);
  validateSyncToken(token);
  return { serverUrl: normalizeServerUrl(url), token };
}
