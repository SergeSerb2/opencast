import { describe, expect, it } from "vitest";
import type { AIMessage } from "@surgecast/protocol";
import { parseChatRoute } from "../window/useChatRoutes";
import { reduceStream, withLiveStream } from "./stream";

it("does not revive a stopped stream with a delayed start", () => {
  const stopped = reduceStream(undefined, { type: "done", streamId: "s", finishReason: "stopped" }, 0);
  expect(reduceStream(stopped, { type: "start", streamId: "s", model: "x" }, 1)).toBe(stopped);
});
it("preserves stored text and merges approval requests when joining a stream midway", () => {
  const message: AIMessage = { id: "m", chatId: "c", role: "assistant", content: "Prefix", status: "streaming", createdAt: 0, updatedAt: 0 };
  const live = reduceStream(undefined, { type: "tool-call", streamId: "s", call: { id: "call", name: "x", arguments: {}, status: "awaiting-confirmation" } }, 0);
  const merged = withLiveStream(message, { ...live, messageId: "m" });
  expect(merged.content).toBe("Prefix");
  expect(merged.toolCalls?.[0].status).toBe("awaiting-confirmation");
});
describe("route payload validation", () => {
  it("ignores malformed escapes and wrongly typed text", () => {
    expect(parseChatRoute("chat/%ZZ", {})).toEqual({ kind: "none" });
    expect(parseChatRoute("add-text", { text: 42 })).toEqual({ kind: "none" });
  });
  it("accepts full deeplink routes and string-only arguments", () => {
    expect(parseChatRoute("ai-chat/add-text", { text: "hi" })).toEqual({ kind: "text", text: "hi" });
    expect(parseChatRoute(undefined, { aiCommandId: "c", arguments: { a: "yes", b: false } })).toEqual({ kind: "command", commandId: "c", arguments: { a: "yes" } });
  });
});
