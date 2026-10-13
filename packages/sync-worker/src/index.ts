import { handleRequest, collectTombstones, type Env } from "./handler";
export { SyncNotifier } from "./notifier";
export default {
  fetch: handleRequest,
  async scheduled(_event: ScheduledController, env: Env): Promise<void> { await collectTombstones(env); },
} satisfies ExportedHandler<Env>;
