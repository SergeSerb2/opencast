import { describe, expect, it } from "vitest";
import type { ProcessInfo } from "@opencast/protocol";
import { bundlePath, formatCpu, formatMemory, parseFilter, processIcon, revealPath, searchProcesses, visibleProcesses } from "./process-model";

const MB = 1024 * 1024;
const proc = (pid: number, name: string, cpu: number, memoryMb: number, extra: Partial<ProcessInfo> = {}): ProcessInfo => ({ pid, name, executable: `/usr/bin/${name}`, cpuPercent: cpu, memoryBytes: memoryMb * MB, ...extra });
const figma = proc(10, "Figma", 18, 1400, { executable: "/Applications/Figma.app/Contents/MacOS/Figma", app: { name: "Figma", path: "/Applications/Figma.app", bundleId: "com.figma.Desktop", pid: 10, isActive: false, isHidden: false } });
const LIST = [proc(1, "launchd", 0.2, 40), figma, proc(20, "node", 25, 300), proc(21, "zsh", 0, 6), proc(22, "bash", 0, 6)];

describe("parseFilter", () => {
  it("decodes dropdown values with a CPU default", () => {
    expect(parseFilter("apps:memory")).toEqual({ scope: "apps", sort: "memory" });
    expect(parseFilter(undefined)).toEqual({ scope: "all", sort: "cpu" });
    expect(parseFilter("bogus")).toEqual({ scope: "all", sort: "cpu" });
  });
});

describe("visibleProcesses", () => {
  it("sorts by CPU or memory, heaviest first, ties by name", () => {
    expect(visibleProcesses(LIST, "all", "cpu").map((p) => p.name)).toEqual(["node", "Figma", "launchd", "bash", "zsh"]);
    expect(visibleProcesses(LIST, "all", "memory").map((p) => p.name)).toEqual(["Figma", "node", "launchd", "bash", "zsh"]);
  });

  it("keeps only applications in the apps scope", () => {
    expect(visibleProcesses(LIST, "apps", "cpu").map((p) => p.name)).toEqual(["Figma"]);
  });

  it("does not mutate the input", () => {
    const copy = [...LIST];
    visibleProcesses(LIST, "all", "memory");
    expect(LIST).toEqual(copy);
  });
});

describe("searchProcesses", () => {
  const sorted = visibleProcesses(LIST, "all", "cpu");

  it("matches name, PID, executable and bundle id while keeping the order", () => {
    expect(searchProcesses(sorted, "sh").map((m) => m.process.name)).toEqual(["bash", "zsh"]);
    expect(searchProcesses(sorted, "20").map((m) => m.process.name)).toEqual(["node"]);
    expect(searchProcesses(sorted, "com.figma").map((m) => m.process.name)).toEqual(["Figma"]);
  });

  it("returns highlight ranges for title matches", () => {
    expect(searchProcesses(sorted, "fig")[0].titleRanges).toEqual([[0, 3]]);
    expect(searchProcesses(sorted, "").length).toBe(LIST.length);
  });
});

describe("formatting", () => {
  it("formats memory in binary units", () => {
    expect(formatMemory(512 * 1024)).toBe("512 KB");
    expect(formatMemory(612 * MB)).toBe("612 MB");
    expect(formatMemory(1.48 * 1024 * MB)).toBe("1.48 GB");
    expect(formatMemory(12.3 * 1024 * MB)).toBe("12.3 GB");
  });

  it("formats CPU with one decimal", () => {
    expect(formatCpu(6.44)).toBe("6.4%");
    expect(formatCpu(0)).toBe("0.0%");
    expect(formatCpu(112.06)).toBe("112.1%");
  });
});

describe("icons and paths", () => {
  it("resolves helpers to their outermost app bundle", () => {
    expect(bundlePath("/Applications/Figma.app/Contents/Frameworks/Figma Helper (Renderer).app/Contents/MacOS/Figma Helper (Renderer)")).toBe("/Applications/Figma.app");
    expect(bundlePath("/usr/sbin/coreaudiod")).toBeUndefined();
  });

  it("picks app icons, then a terminal glyph", () => {
    expect(processIcon(figma)).toEqual({ fileIcon: "/Applications/Figma.app" });
    expect(processIcon(proc(30, "Code Helper", 1, 1, { executable: "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper.app/Contents/MacOS/Code Helper" }))).toEqual({ fileIcon: "/Applications/Visual Studio Code.app" });
    expect(processIcon(proc(31, "node", 1, 1))).toBe("terminal-16");
  });

  it("reveals the app or the executable", () => {
    expect(revealPath(figma)).toBe("/Applications/Figma.app");
    expect(revealPath(proc(31, "node", 1, 1))).toBe("/usr/bin/node");
    expect(revealPath(proc(0, "kernel_task", 1, 1, { executable: "kernel_task" }))).toBeUndefined();
  });
});
