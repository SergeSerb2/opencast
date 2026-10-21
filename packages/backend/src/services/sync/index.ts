import type { Service } from "../../context";
import { SyncEngine, syncMigration } from "./engine";
import { decodeSetupCode } from "./setup-code";

export const syncService: Service = {
  name: "sync",
  register(ctx) {
    ctx.db.addMigrations(syncMigration);
    const engine = new SyncEngine(ctx);
    ctx.rpc.handleAll({
      "sync.status": () => engine.status(),
      "sync.probe": options => engine.probe(options),
      "sync.setupCode": () => engine.setupCode(),
      "sync.parseSetupCode": options => decodeSetupCode(options.code),
      "sync.connect": options => engine.connect(options),
      "sync.disconnect": options => engine.disconnect(options.forgetKeys),
      "sync.now": () => engine.now(),
      "sync.devices": () => engine.devices(),
      "sync.removeDevice": options => engine.removeDevice(options.deviceId),
      "sync.setCategoryEnabled": options => engine.setCategoryEnabled(options.category, options.enabled),
      "sync.wipeRemote": options => engine.wipeRemote(options.confirm),
    });
    ctx.onReady(() => engine.ready());
    ctx.onShutdown(() => engine.shutdown());
  },
};
