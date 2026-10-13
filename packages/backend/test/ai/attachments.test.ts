import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { AIModel, AIProvider } from "@surgecast/protocol";
import {
  prepareTurns,
  trivialPdfText,
} from "../../src/services/ai/attachments";
let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});
const model: AIModel = {
  id: "test",
  name: "Test",
  enabled: true,
  capabilities: { vision: true, pdf: true },
};
const provider: AIProvider = {
  id: "p",
  name: "Test",
  template: "custom",
  api: "openai",
  baseUrl: "http://localhost/v1",
  models: [model],
  enabled: true,
  autoFetchModels: false,
  createdAt: 1,
  updatedAt: 1,
};
it("loads selected images as base64 and labels text files", async () => {
  dir = await mkdtemp(join(tmpdir(), "surgecast-attachments-"));
  const image = join(dir, "image.png"),
    text = join(dir, "code.ts");
  await writeFile(image, Buffer.from("image bytes"));
  await writeFile(text, "const a = 1;");
  const result = await prepareTurns(
    [
      {
        role: "user",
        content: "Review",
        attachments: [
          { id: "i", kind: "image", name: "image.png", path: image },
          { id: "t", kind: "file", name: "code.ts", path: text },
        ],
      },
    ],
    provider,
    model,
  );
  expect(result[0].parts).toEqual([
    { type: "text", text: "Review" },
    {
      type: "image",
      mimeType: "image/png",
      data: Buffer.from("image bytes").toString("base64"),
      name: "image.png",
    },
    { type: "text", text: "\n--- code.ts ---\nconst a = 1;" },
  ]);
  await expect(
    prepareTurns(
      [
        {
          role: "user",
          content: "",
          attachments: [{ id: "i", kind: "image", name: "image", path: image }],
        },
      ],
      provider,
      { ...model, capabilities: { vision: false } },
    ),
  ).rejects.toThrow("does not support image");
});
it("sends native PDFs to document-capable vendors and extracts trivial PDFs otherwise", async () => {
  dir = await mkdtemp(join(tmpdir(), "surgecast-pdf-"));
  const path = join(dir, "document.pdf");
  const pdf = Buffer.from("%PDF-1.4\nBT (Hello PDF) Tj ET\n%%EOF");
  await writeFile(path, pdf);
  const turns = [
    {
      role: "user" as const,
      content: "",
      attachments: [
        { id: "p", kind: "file" as const, name: "document.pdf", path },
      ],
    },
  ];
  expect((await prepareTurns(turns, provider, model))[0].parts[0]).toEqual({
    type: "text",
    text: "\n--- document.pdf ---\nHello PDF",
  });
  expect(
    (await prepareTurns(turns, { ...provider, api: "anthropic" }, model))[0]
      .parts[0],
  ).toMatchObject({ type: "pdf", mimeType: "application/pdf" });
  expect(
    (
      await prepareTurns(turns, { ...provider, api: "openai-responses" }, model)
    )[0].parts[0],
  ).toMatchObject({ type: "pdf", data: pdf.toString("base64") });
  expect(() => trivialPdfText(Buffer.from("%PDF /Encrypt"))).toThrow(
    "Encrypted",
  );
  expect(() => trivialPdfText(Buffer.from("%PDF no text"))).toThrow(
    "document-capable",
  );
});
it("rejects binary attachments instead of treating bytes as text", async () => {
  dir = await mkdtemp(join(tmpdir(), "surgecast-binary-"));
  const path = join(dir, "data.bin");
  await writeFile(path, Buffer.from([1, 0, 2]));
  await expect(
    prepareTurns(
      [
        {
          role: "user",
          content: "",
          attachments: [{ id: "x", kind: "file", name: "data.bin", path }],
        },
      ],
      provider,
      model,
    ),
  ).rejects.toThrow("binary");
});
