import { createContext } from "react";

/** Lets Action.SubmitForm (and the extension renderer) read the current form values. */
export interface FormValuesApi {
  getValues: () => Record<string, unknown>;
}

export const FormValuesContext = createContext<FormValuesApi | null>(null);
