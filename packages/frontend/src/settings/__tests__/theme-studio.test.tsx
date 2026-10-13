import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { native } from "../../bridge/native";
import { GeneralPage } from "../pages/GeneralPage";
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("opens Theme Studio through the main launcher's supported command route", async () => {
  const call = vi.spyOn(native, "call").mockResolvedValue(undefined);
  const view = render(<GeneralPage />);
  fireEvent.click(view.getByRole("button", { name: "Open Theme Studio" }));
  await waitFor(() => expect(call).toHaveBeenCalledWith("window.show", {
    kind: "main", route: "command:builtin:core.showThemeStudio",
  }));
});
