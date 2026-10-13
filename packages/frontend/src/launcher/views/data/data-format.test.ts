import { describe, expect, it } from "vitest";
import {
  categoryInfo,
  exportCollections,
  exportFileName,
  formatBytes,
  homeFromDataDir,
  importErrorField,
  importSummary,
  joinPath,
  shareOfTotal,
  storageRows,
  storageSummary,
  validateExportPassword,
  type StorageInfo,
} from "./data-format";

describe("formatBytes", () => {
  it("uses Finder-style decimal units", () => {
    expect(formatBytes(0, "en-US")).toBe("Zero bytes");
    expect(formatBytes(1, "en-US")).toBe("1 byte");
    expect(formatBytes(999, "en-US")).toBe("999 bytes");
    expect(formatBytes(36_400, "en-US")).toBe("36 KB");
    expect(formatBytes(999_700, "en-US")).toBe("1 MB");
    expect(formatBytes(4_230_000, "en-US")).toBe("4.2 MB");
    expect(formatBytes(48_213_504, "en-US")).toBe("48.2 MB");
    expect(formatBytes(5_000_000, "en-US")).toBe("5 MB");
    expect(formatBytes(1_563_000_000, "en-US")).toBe("1.56 GB");
    expect(formatBytes(2_000_000_000_000, "en-US")).toBe("2 TB");
  });
});

describe("categories", () => {
  it("maps export choices to backend collections", () => {
    expect(exportCollections(["notes", "aiChats"])).toEqual(["notes", "aiChats", "aiMessages"]);
    expect(exportCollections([])).toEqual([]);
  });

  it("labels known and unknown categories", () => {
    expect(categoryInfo("ai").title).toBe("AI Commands & Presets");
    expect(categoryInfo("aiMessages").title).toBe("AI Messages");
    expect(categoryInfo("focusSessions")).toEqual({ id: "focusSessions", title: "Focus Sessions", icon: "box-16" });
  });
});

describe("validateExportPassword", () => {
  it("allows no password, requires 8 characters and a matching confirmation", () => {
    expect(validateExportPassword("", "")).toEqual({});
    expect(validateExportPassword("short", "short")).toEqual({ password: "Use at least 8 characters" });
    expect(validateExportPassword("longenough", "longenougH")).toEqual({ confirmation: "Passwords don't match" });
    expect(validateExportPassword("", "something")).toEqual({ password: "Use at least 8 characters" });
    expect(validateExportPassword("longenough", "longenough")).toEqual({});
  });
});

describe("paths", () => {
  it("names exports with the local date and time", () => {
    expect(exportFileName(new Date(2026, 9, 3, 7, 5, 9))).toBe("OpenCast 2026-10-03 07.05.09.openconfig");
  });

  it("joins and finds the home folder", () => {
    expect(joinPath("/Users/me/Downloads/", "a.opencast")).toBe("/Users/me/Downloads/a.opencast");
    expect(homeFromDataDir("/Users/me/Library/Application Support/OpenCast")).toBe("/Users/me");
    expect(homeFromDataDir("/tmp/opencast")).toBeUndefined();
  });
});

describe("import results", () => {
  it("sums imported items of successful categories", () => {
    expect(importSummary([{ category: "snippets", imported: 3 }, { category: "notes", imported: 2 }, { category: "themes", imported: 0, error: "Bad theme" }])).toEqual({ imported: 5, failed: 1 });
  });

  it("maps backend errors to form fields", () => {
    expect(importErrorField("This configuration requires a password")).toMatchObject({ field: "password", error: "Password required" });
    expect(importErrorField("Incorrect password or damaged configuration")).toMatchObject({ field: "password", error: "Incorrect password" });
    expect(importErrorField("Expected an OpenCast configuration")).toMatchObject({ field: "file", error: "Not an OpenCast export" });
    expect(importErrorField("Use data.import for an OpenCast export")).toMatchObject({ field: "file", error: "This is an OpenCast export" });
    expect(importErrorField("Invalid configuration JSON")).toEqual({ field: "file", error: "Can't read this file", message: "Invalid configuration JSON" });
    expect(importErrorField("Database is locked")).toBeUndefined();
  });
});

describe("storage", () => {
  const storage: StorageInfo = { totalBytes: 48_213_504, databaseBytes: 12_582_912, clipboardBytes: 35_630_592, entities: { notes: 2, snippets: 3, settings: 40, focusSessions: 1 }, clipboardItems: 6 };

  it("lists clipboard, known collections with zeros, then unknown ones (never settings)", () => {
    const rows = storageRows(storage);
    expect(rows[0]).toMatchObject({ id: "clipboard", title: "Clipboard History", count: 6 });
    expect(rows.find((r) => r.id === "notes")?.count).toBe(2);
    expect(rows.find((r) => r.id === "themes")?.count).toBe(0);
    expect(rows.at(-1)).toMatchObject({ id: "focusSessions", count: 1 });
    expect(rows.some((r) => r.id === "settings")).toBe(false);
  });

  it("summarizes as text and computes shares", () => {
    const summary = storageSummary(storage, "en-US");
    expect(summary.split("\n").slice(0, 3)).toEqual(["Total: 48.2 MB", "Database: 12.6 MB", "Clipboard images: 35.6 MB"]);
    expect(summary).toContain("Notes: 2");
    expect(shareOfTotal(12_582_912, 48_213_504)).toBe("26%");
    expect(shareOfTotal(1, 48_213_504)).toBe("<1%");
    expect(shareOfTotal(0, 0)).toBe("0%");
  });
});
