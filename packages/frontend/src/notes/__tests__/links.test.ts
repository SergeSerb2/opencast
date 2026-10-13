import { describe, expect, it } from "vitest";
import { noteDeeplink } from "../actions";
import { normalizeHref } from "../components/LinkPopover";
import { fileNameFor } from "../lib/output";

describe("normalizeHref", () => {
  it("adds https to bare hosts and keeps explicit schemes", () => {
    expect(normalizeHref("example.com/path")).toBe("https://example.com/path");
    expect(normalizeHref("  https://x.y  ")).toBe("https://x.y");
    expect(normalizeHref("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(normalizeHref("surgecast://extensions/surgecast/notes/open")).toBe("surgecast://extensions/surgecast/notes/open");
    expect(normalizeHref("someone@example.com")).toBe("mailto:someone@example.com");
    expect(normalizeHref("   ")).toBe("");
  });
});

describe("noteDeeplink", () => {
  it("passes the note id as launch context of the Notes command", () => {
    const url = new URL(noteDeeplink("abc-123"));
    expect(url.protocol).toBe("surgecast:");
    expect(url.host).toBe("extensions");
    expect(url.pathname).toBe("/surgecast/notes/open");
    expect(JSON.parse(url.searchParams.get("launchContext") ?? "")).toEqual({ id: "abc-123" });
  });
});

describe("fileNameFor", () => {
  it("makes safe file names from titles", () => {
    expect(fileNameFor("Plan: Q3/Q4", "md")).toBe("Plan- Q3-Q4.md");
    expect(fileNameFor("   ", "txt")).toBe("Note.txt");
    expect(fileNameFor("a".repeat(200), "html")).toBe(`${"a".repeat(120)}.html`);
  });
});
