import type { MockArea, MockContext } from "./types";

/** Mock backend for import/export and storage. */
export function createDataMock(_ctx: MockContext): MockArea {
  return { handlers: {} };
}
