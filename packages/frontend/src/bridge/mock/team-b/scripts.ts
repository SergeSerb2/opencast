import type { MockArea, MockContext } from "./types";

/** Mock backend for script commands and streamed executions. */
export function createScriptsMock(_ctx: MockContext): MockArea {
  return { handlers: {} };
}
