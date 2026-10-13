import type { ReactNode } from "react";
import type { AICommand, AIPreset } from "@surgecast/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { backend } from "../../bridge/backend";
import { CommandEditor, PresetEditor } from "../pages/ai/editors";

vi.mock("../../bridge/backend", () => ({ backend: { call: vi.fn(async () => undefined) } }));
vi.mock("../../bridge/hooks", () => ({ useBackend: () => ({ data: [] }) }));
vi.mock("../pages/ai/shared", () => ({ ModelPicker: ({ onChange }: { onChange: (value: null) => void }) => <button onClick={() => onChange(null)}>Default Model</button> }));
vi.mock("../ui/controls", () => ({ Select: ({ label, onChange }: { label: string; onChange: (value: null) => void }) => label === "Reasoning Effort" ? <button onClick={() => onChange(null)}>Default Effort</button> : null }));
vi.mock("../ui/Dialog", () => ({
  Dialog: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <div>{children}{footer}</div>,
  DialogField: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it.each(["command", "preset"] as const)("saves default %s overrides as explicit nulls through JSON", async (kind) => {
  const base = { id: "existing", name: "Test", model: "local/mock", reasoningEffort: "high" as const, creativity: "medium" as const, createdAt: 0, updatedAt: 0 };
  const onClose = vi.fn();
  if (kind === "command") {
    const command: AICommand = { ...base, prompt: "Hello", output: "quick-ai" };
    render(<CommandEditor command={command} onClose={onClose} />);
  } else {
    const preset: AIPreset = { ...base, instructions: "Hello", webSearch: false, tools: [] };
    render(<PresetEditor preset={preset} onClose={onClose} />);
  }
  fireEvent.click(screen.getByText("Default Model"));
  fireEvent.click(screen.getByText("Default Effort"));
  fireEvent.click(screen.getByText("Save"));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  const [method, params] = vi.mocked(backend.call).mock.calls[0];
  expect(method).toBe(kind === "command" ? "ai.commands.upsert" : "ai.presets.upsert");
  expect(JSON.parse(JSON.stringify(params))).toMatchObject({ id: "existing", model: null, reasoningEffort: null });
});
