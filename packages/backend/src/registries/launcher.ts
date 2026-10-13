import type { BackendEvents, ToastState } from "@surgecast/protocol";
import type { LauncherApi } from "../context";
import type { EventBus } from "../events";
import type { NativeApi } from "../native/client";

export class DefaultLauncherApi implements LauncherApi {
  constructor(
    private readonly events: EventBus,
    private readonly native: NativeApi,
  ) {}

  toast(toast: ToastState | null): void {
    this.events.emit("launcher.toast", { toast });
  }

  async hud(text: string): Promise<void> {
    await this.native.call("window.hide", { kind: "main", restoreFocus: true }).catch(() => undefined);
    await this.native.call("hud.show", { text }).catch(() => undefined);
  }

  navigate(action: BackendEvents["launcher.navigate"]): void {
    this.events.emit("launcher.navigate", action);
  }
}
