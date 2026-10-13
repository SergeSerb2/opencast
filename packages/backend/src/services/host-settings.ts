import type { Service } from "../context";
/** Host preferences are reapplied at startup and after both local and synced changes. */
export const hostSettingsService: Service = {
  name: "host-settings",
  register(ctx) {
    const apply = () => ctx.native.call("app.configure", { settings: ctx.settings.getAll(),
      developmentActive: ctx.dev || ctx.entities.list<{ source?: string }>("extensions").some(e => e.data.source === "development") });
    let queue = Promise.resolve();
    const refresh = () => queue = queue.then(apply).catch(() => { ctx.log.warn("Native preferences could not be applied"); });
    ctx.onReady(refresh);
    ctx.onShutdown(ctx.settings.onChange(() => { void refresh(); }));
    ctx.onShutdown(ctx.entities.onChange(change => { if (change.collection === "extensions") void refresh(); }));
    ctx.onShutdown(() => queue);
  },
};
