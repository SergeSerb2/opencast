import type { MockArea, MockContext } from "./types";

/** Mock backend for themes. */
export function createThemeMock(_ctx: MockContext): MockArea {
  return { handlers: {} };
}
