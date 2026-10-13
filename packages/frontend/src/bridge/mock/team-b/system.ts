import type { MockArea, MockContext } from "./types";

/** Mock backend for window layouts, menu items, calendar events, processes. */
export function createSystemMock(_ctx: MockContext): MockArea {
  return { handlers: {} };
}
