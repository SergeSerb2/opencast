import { describe, expect, it } from "vitest";
import { builtinCatalog } from "../../src/services/core/builtins";
import {
  SYSTEM_ACTIONS,
  WINDOW_COMMANDS,
} from "../../src/services/core/native-commands";
describe("built-in command catalog", () => {
  it("covers every native window and system action with unique stable IDs and command tiles", () => {
    const catalog = builtinCatalog();
    const ids = new Set(catalog.map((b) => b.command.id));
    expect(ids.size).toBe(catalog.length);
    for (const action of SYSTEM_ACTIONS)
      expect(ids.has(`builtin:system.${action}`)).toBe(true);
    for (const action of WINDOW_COMMANDS)
      expect(ids.has(`builtin:windowManagement.${action}`)).toBe(true);
    for (const { command } of catalog) {
      expect(command.typeLabel).toBe("Command");
      expect(command.icon).toHaveProperty("tile");
      expect(command.subtitle).toBeTruthy();
    }
  });
});
