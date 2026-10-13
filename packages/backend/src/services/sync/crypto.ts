import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomUUID, scrypt } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { SYNC_MAX_CIPHERTEXT_BYTES, type SyncVault, type SyncPushRecord, type SyncWireRecord } from "@opencast/protocol";

// These v1 wire constants are immutable so existing encrypted vaults remain readable.
export interface SyncPayload {
  v: 1;
  collection: string;
  id: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  data: unknown;
}
export interface VaultKeys { encKey: Buffer; ridKey: Buffer }
export const MAX_PLAINTEXT_BYTES = 16 * 1024 * 1024;
export function decode(value: unknown, length?: number, max = SYNC_MAX_CIPHERTEXT_BYTES): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > Math.ceil(max * 4 / 3)) throw new Error("Invalid encrypted sync data");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value || (length !== undefined && bytes.length !== length) || bytes.length > max) throw new Error("Invalid encrypted sync data");
  return bytes;
}
export function validateVault(value: unknown): SyncVault {
  const v = value as SyncVault;
  if (!v || typeof v.vaultId !== "string" || !v.vaultId.length || v.vaultId.length > 128 || /[\u0000-\u001f]/.test(v.vaultId) || !Number.isSafeInteger(v.keyEpoch) || v.keyEpoch < 1 ||
    v.kdf?.alg !== "scrypt" || v.kdf.N !== 131072 || v.kdf.r !== 8 || v.kdf.p !== 1) throw new Error("Unsupported sync vault format");
  decode(v.kdf.salt, 16); decode(v.wrapped?.nonce, 12); decode(v.wrapped?.ct, 48);
  return v;
}
async function wrappingKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  if (typeof passphrase !== "string" || !passphrase.length || passphrase.length > 4096) throw new Error("Passphrase must contain 1–4096 characters");
  return new Promise((resolve, reject) => scrypt(passphrase, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
function encrypt(key: Buffer, nonce: Buffer, bytes: Buffer, aad: string): string {
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(aad));
  return Buffer.concat([cipher.update(bytes), cipher.final(), cipher.getAuthTag()]).toString("base64url");
}
function decrypt(key: Buffer, nonce: Buffer, bytes: Buffer, aad: string): Buffer {
  if (bytes.length < 17) throw new Error("Invalid encrypted sync data");
  const cipher = createDecipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(aad));
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([cipher.update(bytes.subarray(0, -16)), cipher.final()]);
}
export async function wrapVault(passphrase: string, vmk: Buffer, vaultId: string = randomUUID(), keyEpoch = 1,
  salt = randomBytes(16), nonce = randomBytes(12)): Promise<SyncVault> {
  if (vmk.length !== 32 || salt.length !== 16 || nonce.length !== 12) throw new Error("Invalid vault key dimensions");
  const key = await wrappingKey(passphrase, salt);
  try {
    const vault: SyncVault = { vaultId, keyEpoch, kdf: { alg: "scrypt", N: 131072, r: 8, p: 1, salt: salt.toString("base64url") },
      wrapped: { nonce: nonce.toString("base64url"), ct: encrypt(key, nonce, vmk, `surgecast-vault-v1|${vaultId}|${keyEpoch}`) } };
    return validateVault(vault);
  } finally { key.fill(0); }
}
export async function createVault(passphrase: string): Promise<{ vault: SyncVault; vmk: Buffer }> {
  const vmk = randomBytes(32);
  try { return { vmk, vault: await wrapVault(passphrase, vmk) }; } catch (e) { vmk.fill(0); throw e; }
}
export async function unwrapVault(value: unknown, passphrase: string): Promise<Buffer> {
  const vault = validateVault(value);
  const key = await wrappingKey(passphrase, decode(vault.kdf.salt, 16));
  try { return decrypt(key, decode(vault.wrapped.nonce, 12), decode(vault.wrapped.ct, 48), `surgecast-vault-v1|${vault.vaultId}|${vault.keyEpoch}`); }
  catch { throw new Error("Wrong passphrase"); }
  finally { key.fill(0); }
}
export function deriveKeys(vmk: Buffer, vaultId: string): VaultKeys {
  if (vmk.length !== 32) throw new Error("Invalid vault master key");
  return { encKey: Buffer.from(hkdfSync("sha256", vmk, vaultId, "surgecast/record/v1", 32)),
    ridKey: Buffer.from(hkdfSync("sha256", vmk, vaultId, "surgecast/rid/v1", 32)) };
}
export function recordId(keys: VaultKeys, collection: string, id: string): string {
  return createHmac("sha256", keys.ridKey).update(collection + "\u0000" + id).digest("base64url");
}
function validatePayload(p: SyncPayload): void {
  if (!p || p.v !== 1 || typeof p.collection !== "string" || !p.collection || p.collection.length > 256 || p.collection.includes("\0") ||
    typeof p.id !== "string" || !p.id || p.id.length > 1024 || p.id.includes("\0") || typeof p.deleted !== "boolean" ||
    !Number.isSafeInteger(p.createdAt) || p.createdAt < 0 || !Number.isSafeInteger(p.updatedAt) || p.updatedAt < p.createdAt || p.data === undefined) throw new Error("Invalid decrypted sync record");
}
export function encryptRecord(keys: VaultKeys, vault: Pick<SyncVault, "vaultId" | "keyEpoch">, payload: SyncPayload,
  baseSeq: number | null, nonce = randomBytes(12)): SyncPushRecord {
  validatePayload(payload);
  if (nonce.length !== 12) throw new Error("Invalid record nonce");
  const bytes = Buffer.from(JSON.stringify(payload));
  if (bytes.length > MAX_PLAINTEXT_BYTES) throw new Error("Sync record exceeds 16 MiB plaintext limit");
  const encoded = Buffer.concat([Buffer.from([bytes.length > 1024 ? 1 : 0]), bytes.length > 1024 ? gzipSync(bytes) : bytes]);
  const rid = recordId(keys, payload.collection, payload.id);
  const ct = encrypt(keys.encKey, nonce, encoded, `surgecast-record-v1|${vault.vaultId}|${rid}|${vault.keyEpoch}`);
  if (Buffer.byteLength(ct, "base64url") > SYNC_MAX_CIPHERTEXT_BYTES) throw new Error("Sync record exceeds 1 MiB ciphertext limit");
  return { rid, baseSeq, deleted: payload.deleted, nonce: nonce.toString("base64url"), ct, keyEpoch: vault.keyEpoch };
}
export function decryptRecord(keys: VaultKeys, vault: Pick<SyncVault, "vaultId" | "keyEpoch">, record: SyncWireRecord): SyncPayload {
  decode(record.rid, 32);
  if (record.keyEpoch !== vault.keyEpoch || !Number.isSafeInteger(record.seq) || record.seq < 1) throw new Error("Sync record uses an unsupported epoch or sequence");
  const bytes = decrypt(keys.encKey, decode(record.nonce, 12), decode(record.ct), `surgecast-record-v1|${vault.vaultId}|${record.rid}|${record.keyEpoch}`);
  if (bytes[0] !== 0 && bytes[0] !== 1) throw new Error("Unsupported sync compression flag");
  const decoded = bytes[0] === 1 ? gunzipSync(bytes.subarray(1), { maxOutputLength: MAX_PLAINTEXT_BYTES }) : bytes.subarray(1);
  const p = JSON.parse(decoded.toString("utf8")) as SyncPayload;
  validatePayload(p);
  if (recordId(keys, p.collection, p.id) !== record.rid || p.deleted !== record.deleted) throw new Error("Sync record identity or deletion flag does not match");
  return p;
}
