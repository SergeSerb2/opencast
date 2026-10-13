import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatePickerHost } from "../components/feedback/date-picker";
import { mapAction } from "../extension-renderer/actions";

afterEach(cleanup);
describe("extension PickDate", () => {
  it("collects a date before dispatching and lets cancellation skip the callback", async () => {
    const view = render(<DatePickerHost />);
    const dispatch = vi.fn();
    const action = mapAction({ id: "pick", type: "Action.PickDate", props: { type: "date", onAction: { $handler: "chosen" } }, children: [] }, { dispatch })!;
    let pending: unknown;
    act(() => { pending = action.onAction?.(); });
    expect(dispatch).not.toHaveBeenCalled();
    const input = view.getByLabelText("Date");
    fireEvent.change(input, { target: { value: "2026-10-13" } });
    fireEvent.click(view.getByText("Choose Date"));
    await pending;
    expect(dispatch).toHaveBeenCalledWith({ $handler: "chosen" }, [{ date: new Date("2026-10-13T00:00:00").toISOString() }]);
    dispatch.mockClear();
    act(() => { pending = action.onAction?.(); });
    fireEvent.click(view.getByText("Cancel"));
    await pending;
    expect(dispatch).not.toHaveBeenCalled();
  });
});
