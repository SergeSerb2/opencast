import type { MockArea, MockContext } from "./types";

/** Mock backend for store catalog and installed extensions. */
export function createStoreMock(_ctx: MockContext): MockArea {
  return { handlers: {} };
}
