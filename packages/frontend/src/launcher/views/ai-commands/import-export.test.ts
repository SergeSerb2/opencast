import { describe, expect, it } from "vitest";
import { exportSummary, formatBytes, importErrors, importSource } from "./import-export";

describe("importErrors", () => {
  it("needs a file or pasted JSON", () => {
    expect(importErrors([], "  ")).toEqual({ file: "Choose a file or paste JSON" });
  });

  it("accepts a .json file and ignores pasted text then", () => {
    expect(importErrors(["/Users/me/AI Commands.json"], "not json")).toEqual({});
    expect(importErrors(["/Users/me/commands.txt"], "")).toEqual({ file: "Choose a .json file" });
  });

  it("checks pasted JSON the way the backend reads it", () => {
    expect(importErrors([], "{ nope")).toEqual({ json: "This isn't valid JSON" });
    expect(importErrors([], '{"version": 1}')).toEqual({ json: "Expected a list of AI commands or an export file" });
    expect(importErrors([], '{"commands": []}')).toEqual({ json: "There are no AI commands in this JSON" });
    expect(importErrors([], '[{"title": "Fix", "prompt": "Fix {selection}"}]')).toEqual({});
    expect(importErrors([], '{"name": "Fix", "prompt": "Fix {selection}"}')).toEqual({});
    expect(importErrors([], '{"aiCommands": [{"name": "Fix", "prompt": "x"}]}')).toEqual({});
  });
});

describe("importSource", () => {
  it("prefers the file", () => {
    expect(importSource(["/a.json"], "[]")).toEqual({ kind: "file", path: "/a.json" });
    expect(importSource([], "[]")).toEqual({ kind: "text", json: "[]" });
  });
});

describe("exportSummary", () => {
  it("counts custom and built-in commands", () => {
    const json = JSON.stringify({ schemaVersion: 1, commands: [{ kind: "builtin" }, { kind: "custom" }, { kind: "custom" }] });
    expect(exportSummary(json)).toEqual({ total: 3, custom: 2, builtin: 1, bytes: json.length });
  });

  it("survives unexpected JSON", () => {
    expect(exportSummary("oops")).toEqual({ total: 0, custom: 0, builtin: 0, bytes: 4 });
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2150)).toBe("2.1 KB");
    expect(formatBytes(40_960)).toBe("40 KB");
  });
});
