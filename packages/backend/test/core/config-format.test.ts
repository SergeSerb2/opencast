import {
  createCipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  decodeConfig,
  encodeConfig,
  RAY_MAGIC,
  SURGE_MAGIC,
} from "../../src/services/core/config-format";
import {
  mapAICommand,
  mapAIPreset,
  mapNote,
  proseMirrorMarkdown,
} from "../../src/services/core/data";
const payload = {
  snippets: {
    schemaVersion: 1,
    snippets: [{ id: "one", title: "Signature", text: "Hello" }],
  },
  notes: { notes: [{ id: "two", text: "Note" }] },
};
const password = "synthetic test password";
function gcm(data: Buffer) {
  const salt = randomBytes(16);
  const iv = randomBytes(16);
  const cipher = createCipheriv(
    "aes-256-gcm",
    scryptSync(password, salt, 32),
    iv,
  );
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return {
    data: encrypted,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag(),
  };
}
function v3(encrypted: boolean) {
  let data = gzipSync(Buffer.from(JSON.stringify(payload)));
  const header: Record<string, unknown> = { schemaVersion: 3 };
  if (encrypted) {
    const e = gcm(data);
    data = Buffer.concat([e.data, e.tag]);
    header.encryption = { salt: e.salt, iv: e.iv };
  }
  const h = gzipSync(Buffer.from(JSON.stringify(header)));
  const size = Buffer.alloc(4);
  size.writeUInt32LE(h.length);
  return Buffer.concat([RAY_MAGIC, size, h, data]);
}
describe("configuration containers", () => {
  it.each([undefined, password])(
    "round trips Surgecast with password %s",
    async (pass) => {
      const bytes = await encodeConfig(payload, pass);
      expect(bytes.subarray(0, SURGE_MAGIC.length).equals(SURGE_MAGIC)).toBe(
        true,
      );
      expect((await decodeConfig(bytes, pass)).payload).toEqual(payload);
    },
  );
  it.each([false, true])(
    "reads synthetic Raycast v3, encrypted=%s",
    async (encrypted) =>
      expect(
        await decodeConfig(v3(encrypted), encrypted ? password : undefined),
      ).toEqual({ family: "ray-v3", payload }),
  );
  it.each([1, 2, 3])(
    "reads gzipped native schema %s with GCM wrapper",
    async (schemaVersion) => {
      const json = Buffer.from(JSON.stringify(payload));
      const e = gcm(schemaVersion === 1 ? json : gzipSync(json));
      const bytes = gzipSync(
        Buffer.from(
          JSON.stringify({
            schemaVersion,
            data: e.data.toString("hex"),
            encryption: {
              salt: e.salt,
              iv: e.iv,
              authTag: e.tag.toString("hex"),
            },
          }),
        ),
      );
      expect(await decodeConfig(bytes, password)).toEqual({
        family: "ray-wrapper",
        payload,
      });
    },
  );
  it("reads unencrypted native wrappers and classic gzip", async () => {
    const data = gzipSync(Buffer.from(JSON.stringify(payload)));
    expect((await decodeConfig(data)).family).toBe("ray-classic");
    const wrapper = gzipSync(
      Buffer.from(
        JSON.stringify({ schemaVersion: 2, data: data.toString("hex") }),
      ),
    );
    expect((await decodeConfig(wrapper)).payload).toEqual(payload);
  });
  it("reads classic CBC with the password hash", async () => {
    const iv = randomBytes(16);
    const cipher = createCipheriv(
      "aes-256-cbc",
      createHash("sha256").update(password).digest(),
      iv,
    );
    const data = gzipSync(Buffer.from(JSON.stringify(payload)));
    const bytes = Buffer.concat([iv, cipher.update(data), cipher.final()]);
    expect(await decodeConfig(bytes, password)).toEqual({
      family: "ray-classic",
      payload,
    });
    await expect(decodeConfig(bytes, "wrong")).rejects.toThrow("password");
  });
  it("rejects bad passwords, missing passwords, corrupt tags and truncated headers", async () => {
    const bytes = await encodeConfig(payload, password);
    await expect(decodeConfig(bytes)).rejects.toThrow("password");
    await expect(decodeConfig(bytes, "wrong")).rejects.toThrow("password");
    bytes[bytes.length - 1] ^= 1;
    await expect(decodeConfig(bytes, password)).rejects.toThrow("damaged");
    const ray = v3(false);
    ray.writeUInt32LE(2000000, 8);
    await expect(decodeConfig(ray)).rejects.toThrow("header");
    await expect(decodeConfig(RAY_MAGIC)).rejects.toThrow("Truncated");
  });
  it("maps rich notes and AI settings without copying hosted model identifiers", () => {
    expect(
      proseMirrorMarkdown({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Title" }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Body", marks: [{ type: "bold" }] },
            ],
          },
        ],
      }),
    ).toBe("## Title\n\n**Body**\n\n");
    expect(
      mapNote({
        id: 12,
        rawContent: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
          ],
        },
      }),
    ).toMatchObject({ id: "12", title: "Hello", content: "Hello" });
    expect(
      mapAICommand({
        title: "Rewrite",
        promptTemplate: "Rewrite {selection}",
        model: "raycast-hosted",
      }),
    ).toMatchObject({
      name: "Rewrite",
      prompt: "Rewrite {selection}",
      output: "window",
    });
    expect(
      mapAIPreset({ name: "Editor", systemInstructions: "Edit clearly" })
        .instructions,
    ).toBe("Edit clearly");
  });
});

describe("authenticated Surgecast headers", () => {
  it("rejects a modified header even when its schema is valid", async () => {
    const bytes = await encodeConfig(payload, password);
    const headerLength = bytes.readUInt32LE(SURGE_MAGIC.length);
    const original = JSON.parse(
      gunzipSync(
        bytes.subarray(
          SURGE_MAGIC.length + 4,
          SURGE_MAGIC.length + 4 + headerLength,
        ),
      ).toString("utf8"),
    );
    original.app = "Tampered";
    const header = gzipSync(Buffer.from(JSON.stringify(original)));
    const length = Buffer.alloc(4);
    length.writeUInt32LE(header.length);
    const corrupt = Buffer.concat([
      SURGE_MAGIC,
      length,
      header,
      bytes.subarray(SURGE_MAGIC.length + 4 + headerLength),
    ]);
    await expect(decodeConfig(corrupt, password)).rejects.toThrow("damaged");
  });
});
