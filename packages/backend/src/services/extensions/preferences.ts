import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CommandPrefs, ExtensionPreference, InstalledExtension } from "@surgecast/protocol";
import type { AppContext } from "../../context";
export type ExtensionRecord = InstalledExtension & { preferenceValues?: Record<string, unknown> };
export function definitions(extension: InstalledExtension, command?: string): ExtensionPreference[] {
  const commandInfo = command ? extension.commands.find((x) => x.name === command) : undefined;
  if (command && !commandInfo) throw new Error(`Extension command not found: ${command}`);
  const preferences = new Map(extension.preferences.map((x) => [x.name, x]));
  for (const pref of commandInfo?.preferences ?? []) preferences.set(pref.name, pref);
  return [...preferences.values()];
}
function platformDefault(value: unknown) { return value && typeof value === "object" && "macOS" in value ? (value as any).macOS : value; }
export class ExtensionPreferences {
  constructor(private readonly ctx: AppContext) {}
  async get(extension: ExtensionRecord, command?: string): Promise<{ values: Record<string, unknown>; missingRequired: string[] }> {
    const ctx = this.ctx;
    const commandValues = command ? ctx.entities.get<CommandPrefs>("commandPrefs", `ext:${extension.name}.${command}`)?.data.preferences ?? {} : {};
    const values: Record<string, unknown> = {}; const missingRequired: string[] = [];
    for (const pref of definitions(extension, command)) {
      const secretKey = `ext:${extension.name}:pref:${pref.name}`;
      let value = pref.type === "password" ? await ctx.secrets.get(secretKey) ?? platformDefault(pref.default) : commandValues[pref.name] ?? extension.preferenceValues?.[pref.name] ?? platformDefault(pref.default);
      if (value !== undefined && value !== null && value !== "") {
        try { value = await this.validate(pref, value); } catch { value = undefined; }
      }
      if (pref.required && (value === undefined || value === null || value === "")) missingRequired.push(pref.name);
      if (value !== undefined && value !== null) values[pref.name] = value;
    }
    return { values, missingRequired };
  }
  async set(extension: ExtensionRecord, command: string | undefined, values: Record<string, unknown>): Promise<void> {
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Preference values must be an object");
    const defs = new Map(definitions(extension, command).map((x) => [x.name, x]));
    const prepared: [ExtensionPreference, unknown][] = [];
    for (const [name, value] of Object.entries(values)) {
      const pref = defs.get(name); if (!pref) throw new Error(`Unknown extension preference: ${name}`);
      prepared.push([pref, value === null || value === undefined || value === "" ? undefined : await this.validate(pref, value)]);
    }
    const previous = command ? this.ctx.entities.get<CommandPrefs>("commandPrefs", `ext:${extension.name}.${command}`)?.data ?? {} : undefined;
    const merged = { ...(previous?.preferences ?? extension.preferenceValues) };
    for (const [pref, value] of prepared) {
      if (pref.type === "password") {
        if (value === undefined) await this.ctx.secrets.delete(`ext:${extension.name}:pref:${pref.name}`);
        else await this.ctx.secrets.set(`ext:${extension.name}:pref:${pref.name}`, String(value));
        delete merged[pref.name];
      } else if (value === undefined) delete merged[pref.name]; else merged[pref.name] = value;
    }
    if (command) this.ctx.entities.put("commandPrefs", `ext:${extension.name}.${command}`, { ...previous, preferences: merged });
    else { const current = this.ctx.entities.get<ExtensionRecord>("extensions", extension.name)?.data ?? extension; this.ctx.entities.put("extensions", extension.name, { ...current, preferenceValues: merged }); }
  }
  private async validate(pref: ExtensionPreference, value: unknown): Promise<unknown> {
    switch (pref.type) {
      case "checkbox": if (typeof value !== "boolean") throw new Error(`Preference ${pref.name} must be a boolean`); break;
      case "dropdown": if (!pref.data?.some((x) => x.value === value)) throw new Error(`Invalid option for ${pref.name}`); break;
      case "appPicker": {
        const path = typeof value === "string" ? value : (value as any)?.path;
        if (typeof path !== "string") throw new Error(`Invalid application for ${pref.name}`);
        const apps = await this.ctx.native.call("apps.list", {});
        const app = apps.find((x) => x.path === path || x.bundleId === path);
        if (!app) throw new Error(`Application is not installed: ${pref.name}`);
        return app;
      }
      case "file": case "directory": {
        if (typeof value !== "string") throw new Error(`Preference ${pref.name} must be a path`);
        const path = value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
        const metadata = await stat(path);
        if (pref.type === "file" ? !metadata.isFile() : !metadata.isDirectory()) throw new Error(`Invalid path for ${pref.name}`);
        return path;
      }
      default: if (typeof value !== "string") throw new Error(`Preference ${pref.name} must be text`);
    }
    return value;
  }
}
