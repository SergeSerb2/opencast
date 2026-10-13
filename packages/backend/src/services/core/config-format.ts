import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
} from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { RpcError } from "../../util/errors";
const derive = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      32,
      { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
const MAX_OUTPUT = 64 * 1024 * 1024;
export const OPENCAST_MAGIC = Buffer.from("OPENCFG1\n");
const LEGACY_MAGIC = Buffer.from("SURGECFG1\n");
export const RAY_MAGIC = Buffer.from("RAYCFG3\n");
interface Encryption {
  salt: string;
  iv: string;
  authTag?: string;
}
interface Header {
  schemaVersion: number;
  encryption?: Encryption;
  [key: string]: unknown;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw RpcError.invalidParams("Configuration payload must be an object");
  return value as Record<string, unknown>;
}
function json(bytes: Buffer): Record<string, unknown> {
  try {
    return object(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw RpcError.invalidParams("Invalid configuration JSON");
  }
}
function unzip(bytes: Buffer): Buffer {
  try {
    return gunzipSync(bytes, { maxOutputLength: MAX_OUTPUT });
  } catch {
    throw RpcError.invalidParams(
      "Invalid or oversized compressed configuration",
    );
  }
}
function hex(value: string, lengths: number[]): Buffer {
  if (
    typeof value !== "string" ||
    !/^[a-f\d]+$/i.test(value) ||
    !lengths.includes(value.length / 2)
  )
    throw RpcError.invalidParams("Invalid encryption parameters");
  return Buffer.from(value, "hex");
}
async function key(
  password: string | undefined,
  encryption: Encryption,
): Promise<Buffer> {
  if (!password)
    throw RpcError.invalidParams("This configuration requires a password");
  return await derive(password, hex(encryption.salt, [16]));
}
async function decrypt(
  payload: Buffer,
  encryption: Encryption,
  password?: string,
  aad?: Buffer,
  separateTag?: Buffer,
): Promise<Buffer> {
  const secret = await key(password, encryption);
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      secret,
      hex(encryption.iv, [12, 16]),
    );
    if (aad) decipher.setAAD(aad);
    const tag = separateTag ?? payload.subarray(-16);
    if (tag.length !== 16)
      throw RpcError.invalidParams("Invalid authentication tag");
    decipher.setAuthTag(tag);
    const ciphertext = separateTag ? payload : payload.subarray(0, -16);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw RpcError.invalidParams("Incorrect password or damaged configuration");
  } finally {
    secret.fill(0);
  }
}
export async function encodeConfig(
  payload: Record<string, unknown>,
  password?: string,
): Promise<Buffer> {
  const header: Header = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: "OpenCast",
  };
  if (password)
    header.encryption = {
      salt: randomBytes(16).toString("hex"),
      iv: randomBytes(16).toString("hex"),
    };
  const bytes = gzipSync(Buffer.from(JSON.stringify(header)));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  const prefix = Buffer.concat([OPENCAST_MAGIC, length, bytes]);
  const plaintext = Buffer.from(JSON.stringify(payload));
  if (plaintext.length > MAX_OUTPUT)
    throw RpcError.invalidParams(
      "Configuration exceeds the 64 MiB import/export limit",
    );
  let data = gzipSync(plaintext);
  if (header.encryption) {
    const secret = await key(password, header.encryption);
    try {
      const cipher = createCipheriv(
        "aes-256-gcm",
        secret,
        Buffer.from(header.encryption.iv, "hex"),
      );
      cipher.setAAD(prefix);
      data = Buffer.concat([
        cipher.update(data),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
    } finally {
      secret.fill(0);
    }
  }
  return Buffer.concat([prefix, data]);
}
export async function decodeConfig(
  bytes: Buffer,
  password?: string,
  requireOpenCast = false,
): Promise<{
  family: "opencast" | "ray-v3" | "ray-wrapper" | "ray-classic";
  payload: Record<string, unknown>;
}> {
  if (bytes.length > MAX_OUTPUT || bytes.length < 2)
    throw RpcError.invalidParams("Configuration file is empty or too large");
  const legacy = bytes.subarray(0, LEGACY_MAGIC.length).equals(LEGACY_MAGIC);
  const opencast = legacy || bytes.subarray(0, OPENCAST_MAGIC.length).equals(OPENCAST_MAGIC);
  const ray = bytes.subarray(0, RAY_MAGIC.length).equals(RAY_MAGIC);
  if (requireOpenCast && !opencast)
    throw RpcError.invalidParams("Expected an OpenCast configuration");
  if (opencast || ray) {
    const magic = legacy ? LEGACY_MAGIC : opencast ? OPENCAST_MAGIC : RAY_MAGIC;
    const prefixSize = magic.length + 4;
    if (bytes.length < prefixSize)
      throw RpcError.invalidParams("Truncated configuration header");
    const length = bytes.readUInt32LE(magic.length);
    if (length < 1 || length > 1048576 || prefixSize + length >= bytes.length)
      throw RpcError.invalidParams("Invalid configuration header length");
    const header = json(
      unzip(bytes.subarray(prefixSize, prefixSize + length)),
    ) as unknown as Header;
    if (header.schemaVersion !== (opencast ? 1 : 3))
      throw RpcError.invalidParams("Unsupported configuration schema version");
    let data = bytes.subarray(prefixSize + length);
    if (header.encryption)
      data = await decrypt(
        data,
        header.encryption,
        password,
        opencast ? bytes.subarray(0, prefixSize + length) : undefined,
      );
    return { family: opencast ? "opencast" : "ray-v3", payload: json(unzip(data)) };
  }
  let plaintext: Buffer;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) plaintext = unzip(bytes);
  else {
    if (!password)
      throw RpcError.invalidParams("This configuration requires a password");
    if (bytes.length < 32 || (bytes.length - 16) % 16 !== 0)
      throw RpcError.invalidParams("Invalid classic configuration");
    const secret = createHash("sha256").update(password).digest();
    try {
      const cipher = createDecipheriv(
        "aes-256-cbc",
        secret,
        bytes.subarray(0, 16),
      );
      plaintext = unzip(
        Buffer.concat([cipher.update(bytes.subarray(16)), cipher.final()]),
      );
    } catch {
      throw RpcError.invalidParams(
        "Incorrect password or damaged classic configuration",
      );
    } finally {
      secret.fill(0);
    }
  }
  const outer = json(plaintext);
  if (typeof outer.data === "string" && "schemaVersion" in outer) {
    if (
      ![1, 2, 3].includes(outer.schemaVersion as number) ||
      !/^(?:[a-f\d]{2})*$/i.test(outer.data)
    )
      throw RpcError.invalidParams("Invalid native configuration wrapper");
    let data: Buffer = Buffer.from(outer.data, "hex");
    if (outer.encryption) {
      const encryption = outer.encryption as Encryption;
      const tag = hex(encryption.authTag!, [16]);
      data = await decrypt(data, encryption, password, undefined, tag);
    }
    return {
      family: "ray-wrapper",
      payload: json(Number(outer.schemaVersion) >= 2 ? unzip(data) : data),
    };
  }
  return { family: "ray-classic", payload: outer };
}
