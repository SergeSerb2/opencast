import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExtensionPreferencesView } from "../launcher/views/ExtensionPreferencesView";
import { ExtensionPreferencesForm } from "../settings/ui/ExtensionPreferences";
import { applicationPreferenceValue } from "../lib/application-preference";

const { app, definitions, call } = vi.hoisted(() => ({
  app: { name: "Editor", path: "/Applications/Editor.app", bundleId: "example.editor" },
  definitions: [{ name: "application", title: "Application", type: "appPicker" }, { name: "project", title: "Project", type: "textfield" }],
  call: vi.fn(async () => undefined),
}));
vi.mock("../bridge/backend", () => ({ backend: { call, on: () => () => {}, onStateChange: () => () => {} } }));
vi.mock("../bridge/native", async (importOriginal) => ({ ...await importOriginal<typeof import("../bridge/native")>(), native: { available: true, call: vi.fn(async () => [app]), on: () => () => {} } }));
vi.mock("../bridge/hooks", async (importOriginal) => ({ ...await importOriginal<typeof import("../bridge/hooks")>(), useBackend: (method: string) => ({ data: method === "extensions.list" ? [{ name: "example", title: "Example", preferences: definitions, commands: [] }] : { values: { application: app, project: "old" } }, isLoading: false }) }));
beforeEach(() => { call.mockClear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps an AppInfo selection when another launcher preference is saved", async () => {
  const view = render(<ExtensionPreferencesView view={{ id: "extension.preferences" }} props={{ extensionName: "example" }} />);
  await waitFor(() => expect(view.getByText("Editor")).toBeTruthy());
  fireEvent.change(view.getByRole("textbox"), { target: { value: "new" } });
  fireEvent.click(view.getByText("Save Preferences"));
  await waitFor(() => expect(call).toHaveBeenCalledWith("extensions.setPreferences", { name: "example", command: undefined, values: { application: app.path, project: "new" } }));
});

it("shows the saved application in Settings too", async () => {
  const view = render(<ExtensionPreferencesForm extensionName="example" preferences={[{ name: "application", title: "Application", type: "appPicker", required: false }]} />);
  await waitFor(() => expect(view.getByText("Editor")).toBeTruthy());
  expect(view.queryByText("[object Object]")).toBeNull();
});

it("accepts legacy identifiers and bundle-only objects", () => {
  expect(applicationPreferenceValue("example.editor")).toBe("example.editor");
  expect(applicationPreferenceValue({ bundleId: "example.editor" })).toBe("example.editor");
  expect(applicationPreferenceValue(null)).toBe("");
});
