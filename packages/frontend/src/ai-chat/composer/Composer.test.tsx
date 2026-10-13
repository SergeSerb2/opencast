import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Composer, type ComposerProps } from "./Composer";

afterEach(cleanup);
function props(sendKey: ComposerProps["sendKey"] = "enter"): ComposerProps {
  return { variant: "chat", draft: { text: "hello", attachments: [] }, onDraftChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn(), isGenerating: false, toolsets: [], commands: [], presets: [], sendKey };
}
it("sends with Enter and keeps alternate Enter chords away from window actions", () => {
  const options = props();
  const ancestor = vi.fn();
  const { getByRole } = render(<div onKeyDown={ancestor}><Composer {...options} /></div>);
  const input = getByRole("textbox");
  fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
  expect(options.onSubmit).toHaveBeenCalledOnce();
  fireEvent.keyDown(input, { key: "Enter", code: "Enter", metaKey: true });
  fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true });
  expect(options.onSubmit).toHaveBeenCalledOnce();
  expect(ancestor).not.toHaveBeenCalled();
});
it("honors Command Enter and does not submit an IME composition", () => {
  const options = props("cmd-enter");
  const { getByRole } = render(<Composer {...options} />);
  const input = getByRole("textbox");
  fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
  expect(options.onSubmit).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter", code: "Enter", metaKey: true, isComposing: true });
  expect(options.onSubmit).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter", code: "Enter", metaKey: true });
  expect(options.onSubmit).toHaveBeenCalledOnce();
});
it("runs an empty-input command selected from the slash menu", () => {
  const options = props();
  options.draft = { text: "", attachments: [], command: { id: "c", name: "Say hello", prompt: "Say hello", creativity: "low", output: "quick-ai", createdAt: 0, updatedAt: 0 } };
  const { getByRole } = render(<Composer {...options} />);
  fireEvent.keyDown(getByRole("textbox"), { key: "Enter", code: "Enter" });
  expect(options.onSubmit).toHaveBeenCalledWith(options.draft);
});
