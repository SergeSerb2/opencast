import { describe, expect, it } from "vitest";
import { attachmentFromFile, attachmentImageUrl } from "./attachments";

describe("path-less attachments", () => {
  it("carries pasted images as data URLs without inventing a local path", async () => {
    const attachment = await attachmentFromFile(new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" }));
    expect(attachment).toMatchObject({ kind: "image", mimeType: "image/png", size: 3, url: "data:image/png;base64,AQID" });
    expect(attachment.path).toBeUndefined();
    expect(attachmentImageUrl(attachment)).toBe(attachment.url);
  });
  it("recognizes images picked with no MIME type", async () => {
    expect(await attachmentFromFile(new File(["x"], "photo.jpg"))).toMatchObject({ kind: "image", mimeType: "image/jpeg" });
  });
  it("rejects oversized images and unknown binaries clearly", async () => {
    await expect(attachmentFromFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }))).rejects.toThrow("10 MB");
    await expect(attachmentFromFile(new File(["binary"], "archive.zip"))).rejects.toThrow("Surgecast app");
  });
});
