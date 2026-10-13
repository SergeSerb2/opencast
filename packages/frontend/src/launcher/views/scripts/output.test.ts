import { describe, expect, it } from "vitest";
import { formatDuration, outputStatus, stripAnsi, terminalText, visibleOutput } from "./output";

describe("stripAnsi", () => {
  it("removes colors, cursor movement, OSC hyperlinks and charset escapes", () => {
    expect(stripAnsi("\u001b[1;32m==>\u001b[0m Upgrading \u001b[4mnode\u001b[24m")).toBe("==> Upgrading node");
    expect(stripAnsi("a\u001b[2Kb\u001b[1Gc")).toBe("abc");
    expect(stripAnsi("\u001b]8;;https://brew.sh\u001b\\Homebrew\u001b]8;;\u001b\\ ready")).toBe("Homebrew ready");
    expect(stripAnsi("\u001b]0;title\u0007done")).toBe("done");
    expect(stripAnsi("\u001b(Bplain\u001b=")).toBe("plain");
    expect(stripAnsi("\u009b31mred")).toBe("red");
  });

  it("leaves ordinary text alone", () => {
    expect(stripAnsi("[INFO] 100% done")).toBe("[INFO] 100% done");
  });
});

describe("terminalText", () => {
  it("normalizes CRLF and keeps what follows a carriage return", () => {
    expect(terminalText("one\r\ntwo\n")).toBe("one\ntwo\n");
    expect(terminalText("Downloading 10%\rDownloading 55%\rDownloading 100%\nDone")).toBe("Downloading 100%\nDone");
  });

  it("drops control characters but keeps tabs", () => {
    expect(terminalText("a\u0007b\tc\u0008")).toBe("ab\tc");
  });
});

describe("visibleOutput", () => {
  it("trims long output from the start at a line boundary", () => {
    const text = "first line\nsecond line\nthird line";
    expect(visibleOutput(text, 100)).toEqual({ text, truncated: false });
    expect(visibleOutput(text, 15)).toEqual({ text: "third line", truncated: true });
  });
});

describe("formatDuration", () => {
  it("formats seconds and minutes", () => {
    expect(formatDuration(420)).toBe("0.42s");
    expect(formatDuration(12_345)).toBe("12.3s");
    expect(formatDuration(125_000)).toBe("2m 05s");
    expect(formatDuration(-5)).toBe("0.00s");
  });
});

describe("outputStatus", () => {
  it("describes each phase", () => {
    expect(outputStatus({ kind: "running" }, "System Uptime")).toEqual({ text: "Running System Uptime…", tone: "muted" });
    expect(outputStatus({ kind: "finished", exitCode: 0, durationMs: 420, cancelled: false }, "x")).toEqual({ text: "Finished in 0.42s", tone: "success" });
    expect(outputStatus({ kind: "finished", exitCode: 2, durationMs: 1200, cancelled: false }, "x")).toEqual({ text: "Failed with exit code 2 after 1.20s", tone: "error" });
    expect(outputStatus({ kind: "finished", exitCode: -1, durationMs: 800, cancelled: true }, "x")).toEqual({ text: "Stopped after 0.80s", tone: "muted" });
    expect(outputStatus({ kind: "finished", exitCode: 0, durationMs: 10, error: "Script output exceeded 8 MiB", cancelled: false }, "x").tone).toBe("error");
    expect(outputStatus({ kind: "finished", exitCode: 1, cancelled: false }, "x").text).toBe("Failed with exit code 1");
  });
});
