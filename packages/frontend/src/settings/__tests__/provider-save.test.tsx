import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProviderPage } from "../pages/ai/ProviderPage";

const { provider, template, call } = vi.hoisted(() => ({
  provider: { id: "p", name: "Provider", template: "custom", api: "openai", baseUrl: "http://localhost:8317/v1", enabled: true, autoFetchModels: true, hasApiKey: false, models: [], createdAt: 1, updatedAt: 1 },
  template: { id: "custom", name: "Custom", api: "openai", baseUrl: "http://localhost:8317/v1", needsApiKey: false },
  call: vi.fn(),
}));
vi.mock("../../bridge/backend", () => ({ backend: { call, on: () => () => {} } }));
vi.mock("../../bridge/hooks", async (importOriginal) => ({ ...await importOriginal<typeof import("../../bridge/hooks")>(), useBackend: (method: string) => ({ data: method === "ai.providers.list" ? [provider] : method === "ai.providers.templates" ? [template] : [], isLoading: false }) }));
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("blocks provider draft edits while a save and model discovery are pending", async () => {
  let finish!: (value: typeof provider) => void;
  call.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const view = render(<ProviderPage id="p" />);
  const name = await view.findByRole("textbox", { name: "Name" }) as HTMLInputElement;
  fireEvent.change(name, { target: { value: "Submitted" } });
  fireEvent.click(view.getByText("Save Changes"));
  await waitFor(() => expect(name.matches(":disabled")).toBe(true));
  expect((view.getByRole("textbox", { name: "Base URL" }) as HTMLInputElement).matches(":disabled")).toBe(true);
  expect(view.getByLabelText("API Key").matches(":disabled")).toBe(true);
  fireEvent.change(name, { target: { value: "Late edit" } });
  expect(name.value).toBe("Submitted");
  await act(async () => { finish({ ...provider, name: "Submitted", updatedAt: 2 }); });
  expect(name.value).toBe("Submitted");
  expect(name.matches(":disabled")).toBe(false);
});
