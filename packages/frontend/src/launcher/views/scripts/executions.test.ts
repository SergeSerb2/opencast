import { describe, expect, it, vi } from "vitest";
import type { BackendEvents } from "@surgecast/protocol";
import { Emitter } from "../../../bridge/emitter";
import { recentLaunchArguments, rememberLaunchArguments, ScriptExecutionStore } from "./executions";

const completed = (executionId: string, exitCode = 0): BackendEvents["scripts.completed"] => ({ executionId, exitCode, output: "", lastLine: "", durationMs: 10 });

describe("ScriptExecutionStore", () => {
  it("buffers chunks that arrive before anyone subscribes", () => {
    const events = new Emitter<BackendEvents>();
    const store = new ScriptExecutionStore();
    store.attach(events);
    events.emit("scripts.output", { executionId: "a", stream: "stdout", chunk: "hello " });
    events.emit("scripts.output", { executionId: "a", stream: "stderr", chunk: "world" });
    events.emit("scripts.completed", completed("a"));
    expect(store.get("a")).toEqual({ output: "hello world", completion: completed("a") });
  });

  it("notifies only the listeners of that execution with a new snapshot", () => {
    const store = new ScriptExecutionStore();
    const onA = vi.fn();
    const onB = vi.fn();
    store.subscribe("a", onA);
    store.subscribe("b", onB);
    const before = store.get("a");
    store.append("a", "x");
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
    expect(store.get("a")).not.toBe(before);
  });

  it("evicts the oldest unwatched executions but keeps watched ones", () => {
    const store = new ScriptExecutionStore();
    const off = store.subscribe("watched", () => undefined);
    store.append("watched", "keep");
    for (let i = 0; i < 20; i++) store.append(`run-${i}`, String(i));
    expect(store.get("watched")?.output).toBe("keep");
    expect(store.get("run-0")).toBeUndefined();
    expect(store.get("run-19")?.output).toBe("19");
    off();
  });

  it("stops listening when detached", () => {
    const events = new Emitter<BackendEvents>();
    const store = new ScriptExecutionStore();
    const detach = store.attach(events);
    detach();
    events.emit("scripts.output", { executionId: "a", stream: "stdout", chunk: "late" });
    expect(store.get("a")).toBeUndefined();
  });
});

describe("launch arguments", () => {
  it("are attributable to a launch only for a few seconds", () => {
    rememberLaunchArguments("/s/kill-port.sh", ["3000"], 1_000);
    expect(recentLaunchArguments("/s/kill-port.sh", 5_000)).toEqual(["3000"]);
    expect(recentLaunchArguments("/s/kill-port.sh", 12_000)).toBeUndefined();
    expect(recentLaunchArguments("/s/other.sh", 1_000)).toBeUndefined();
  });
});
