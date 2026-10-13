import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UINode } from "@opencast/protocol";
import { UIControlContext, createUIControls } from "../components/View/UIControlContext";
import { ExtensionForm, ExtensionList } from "../extension-renderer/ExtensionViews";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const field = (id: string, extra = {}): UINode => ({ id, type: "Form.TextField", props: { id, defaultValue: "default", onChange: { $handler: id }, ...extra }, children: [] });
const form = (...children: UINode[]): UINode => ({ id: "form", type: "Form", props: {}, children });

describe("extension UI controls and runtime persistence", () => {
  it("focuses the requested field and resets it through onChange", async () => {
    const controls = createUIControls();
    const dispatch = vi.fn();
    const view = render(<UIControlContext.Provider value={controls}><ExtensionForm node={form(field("one"), field("two"))} options={{ dispatch, isLoading: false }} /></UIControlContext.Provider>);
    const inputs = view.getAllByRole("textbox") as HTMLInputElement[];
    act(() => controls.emit({ sessionId: "s", action: "focus", itemId: "two" }));
    expect(document.activeElement).toBe(inputs[1]);
    fireEvent.change(inputs[1], { target: { value: "changed" } });
    act(() => controls.emit({ sessionId: "s", action: "reset", itemId: "two" }));
    await waitFor(() => expect(inputs[1].value).toBe("default"));
    expect(dispatch).toHaveBeenLastCalledWith({ $handler: "two" }, ["default"]);
    act(() => controls.emit({ sessionId: "s", action: "focus", itemId: "missing" }));
    expect(document.activeElement).toBe(inputs[1]);
  });

  it.each([true, false])("clears search text with a runtime search handler: %s", async (withHandler) => {
    vi.useFakeTimers();
    try {
      const controls = createUIControls();
      const dispatch = vi.fn();
      const node: UINode = { id: "list", type: "List", props: { throttle: true, ...(withHandler ? { onSearchTextChange: { $handler: "search" } } : {}) }, children: [] };
      const view = render(<UIControlContext.Provider value={controls}><ExtensionList node={node} options={{ dispatch, isLoading: false }} /></UIControlContext.Provider>);
      const input = view.getByRole("combobox") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "query" } });
      act(() => controls.emit({ sessionId: "s", action: "clearSearchBar" }));
      expect(input.value).toBe("");
      act(() => vi.advanceTimersByTime(500));
      if (withHandler) expect(dispatch).toHaveBeenCalledExactlyOnceWith({ $handler: "search" }, [""]);
      else expect(dispatch).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("uses runtime defaults instead of global form storage from another extension", () => {
    localStorage.setItem("opencast.form.project", JSON.stringify("other-extension"));
    const dispatch = vi.fn();
    const view = render(<ExtensionForm node={form(field("project", { storeValue: true, defaultValue: "runtime-cache" }))} options={{ dispatch, isLoading: false }} />);
    const input = view.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("runtime-cache");
    fireEvent.change(input, { target: { value: "new-project" } });
    expect(dispatch).toHaveBeenCalledWith({ $handler: "project" }, ["new-project"]);
    expect(localStorage.getItem("opencast.form.project")).toBe(JSON.stringify("other-extension"));
  });
  it("uses the runtime's scoped dropdown default instead of another extension's storage", () => {
    localStorage.setItem("opencast.dropdown.project", "other");
    const node: UINode = { id: "list", type: "List", props: { searchBarAccessory: {
      id: "dropdown", type: "List.Dropdown", props: { id: "project", tooltip: "Project", storeValue: true, defaultValue: "runtime" }, children: [
        { id: "other", type: "List.Dropdown.Item", props: { value: "other", title: "Other" }, children: [] },
        { id: "runtime", type: "List.Dropdown.Item", props: { value: "runtime", title: "Runtime" }, children: [] },
      ],
    } }, children: [] };
    const view = render(<ExtensionList node={node} options={{ dispatch: vi.fn(), isLoading: false }} />);
    expect(view.getByText("Runtime")).toBeTruthy();
    expect(view.queryByText("Other")).toBeNull();
  });

});
