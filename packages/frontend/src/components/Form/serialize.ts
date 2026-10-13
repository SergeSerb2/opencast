/**
 * Form values on the wire to the extension runtime: Dates become
 * `{ $date: iso }` (docs/EXTENSION-UI.md), undefined values are dropped,
 * everything else is JSON as is.
 */
export function serializeFormValues(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    out[key] = serializeValue(value);
  }
  return out;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(serializeValue);
  return value;
}

/** Inverse for props coming from the runtime (`{ $date }` → Date). */
export function deserializeValue(value: unknown): unknown {
  if (value && typeof value === "object" && "$date" in value && typeof (value as { $date: unknown }).$date === "string") {
    const date = new Date((value as { $date: string }).$date);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (Array.isArray(value)) return value.map(deserializeValue);
  return value;
}
