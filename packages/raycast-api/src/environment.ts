import { initialization } from "./bridge";
export const LaunchType = { UserInitiated: "userInitiated", Background: "background" } as const;
export const PopToRootType = { Default: "default", Immediate: "immediate", Suspended: "suspended" } as const;
const restricted = new Map<unknown, "ai" | "browser">();
export function setCapability(group: "ai" | "browser", api: Record<string, unknown>): void {
  restricted.set(api, group);
  for (const value of Object.values(api)) restricted.set(value, group);
}
export const environment = {
  raycastVersion: "2.7.3",
  get extensionName() { return initialization.extensionName; },
  get entryPointName() { return initialization.commandName; },
  get commandName() { return initialization.commandName; },
  get entryPointMode() { return initialization.mode; },
  get commandMode() { return initialization.mode; },
  get ownerOrAuthorName() { return initialization.ownerOrAuthorName; },
  get entryPointType() { return initialization.entryPointType; },
  get assetsPath() { return initialization.assetsPath; },
  get supportPath() { return initialization.supportPath; },
  get isDevelopment() { return initialization.isDevelopment; },
  get appearance() { return initialization.appearance; },
  get theme() { return initialization.appearance; },
  textSize: "medium",
  get launchType() { return initialization.launchProps.launchType ?? LaunchType.UserInitiated; },
  get launchContext() { return initialization.launchProps.launchContext; },
  canAccess(api: unknown) {
    const group = restricted.get(api);
    if (group === "browser") return false;
    if (group === "ai" || (typeof api === "string" && /^(openai|anthropic|google|xai|groq|gateway|perplexity|mistral)[-_]/.test(api))) return initialization.aiAvailable;
    return true;
  },
};
export function getPreferenceValues<T = Record<string, unknown>>(): T { return { ...initialization.preferences } as T; }
export const preferences = new Proxy({} as Record<string, unknown>, { get: (_t, key: string) => initialization.preferences[key], ownKeys: () => Object.keys(initialization.preferences), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
