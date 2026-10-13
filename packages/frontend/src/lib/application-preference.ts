/** The backend resolves application preferences to AppInfo; controls submit identifiers. */
export function applicationPreferenceValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const app = value as { path?: unknown; bundleId?: unknown };
    if (typeof app.path === "string") return app.path;
    if (typeof app.bundleId === "string") return app.bundleId;
  }
  return "";
}
