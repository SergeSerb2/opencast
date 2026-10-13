import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FormValuesContext } from "./form-context";

interface FormState {
  values: Record<string, unknown>;
  setValue: (id: string, value: unknown) => void;
  /** Register a field's initial value (uncontrolled) once. */
  register: (id: string, initial: unknown) => void;
  /** Id of the field that should take focus first. */
  firstFieldId: string | null;
}

const FormStateContext = createContext<FormState | null>(null);

/** Holds uncontrolled field values keyed by field id; controlled fields report through onChange. */
export function FormProvider({ children, onValuesChange }: { children: ReactNode; onValuesChange?: (values: Record<string, unknown>) => void }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const order = useRef<string[]>([]);
  const [firstFieldId, setFirstFieldId] = useState<string | null>(null);

  const setValue = useCallback(
    (id: string, value: unknown) => {
      setValues((prev) => {
        const next = { ...prev, [id]: value };
        valuesRef.current = next;
        onValuesChange?.(next);
        return next;
      });
    },
    [onValuesChange],
  );

  const register = useCallback((id: string, initial: unknown) => {
    if (!order.current.includes(id)) {
      order.current.push(id);
      if (order.current.length === 1) setFirstFieldId(id);
    }
    setValues((prev) => {
      if (id in prev) return prev;
      const next = { ...prev, [id]: initial };
      valuesRef.current = next;
      return next;
    });
  }, []);

  const state = useMemo(() => ({ values, setValue, register, firstFieldId }), [values, setValue, register, firstFieldId]);
  const api = useMemo(() => ({ getValues: () => ({ ...valuesRef.current }) }), []);
  return (
    <FormValuesContext.Provider value={api}>
      <FormStateContext.Provider value={state}>{children}</FormStateContext.Provider>
    </FormValuesContext.Provider>
  );
}

/**
 * Value of a form field: controlled when `value` is defined, otherwise kept in
 * the form state (initialized from `defaultValue`).
 */
export function useFormField<T>(id: string, options: { value?: T; defaultValue?: T; fallback: T; onChange?: (value: T) => void }): { value: T; setValue: (value: T) => void; autoFocus: boolean } {
  const form = useContext(FormStateContext);
  const { value, defaultValue, fallback, onChange } = options;
  const [local, setLocal] = useState<T>(defaultValue ?? fallback);
  const initial = useRef(defaultValue ?? fallback);

  useEffect(() => {
    form?.register(id, value !== undefined ? value : initial.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Keep the form's copy of controlled values current (submit reads it).
  useEffect(() => {
    if (value !== undefined && form && form.values[id] !== value) form.setValue(id, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const stored = form ? (id in form.values ? (form.values[id] as T) : initial.current) : local;
  const current = value !== undefined ? value : stored;
  const setValue = useCallback(
    (next: T) => {
      if (value === undefined) {
        if (form) form.setValue(id, next);
        else setLocal(next);
      }
      onChange?.(next);
    },
    [form, id, value, onChange],
  );
  return { value: current, setValue, autoFocus: form?.firstFieldId === id };
}
