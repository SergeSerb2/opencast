import { cp, mkdir, mkdtemp, readdir, rename, rm, lstat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { InstalledExtension } from "@surgecast/protocol";
import type { AppContext } from "../../context";
import { builtRoot, installed, safeName } from "./manifest";
import { extractArchive } from "./archive";
import { ExtensionStoreClient } from "./store";
import type { ExtensionRecord } from "./preferences";
export class ExtensionInstaller {
  readonly store = new ExtensionStoreClient();
  private readonly operations = new Map<string, Promise<unknown>>();
  constructor(private readonly ctx: AppContext) {}
  list(): ExtensionRecord[] {
    return this.ctx.entities.list<ExtensionRecord>("extensions").map((x) => {
      const device = this.ctx.entities.get<{ path: string }>("localState", `ext:${x.id}:install`)?.data;
      return { ...x.data, path: device?.path };
    });
  }
  get(name: string): ExtensionRecord {
    safeName(name); const record = this.list().find((x) => x.name === name);
    if (!record) throw new Error(`Extension is not installed: ${name}`);
    return record;
  }
  async install(source: { source: "store"; idOrSlug: string } | { source: "local"; path: string } | { source: "development"; path: string }): Promise<InstalledExtension> {
    const base = join(this.ctx.dataDir, "extensions"); await mkdir(base, { recursive: true });
    const staging = await mkdtemp(join(base, ".install-"));
    try {
      let root: string; let manifest; let storeId: string | undefined; let version: string | undefined;
      if (source.source === "store") {
        const download = await this.store.download(source.idOrSlug);
        const unpack = join(staging, "unpack"); await mkdir(unpack); await extractArchive(download.bytes, unpack);
        const entries = await readdir(unpack);
        const location = entries.includes("package.json") ? unpack : entries.length === 1 ? join(unpack, entries[0]) : undefined;
        if (!location) throw new Error("Extension archive has no package.json at root or in a single enclosing folder");
        ({ root, manifest } = await builtRoot(location)); storeId = download.item.id; version = download.item.version;
      } else ({ root, manifest } = await builtRoot(source.path));
      safeName(manifest.name);
      const operation = async () => {
        const previous = this.ctx.entities.get<ExtensionRecord>("extensions", manifest.name)?.data;
        const extension = { ...installed(manifest, source.source, previous), preferenceValues: previous?.preferenceValues, id: storeId ?? previous?.id, version: version ?? manifest.version };
        const target = join(base, manifest.name), backup = join(staging, "backup"), next = join(staging, "next");
        let backedUp = false; let moved = false;
        const devicePath = source.source === "development" ? root : target;
        if (source.source !== "development") {
          await safeCopy(root, next);
          // Source projects sometimes put the manifest next to dist, not in it.
          await writeFile(join(next, "package.json"), JSON.stringify(manifest, null, 2));
          try { await rename(target, backup); backedUp = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
          try { await rename(next, target); moved = true; } catch (error) { if (backedUp) await rename(backup, target); throw error; }
        }
        try {
          this.ctx.db.transaction(() => {
            this.ctx.entities.put("extensions", extension.name, extension);
            this.ctx.entities.put("localState", `ext:${extension.name}:install`, { path: devicePath, sourcePath: source.source === "store" ? undefined : resolve(source.path) });
          });
        } catch (error) { if (moved) await rm(target, { recursive: true, force: true }); if (backedUp) await rename(backup, target); throw error; }
        this.changed();
        return { ...extension, path: devicePath };
      };
      const previousOperation = this.operations.get(manifest.name) ?? Promise.resolve();
      const task = previousOperation.catch(() => {}).then(operation);
      this.operations.set(manifest.name, task);
      try { return await task; } finally { if (this.operations.get(manifest.name) === task) this.operations.delete(manifest.name); }
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  async uninstall(name: string): Promise<void> {
    await this.operations.get(name)?.catch(() => {});
    const extension = this.get(name);
    // Development source directories belong to the developer; remove only our install.
    if (extension.source !== "development") await rm(join(this.ctx.dataDir, "extensions", safeName(name)), { recursive: true, force: true });
    for (const pref of [...extension.preferences, ...extension.commands.flatMap((x) => x.preferences ?? [])]) if (pref.type === "password") await this.ctx.secrets.delete(`ext:${name}:pref:${pref.name}`);
    const fields = this.ctx.entities.get<{ ids: string[] }>("localState", `ext:${name}:formPasswords`)?.data.ids ?? [];
    for (const fieldId of fields) await this.ctx.secrets.delete(`ext:${name}:form:${fieldId}`);
    this.ctx.entities.delete("localState", `ext:${name}:formPasswords`);
    const oauth = this.ctx.entities.get<{ ids: string[] }>("localState", `ext:${name}:oauthProviders`)?.data.ids ?? [];
    for (const providerId of oauth) await this.ctx.secrets.delete(`oauth:${name}:${providerId}`);
    this.ctx.entities.delete("localState", `ext:${name}:oauthProviders`);
    this.ctx.entities.delete("extensions", name); this.ctx.entities.delete("localState", `ext:${name}:install`); this.changed();
  }
  changed(): void { this.ctx.commands.invalidate("extensions"); this.ctx.events.emit("extensions.changed", {}); }
}
async function safeCopy(source: string, target: string): Promise<void> {
  const metadata = await lstat(source);
  if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) throw new Error(`Extension contains an unsupported file: ${basename(source)}`);
  if (metadata.isDirectory()) {
    await mkdir(target, { recursive: true });
    for (const name of await readdir(source)) await safeCopy(join(source, name), join(target, name));
  } else await cp(source, target);
}
