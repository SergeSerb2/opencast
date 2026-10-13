import { describe, expect, it } from "vitest";
import { deriveKeys, recordId, encryptRecord, decryptRecord, wrapVault, unwrapVault, validateVault, type SyncPayload } from "../../src/services/sync/crypto";

const vmk = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const vault = { vaultId: "test-vault", keyEpoch: 1 };
const keys = deriveKeys(vmk, vault.vaultId);
const payload: SyncPayload = { v: 1, collection: "notes", id: "note-1", createdAt: 100, updatedAt: 200, deleted: false, data: { title: "Hello", text: "World" } };
describe("sync crypto", () => {
  it("matches fixed HKDF, HMAC and AES-GCM vectors", () => {
    expect(keys.encKey.toString("hex")).toBe("e0396eba08625059a5e8cdf8c0b73fac6f0fe182e6c315d70bad6a4077de24cc");
    expect(keys.ridKey.toString("hex")).toBe("a3d3c45947d7aaa8ed9a150eae6486e2ddbd6dec3623347c9d3e0928fd9b9603");
    expect(recordId(keys, "notes", "note-1")).toBe("aeYIBAzTR_gJG8OWu17lT5lfOWBbY1shQEWGfndwW24");
    const record = encryptRecord(keys, vault, payload, null, Buffer.alloc(12, 2));
    expect(record.ct).toBe("SfIWUOY4fb06NFnpulbJTdtdzHn3I8W1XEoWpYKxfHQuLljWzTLHLcW1Y3U_GRRvZp2IFAH2UAoIKy3V6bH7jD0HfTvI5WPRdMdyGLQ_ImStxnPXOiDw9xptwEau2nBgHn2gTuSC_J4siPqUh0hLi7EyFBL-G0bErIZAJXtCiSIO4z7itR3gGPSrxPdK26KPbLpA");
    expect(decryptRecord(keys, vault, { ...record, seq: 1 })).toEqual(payload);
  });
  it("wraps a VMK using a fixed scrypt/AES-GCM vector and rejects wrong passwords", async () => {
    const wrapped = await wrapVault("test passphrase", vmk, vault.vaultId, 1, Buffer.alloc(16, 3), Buffer.alloc(12, 4));
    expect(wrapped.wrapped.ct).toBe("LzgXN28YZy8OW_ppx2IFYR0FwixZrP8S4IZWVHma1NX15YX-aDcgE8OU9juP5r6S");
    expect(await unwrapVault(wrapped, "test passphrase")).toEqual(vmk);
    await expect(unwrapVault(wrapped, "wrong")).rejects.toThrow("Wrong passphrase");
    await expect(unwrapVault({ ...wrapped, vaultId: "different" }, "test passphrase")).rejects.toThrow("Wrong passphrase");
    expect(() => validateVault({ ...wrapped, kdf: { ...wrapped.kdf, N: 2 ** 30 } })).toThrow("Unsupported");
  });
  it("compresses large Unicode payloads and authenticates context and ciphertext", () => {
    const p = { ...payload, data: { text: "世界🦄".repeat(1000) } };
    const a = encryptRecord(keys, vault, p, null), b = encryptRecord(keys, vault, p, null);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ct.length).toBeLessThan(1024);
    expect(decryptRecord(keys, vault, { ...a, seq: 2 })).toEqual(p);
    const bad = Buffer.from(a.ct, "base64url"); bad[0] ^= 1;
    for (const changes of [{ ct: bad.toString("base64url") }, { nonce: Buffer.alloc(12, 9).toString("base64url") },
      { rid: Buffer.alloc(32, 9).toString("base64url") }, { deleted: true }, { keyEpoch: 2 }]) {
      expect(() => decryptRecord(keys, vault, { ...a, seq: 2, ...changes })).toThrow();
    }
    expect(() => decryptRecord(keys, { ...vault, vaultId: "other" }, { ...a, seq: 2 })).toThrow();
    expect(() => encryptRecord(keys, vault, { ...payload, id: "bad\0id" }, null)).toThrow();
  });
});
