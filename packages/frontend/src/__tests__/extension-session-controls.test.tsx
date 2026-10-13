import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExtensionSessionView } from "../extension-renderer/ExtensionSessionView";

const { listeners, call } = vi.hoisted(() => ({ listeners: new Map<string, Set<(payload: any) => void>>(), call: vi.fn() }));
vi.mock("../bridge/backend", () => ({ backend: {
  call,
  on(topic: string, fn: (payload: any) => void) { const set = listeners.get(topic) ?? new Set(); set.add(fn); listeners.set(topic, set); return () => set.delete(fn); },
  onStateChange: () => () => {},
} }));
beforeEach(() => {
  listeners.clear();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  call.mockImplementation(async (_method, { sessionId }) => ({ sessionId, extensionName: "e", commandName: "c", mode: "view", depth: 1, isLoading: false,
    root: { id: "form", type: "Form", props: {}, children: [{ id: "project", type: "Form.TextField", props: { id: "project", defaultValue: sessionId }, children: [] }] },
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("routes native UI controls only to the matching extension session", async () => {
  const view = render(<><ExtensionSessionView sessionId="first" /><ExtensionSessionView sessionId="second" /></>);
  await waitFor(() => expect(view.getAllByRole("textbox")).toHaveLength(2));
  const focusField = (sessionId: string) =>
    act(() => { for (const listener of listeners.get("ext.ui.control") ?? []) listener({ sessionId, action: "focus", itemId: "project" }); });
  // Each session's field holds its session id; re-send inside waitFor so a late re-render cannot drop the control.
  const focusedValue = () => (document.activeElement as HTMLInputElement | null)?.value;
  await waitFor(() => { focusField("first"); expect(focusedValue()).toBe("first"); });
  await waitFor(() => { focusField("second"); expect(focusedValue()).toBe("second"); });
});
