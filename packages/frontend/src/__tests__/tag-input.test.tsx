import { useState } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TagInput } from "../components/TagInput/TagInput";

beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Tags() {
  const [value, setValue] = useState<string[]>([]);
  return <TagInput value={value} onChange={setValue} options={[{ value: "alpha", title: "Alpha" }, { value: "beta", title: "Beta" }]} aria-label="Tags" />;
}
it("retains typing focus while filtering suggestions and selecting with the keyboard", async () => {
  const view = render(<Tags />);
  const input = view.getByRole("textbox");
  input.focus();
  await waitFor(() => expect(view.getAllByRole("menuitem")).toHaveLength(2));
  expect(document.activeElement).toBe(input);
  fireEvent.change(input, { target: { value: "bet" } });
  await waitFor(() => expect(view.getAllByRole("menuitem")).toHaveLength(1));
  expect(document.activeElement).toBe(input);
  fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
  expect(view.getByRole("button", { name: "Remove Beta" })).toBeTruthy();
});
