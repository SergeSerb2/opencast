import { afterEach, expect, it } from "vitest";
import { fixture } from "./fixture";
let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => { await f?.close(); });
it("opens Search AI Chats in the chat window's search route", async () => {
  f = await fixture();
  expect(await f.call("commands.launch", { id: "builtin:ai.searchAiChats", fallbackText: "release notes" }))
    .toEqual({ kind: "done", closeWindow: true });
  expect(f.nativeCall).toHaveBeenCalledWith("window.show", {
    kind: "ai-chat", route: "search", payload: { query: "release notes" },
  });
});
