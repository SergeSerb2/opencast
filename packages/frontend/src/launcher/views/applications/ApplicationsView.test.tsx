import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CommandInfo } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { native } from "../../../bridge/native";
import { getView } from "../registry";
import "../index";
const app = (id: string, title: string, enabled = true): CommandInfo => ({
  id, title, enabled, kind: "app", mode: "no-view", typeLabel: "Application",
  icon: { fileIcon: `/Applications/${title}.app` }, keywords: [id],
});
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(query = "") {
  const original = backend.call.bind(backend);
  const call = vi.spyOn(backend, "call").mockImplementation((async (method: string, params: any) => {
    if (method === "commands.list") return [
      app("app:com.apple.Safari", "Safari"), app("app:com.apple.Terminal", "Terminal"),
      app("app:disabled", "Disabled", false),
      { ...app("builtin:command", "Command"), kind: "builtin" },
    ];
    if (method === "commands.launch") return { kind: "done", closeWindow: true };
    return original(method as any, params);
  }) as typeof backend.call);
  const nativeCall = vi.spyOn(native, "call").mockResolvedValue(undefined);
  const View = getView("applications")!;
  expect(View).toBeDefined();
  const view = render(<View props={{ query }} view={{ id: "applications" }} title="Search Applications" />);
  return { ...view, call, nativeCall };
}
it("registers a searchable application-only view and launches the selected app", async () => {
  const view = setup();
  await view.findByRole("option", { name: /Safari/ });
  expect(view.getAllByRole("option")).toHaveLength(2);
  fireEvent.change(view.getByRole("combobox"), { target: { value: "Terminal" } });
  await waitFor(() => expect(view.getAllByRole("option")).toHaveLength(1));
  fireEvent.keyDown(window, { key: "Enter", code: "Enter" });
  await waitFor(() => expect(view.call).toHaveBeenCalledWith("commands.launch", expect.objectContaining({ id: "app:com.apple.Terminal" })));
  expect(view.nativeCall).toHaveBeenCalledWith("window.hide", { kind: "main", restoreFocus: true });
});
it("uses fallback query text and shows an empty state for no matches", async () => {
  const view = setup("Safari");
  await view.findByRole("option", { name: /Safari/ });
  expect(view.getAllByRole("option")).toHaveLength(1);
  fireEvent.change(view.getByRole("combobox"), { target: { value: "xyz-nothing" } });
  await view.findByText("No Matching Applications");
  expect(view.queryAllByRole("option")).toHaveLength(0);
});
