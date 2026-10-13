import { describe, expect, it } from "vitest";
import type { FileResult } from "@surgecast/protocol";
import { fileTypeName, isImageFile, isTextFile, matchesFileType } from "./file-types";

const file = (name: string, kind = "File"): FileResult => ({ path: `/Users/me/${name}`, name, kind });

describe("file types", () => {
  it("filters by category", () => {
    expect(matchesFileType(file("a.png"), "image")).toBe(true);
    expect(matchesFileType(file("a.png"), "document")).toBe(false);
    expect(matchesFileType(file("Invoices", "Folder"), "directory")).toBe(true);
    expect(matchesFileType(file("Invoices", "Folder"), "file")).toBe(false);
    expect(matchesFileType(file("a.zip"), "archive")).toBe(true);
    expect(matchesFileType(file("a.weird"), "other")).toBe(true);
    expect(matchesFileType(file("a.md"), "other")).toBe(false);
    expect(matchesFileType(file("a.md"), "allTypes")).toBe(true);
  });

  it("names types", () => {
    expect(fileTypeName(file("App.tsx"))).toBe("TypeScript React");
    expect(fileTypeName(file("photo.HEIC"))).toBe("HEIC");
    expect(fileTypeName(file("data.parquet"))).toBe("PARQUET");
    expect(fileTypeName(file("Makefile"))).toBe("File");
    expect(fileTypeName(file("src", "Folder"))).toBe("Folder");
    expect(fileTypeName(file("Safari.app", "Folder"))).toBe("Application");
  });

  it("knows what it can preview", () => {
    expect(isImageFile(file("a.jpeg"))).toBe(true);
    expect(isTextFile(file("notes.txt"))).toBe(true);
    expect(isTextFile(file("notes", "Folder"))).toBe(false);
  });
});
