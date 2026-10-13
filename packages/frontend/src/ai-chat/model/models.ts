import type { AIModelOption, ModelRef } from "@surgecast/protocol";

/** The model to use: the explicit choice when it is still available, else the configured default, else the first model. */
export function resolveModelRef(models: readonly AIModelOption[], ...preferences: (ModelRef | null | undefined)[]): ModelRef | undefined {
  for (const ref of preferences) if (ref && models.some((m) => m.ref === ref)) return ref;
  return models[0]?.ref;
}

export function findModel(models: readonly AIModelOption[] | undefined, ref: ModelRef | null | undefined): AIModelOption | undefined {
  return ref ? models?.find((m) => m.ref === ref) : undefined;
}

/** Display name for a model ref, falling back to the wire id when the model is gone. */
export function modelName(models: readonly AIModelOption[] | undefined, ref: ModelRef | null | undefined): string {
  if (!ref) return "No Model";
  return findModel(models, ref)?.name ?? ref.slice(ref.indexOf("/") + 1);
}

export function groupByProvider(models: readonly AIModelOption[]): { providerId: string; providerName: string; models: AIModelOption[] }[] {
  const groups = new Map<string, { providerId: string; providerName: string; models: AIModelOption[] }>();
  for (const model of models) {
    const group = groups.get(model.providerId) ?? { providerId: model.providerId, providerName: model.providerName, models: [] };
    group.models.push(model);
    groups.set(model.providerId, group);
  }
  return [...groups.values()];
}

export const CAPABILITY_BADGES = [
  { key: "vision", icon: "eye-16", label: "Vision" },
  { key: "tools", icon: "hammer-16", label: "Tools" },
  { key: "reasoning", icon: "light-bulb-16", label: "Reasoning" },
] as const;
