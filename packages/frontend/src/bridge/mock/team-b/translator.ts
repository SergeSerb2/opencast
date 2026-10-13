import type { MockArea, MockContext } from "./types";

/** Mock backend for translations through ai.ask. */
export function createTranslatorMock(_ctx: MockContext): MockArea {
  return { handlers: {} };
}
