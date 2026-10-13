import type { MockArea, MockContext } from "./types";

/** Mock backend for AI commands and presets. */
export function createAiMock(_ctx: MockContext): MockArea {
  return { handlers: {} };
}
