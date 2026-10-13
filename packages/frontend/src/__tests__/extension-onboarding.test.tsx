import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ExtensionPreferencesView } from "../launcher/views/ExtensionPreferencesView";

const { useBackend } = vi.hoisted(() => ({ useBackend: vi.fn((method: string) => ({ data: method === "extensions.list" ? [{ name: "example", title: "Example", preferences: [], commands: [{ name: "run", preferences: [{ name: "project", type: "textfield", required: true }] }] }] : { values: {} }, isLoading: false })) }));
vi.mock("../bridge/hooks", async (importOriginal) => ({ ...await importOriginal<typeof import("../bridge/hooks")>(), useBackend }));
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("extension preference onboarding", () => {
  it("loads fields using the backend's name and command props", async () => {
    const view = render(<ExtensionPreferencesView view={{ id: "extension.preferences" }} props={{ name: "example", command: "run", missingRequired: ["project"] }} />);
    await waitFor(() => expect(view.getByRole("textbox")).toBeTruthy());
    expect(useBackend).toHaveBeenCalledWith("extensions.getPreferences", { name: "example", command: "run" });
    expect(view.getByText("Save and Continue")).toBeTruthy();
  });
});
