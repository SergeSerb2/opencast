import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { native } from "../../bridge/native";
import { AIChatApp } from "./AIChatApp";
import { parseChatRoute } from "./useChatRoutes";
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  localStorage.setItem("surgecast.ai.sidebarOpen", "false");
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
it("parses a search route separately from a chat ID", () => {
  expect(parseChatRoute("search", { query: "release" })).toEqual({ kind: "search", query: "release" });
  expect(parseChatRoute("ai-chat/search", { query: 42 })).toEqual({ kind: "search", query: "" });
  expect(parseChatRoute("chat/search", {})).toEqual({ kind: "chat", chatId: "search" });
});
it("reveals a hidden chat sidebar and focuses its search field on the native route", async () => {
  const view = render(<AIChatApp />);
  expect(view.queryByPlaceholderText("Search chats")).toBeNull();
  act(() => native.emit("window.didShow", { kind: "ai-chat" }));
  act(() => native.emit("window.route", { kind: "ai-chat", route: "search", payload: { query: "release notes" } }));
  const input = await view.findByPlaceholderText("Search chats") as HTMLInputElement;
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(input.value).toBe("release notes");
});
