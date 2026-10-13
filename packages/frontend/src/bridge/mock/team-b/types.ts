import type { BackendEvents, BackendMethod, BackendParams, BackendResult, CommandInfo, LaunchResult } from "@opencast/protocol";
import type { Emitter } from "../../emitter";

/** Partial mock implementation of `BackendMethods`. */
export type MockHandlers = { [M in BackendMethod]?: (params: BackendParams<M>) => BackendResult<M> | Promise<BackendResult<M>> };

export interface MockContext {
  events: Emitter<BackendEvents>;
  /**
   * The mock's live command list (root search, `commands.list`). Filled after
   * the areas are created; areas may add or remove entries at runtime (then
   * emit `commands.changed`).
   */
  commands?: CommandInfo[];
}

/** Returns a LaunchResult for commands this area owns, or undefined to fall through. */
export type MockLauncher = (command: CommandInfo, args?: Record<string, string>, fallbackText?: string) => LaunchResult | undefined;

export interface MockArea {
  handlers: MockHandlers;
  launch?: MockLauncher;
  /** Extra root-search commands this area contributes (e.g. script commands). */
  commands?: CommandInfo[];
}
