import { access, readFile, stat } from "node:fs/promises";
import { join, resolve, isAbsolute, relative } from "node:path";
import type { InstalledExtension, ExtensionCommandManifest, ExtensionPreference, ExtensionToolManifest } from "@opencast/protocol";
export interface Manifest {
  name: string; title: string; description?: string; author: string; owner?: string; icon?: string; version?: string;
  commands: ExtensionCommandManifest[]; tools?: (ExtensionToolManifest & { input?: Record<string, unknown>; confirmation?: boolean })[];
  preferences?: ExtensionPreference[];
  ai?: { instructions?: string; tools?: Record<string, Record<string, unknown>> | { name: string; input?: Record<string, unknown> }[] };
  [key: string]: unknown;
}
export function safeName(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/.test(value) || value.includes("..")) throw new Error("Invalid extension or entrypoint name");
  return value;
}
export function within(root: string, path: string): string {
  const full = resolve(root, path); const rel = relative(resolve(root), full);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Extension path escapes its directory");
  return full;
}
function preferences(input: unknown): void {
  if (input === undefined) return;
  if (!Array.isArray(input)) throw new Error("Extension preferences must be an array");
  const names = new Set<string>();
  for (const pref of input) {
    if (!pref || typeof pref.name !== "string" || !pref.name || !["textfield", "password", "checkbox", "dropdown", "appPicker", "file", "directory"].includes(pref.type)) throw new Error("Invalid extension preference");
    if (names.has(pref.name)) throw new Error(`Duplicate preference: ${pref.name}`);
    names.add(pref.name);
    if (pref.type === "dropdown" && (!Array.isArray(pref.data) || !pref.data.length)) throw new Error(`Dropdown preference needs options: ${pref.name}`);
  }
}
export function validateManifest(value: unknown): Manifest {
  if (!value || typeof value !== "object") throw new Error("Extension manifest must be an object");
  const manifest = { ...value, author: (value as Manifest).author ?? "local" } as Manifest;
  safeName(manifest.name);
  if (typeof manifest.title !== "string" || !manifest.title.trim() || typeof manifest.author !== "string") throw new Error("Extension manifest needs title and author");
  if (!Array.isArray(manifest.commands) || (!manifest.commands.length && !manifest.tools?.length)) throw new Error("Extension manifest needs commands or tools");
  preferences(manifest.preferences);
  const names = new Set<string>();
  for (const command of manifest.commands) {
    safeName(command.name);
    if (names.has(command.name)) throw new Error(`Duplicate command: ${command.name}`);
    names.add(command.name);
    if (!["view", "no-view", "menu-bar"].includes(command.mode) || typeof command.title !== "string") throw new Error(`Invalid command: ${command.name}`);
    if (command.arguments && (!Array.isArray(command.arguments) || command.arguments.some((arg) => typeof arg.name !== "string" || !["text", "password", "dropdown"].includes(arg.type)))) throw new Error(`Invalid command arguments: ${command.name}`);
    preferences(command.preferences);
    if (command.interval && !parseInterval(command.interval)) throw new Error(`Invalid refresh interval: ${command.interval}`);
  }
  const tools = new Set<string>();
  for (const tool of manifest.tools ?? []) { safeName(tool.name); if (tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`); tools.add(tool.name); }
  return manifest;
}
export function parseInterval(value?: string): number | undefined {
  const match = value?.match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/);
  if (!match) return undefined;
  const ms = Number(match[1]) * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]] ?? 0);
  return Number.isFinite(ms) && ms >= 10000 && ms <= 2147483647 ? ms : undefined;
}
export async function readManifest(path: string): Promise<Manifest> { return validateManifest(JSON.parse(await readFile(join(path, "package.json"), "utf8"))); }
export async function builtRoot(path: string): Promise<{ root: string; manifest: Manifest }> {
  const root = resolve(path);
  let manifest: Manifest;
  try { manifest = await readManifest(root); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const dist = join(root, "dist");
    const manifest = await readManifest(dist);
    for (const entry of [...manifest.commands.map((x) => `${x.name}.js`), ...(manifest.tools ?? []).map((x) => `tools/${x.name}.js`)]) await access(join(dist, entry));
    return { root: dist, manifest };
  }
  const entries = [...manifest.commands.map((x) => `${x.name}.js`), ...(manifest.tools ?? []).map((x) => `tools/${x.name}.js`)];
  const allPresent = await Promise.all(entries.map((x) => access(join(root, x)).then(() => true, () => false)));
  if (allPresent.every(Boolean)) return { root, manifest };
  const dist = join(root, "dist");
  if (await stat(dist).then((s) => s.isDirectory(), () => false)) {
    const distManifest = await readManifest(dist).catch((error) => { if ((error as NodeJS.ErrnoException).code === "ENOENT") return manifest; throw error; });
    for (const entry of entries) await access(join(dist, entry)).catch(() => { throw new Error(`Missing built entry point: ${entry}. Build the extension first.`); });
    return { root: dist, manifest: distManifest };
  }
  throw new Error(`Missing built entry points: ${entries.filter((_x, i) => !allPresent[i]).join(", ")}. Build the extension first.`);
}
export function installed(manifest: Manifest, source: InstalledExtension["source"], previous?: InstalledExtension): InstalledExtension {
  return { name: manifest.name, title: manifest.title, description: manifest.description, author: manifest.author, owner: manifest.owner, icon: manifest.icon, version: manifest.version, source, commands: manifest.commands, tools: manifest.tools ?? [], preferences: manifest.preferences ?? [], aiInstructions: manifest.ai?.instructions, enabled: previous?.enabled ?? true, installedAt: previous?.installedAt ?? Date.now(), updatedAt: Date.now() };
}
