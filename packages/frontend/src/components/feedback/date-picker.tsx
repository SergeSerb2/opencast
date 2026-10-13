import { useState } from "react";
import { create } from "zustand";
import { Button } from "../Button/Button";
import { Dialog, DialogField } from "../../settings/ui/Dialog";

interface DateRequest {
  type: "date" | "datetime";
  resolve: (date: Date | null) => void;
}
const useDatePicker = create<{ request: DateRequest | null }>(() => ({ request: null }));

export function pickDate(type: "date" | "datetime" = "datetime"): Promise<Date | null> {
  useDatePicker.getState().request?.resolve(null);
  return new Promise((resolve) => {
    const request: DateRequest = {
      type,
      resolve: (date) => {
        if (useDatePicker.getState().request === request) useDatePicker.setState({ request: null });
        resolve(date);
      },
    };
    useDatePicker.setState({ request });
  });
}

function DateDialog({ request }: { request: DateRequest }) {
  const [value, setValue] = useState("");
  // Date-only selections represent local midnight, like Form.DatePicker.
  const date = value ? new Date(request.type === "date" ? `${value}T00:00:00` : value) : null;
  const valid = date !== null && Number.isFinite(date.getTime());
  return (
    <Dialog title="Pick Date" onClose={() => request.resolve(null)} footer={
      <>
        <Button variant="ghost" onClick={() => request.resolve(null)}>Cancel</Button>
        <Button disabled={!valid} onClick={() => valid && request.resolve(date)}>Choose Date</Button>
      </>
    }>
      <DialogField label={request.type === "date" ? "Date" : "Date and Time"}>
        <input className="sc-field" type={request.type === "date" ? "date" : "datetime-local"} value={value} onChange={(event) => setValue(event.currentTarget.value)} />
      </DialogField>
    </Dialog>
  );
}

export function DatePickerHost() {
  const request = useDatePicker((state) => state.request);
  return request ? <DateDialog key={request.type} request={request} /> : null;
}
