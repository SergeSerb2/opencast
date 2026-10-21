import { SYNC_MAX_CIPHERTEXT_BYTES, type SyncPushRecord, type SyncVault } from "./sync";

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export function invalid(message: string): never { throw new HttpError(400, "invalid_request", message); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Expected a JSON object");
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, max = 256): string {
  if (typeof value !== "string" || !value.length || value.length > max || /[\u0000-\u001f]/.test(value)) invalid(`Invalid ${name}`);
  return value;
}
export function integer(value: unknown, name: string, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) invalid(`Invalid ${name}`);
  return value;
}
export function binary(value: unknown, name: string, min: number, max = min): string {
  if (typeof value === "string" && value.length > Math.ceil(max * 4 / 3)) throw new HttpError(413, "too_large", `${name} exceeds its size limit`);
  const s = text(value, name, Math.ceil(max * 4 / 3));
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) invalid(`Invalid ${name}`);
  let decoded: string;
  try { decoded = atob(s.replace(/-/g, "+").replace(/_/g, "/")); } catch { invalid(`Invalid ${name}`); }
  if (decoded.length < min || decoded.length > max || btoa(decoded).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_") !== s) invalid(`Invalid ${name}`);
  return s;
}
export function vault(value: unknown): SyncVault {
  const v = object(value), k = object(v.kdf), w = object(v.wrapped);
  if (k.alg !== "scrypt" || k.N !== 131072 || k.r !== 8 || k.p !== 1) invalid("Unsupported KDF parameters");
  return { vaultId: text(v.vaultId, "vaultId", 128), keyEpoch: integer(v.keyEpoch, "keyEpoch", 1),
    kdf: { alg: "scrypt", N: 131072, r: 8, p: 1, salt: binary(k.salt, "salt", 16) },
    wrapped: { nonce: binary(w.nonce, "nonce", 12), ct: binary(w.ct, "wrapped ciphertext", 48) } };
}
export function pushRecord(value: unknown): SyncPushRecord {
  const r = object(value);
  if (typeof r.deleted !== "boolean") invalid("Invalid deleted flag");
  return { rid: binary(r.rid, "rid", 32), baseSeq: r.baseSeq === null ? null : integer(r.baseSeq, "baseSeq", 1), deleted: r.deleted,
    nonce: binary(r.nonce, "nonce", 12), ct: binary(r.ct, "ciphertext", 17, SYNC_MAX_CIPHERTEXT_BYTES), keyEpoch: integer(r.keyEpoch, "keyEpoch", 1) };
}
