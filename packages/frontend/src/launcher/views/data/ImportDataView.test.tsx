import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { native } from "../../../bridge/native";
import { ImportDataView } from "./ImportDataView";

beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["surgecast", "surgeconfig", "openconfig"])("selects a .%s export through the native panel", async extension => {
  const path = `/tmp/backup.${extension}`;
  const call = vi.spyOn(native, "call").mockResolvedValue([path]);
  const view = render(<ImportDataView props={{ format: "opencast" }} view={{ id: "data.import" }} />);
  fireEvent.click(view.getByRole("button", { name: "Select File" }));
  await waitFor(() => expect(call).toHaveBeenCalledWith("dialog.openFiles", expect.objectContaining({
    allowedTypes: expect.arrayContaining(["surgecast", "surgeconfig", "openconfig"]),
  })));
  expect(await view.findByText(`backup.${extension}`)).toBeTruthy();
});
