import { inflateRawSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
const MAX_COMPRESSED = 50 * 1024 * 1024;
const MAX_EXPANDED = 250 * 1024 * 1024;
const MAX_ENTRIES = 2000;
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function archiveEntries(zip: Buffer): { name: string; data: Buffer; directory: boolean }[] {
  if (zip.length > MAX_COMPRESSED) throw new Error("Extension archive exceeds 50 MiB");
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) if (zip.readUInt32LE(i) === 0x06054b50 && i + 22 + zip.readUInt16LE(i + 20) === zip.length) { end = i; break; }
  if (end < 0) throw new Error("Invalid ZIP end record");
  const count = zip.readUInt16LE(end + 10), offset = zip.readUInt32LE(end + 16), size = zip.readUInt32LE(end + 12);
  if (count > MAX_ENTRIES || zip.readUInt16LE(end + 4) || zip.readUInt16LE(end + 6) || zip.readUInt16LE(end + 8) !== count || offset + size > end) throw new Error("Unsupported or oversized ZIP archive");
  let cursor = offset; let total = 0;
  const paths = new Map<string, boolean>();
  const entries: { name: string; data: Buffer; directory: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > offset + size || zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid ZIP directory");
    const flags = zip.readUInt16LE(cursor + 8), method = zip.readUInt16LE(cursor + 10), checksum = zip.readUInt32LE(cursor + 16);
    const compressed = zip.readUInt32LE(cursor + 20), expanded = zip.readUInt32LE(cursor + 24), nameLength = zip.readUInt16LE(cursor + 28);
    const entryLength = 46 + nameLength + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
    if (cursor + entryLength > offset + size) throw new Error("Truncated ZIP directory entry");
    const rawName = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    const directory = rawName.endsWith("/"); const name = directory ? rawName.slice(0, -1) : rawName;
    if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[a-z]:/i.test(name) || name.split("/").some((x) => !x || x === ".." || x === ".")) throw new Error("Unsafe extension archive path");
    const unixMode = zip.readUInt32LE(cursor + 38) >>> 16;
    const type = unixMode & 0xf000;
    if (type && type !== 0x8000 && type !== 0x4000) throw new Error("Extension archive contains a symlink or special file");
    const normalized = name.normalize("NFC").toLowerCase();
    if (paths.has(normalized)) throw new Error("Duplicate extension archive path");
    paths.set(normalized, directory);
    const local = zip.readUInt32LE(cursor + 42);
    if (flags & 1 || (method !== 0 && method !== 8) || local + 30 > offset || zip.readUInt32LE(local) !== 0x04034b50) throw new Error("Unsupported ZIP entry");
    const localNameLength = zip.readUInt16LE(local + 26), extraLength = zip.readUInt16LE(local + 28);
    const start = local + 30 + localNameLength + extraLength;
    if (start + compressed > offset || zip.subarray(local + 30, local + 30 + localNameLength).toString("utf8") !== rawName) throw new Error("Invalid ZIP local entry");
    total += expanded; if (total > MAX_EXPANDED) throw new Error("Expanded archive exceeds 250 MiB");
    const encoded = zip.subarray(start, start + compressed);
    const data = method === 8 ? inflateRawSync(encoded, { maxOutputLength: Math.max(1, expanded) }) : Buffer.from(encoded);
    if (data.length !== expanded || crc32(data) !== checksum || (directory && data.length)) throw new Error("Corrupt ZIP entry");
    entries.push({ name, data, directory }); cursor += entryLength;
  }
  for (const key of paths.keys()) {
    const parts = key.split("/");
    for (let i = 1; i < parts.length; i++) if (paths.get(parts.slice(0, i).join("/")) === false) throw new Error("ZIP file overlaps a directory");
  }
  return entries;
}
export async function extractArchive(zip: Buffer, target: string): Promise<void> {
  const entries = archiveEntries(zip);
  for (const entry of entries) {
    const path = join(target, entry.name);
    await mkdir(entry.directory ? path : dirname(path), { recursive: true });
    if (!entry.directory) await writeFile(path, entry.data, { flag: "wx", mode: 0o600 });
  }
}
