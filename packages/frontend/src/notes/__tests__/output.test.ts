import { afterEach, describe, expect, it, vi } from "vitest";
import { RpcErrorCode } from "@surgecast/protocol";
import { RpcError } from "../../bridge/errors";
import { native } from "../../bridge/native";
import { saveTextFile } from "../lib/output";

const environment = vi.hoisted(() => ({ native: true }));
vi.mock("../../bridge/env", () => ({ getEnv: () => environment }));

afterEach(() => vi.restoreAllMocks());

describe("native note export", () => {
  it("passes the exact UTF-8 content and file extension to the host", async () => {
    const call = vi.spyOn(native, "call").mockResolvedValue("/tmp/Note.md");
    expect(await saveTextFile("Note.md", "# Notes\n\nCafé ☕\n", "text/markdown")).toBe("saved");
    expect(call).toHaveBeenCalledWith("dialog.saveFile", { suggestedName: "Note.md", content: "# Notes\n\nCafé ☕\n", allowedTypes: ["md"], title: "Export Note" });
  });

  it("does not report success when the user cancels", async () => {
    vi.spyOn(native, "call").mockResolvedValue(null);
    expect(await saveTextFile("Note.txt", "text", "text/plain")).toBe("cancelled");
  });

  it("reports a clear error on hosts without a save-file handler", async () => {
    vi.spyOn(native, "call").mockRejectedValue(new RpcError({ code: RpcErrorCode.MethodNotFound, message: "unsupported" }));
    await expect(saveTextFile("Note.md", "text", "text/markdown")).rejects.toThrow("dialog.saveFile support");
  });

  it("preserves host write errors", async () => {
    vi.spyOn(native, "call").mockRejectedValue(new Error("Permission denied"));
    await expect(saveTextFile("Note.md", "text", "text/markdown")).rejects.toThrow("Permission denied");
  });
});
