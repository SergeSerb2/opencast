import { describe, expect, it } from "vitest";
import { moveGridSelection, moveSelection, reconcileSelection } from "../components/List/navigation";

// header, item, item, header, item(disabled), item
const selectable = [false, true, true, false, false, true];

describe("moveSelection", () => {
  it("skips headers and disabled rows without wrapping", () => {
    expect(moveSelection(selectable, 1, "down")).toBe(2);
    expect(moveSelection(selectable, 2, "down")).toBe(5);
    expect(moveSelection(selectable, 5, "down")).toBe(5);
    expect(moveSelection(selectable, 1, "up")).toBe(1);
  });

  it("jumps by page size and to the ends", () => {
    expect(moveSelection(selectable, 1, "pageDown", 2)).toBe(5);
    expect(moveSelection(selectable, 5, "pageUp", 10)).toBe(1);
    expect(moveSelection(selectable, 2, "first")).toBe(1);
    expect(moveSelection(selectable, 1, "last")).toBe(5);
  });

  it("recovers from an invalid current index", () => {
    expect(moveSelection(selectable, -1, "down")).toBe(1);
    expect(moveSelection(selectable, -1, "up")).toBe(5);
    expect(moveSelection([false], 0, "down")).toBe(-1);
  });
});

describe("reconcileSelection", () => {
  const ids = [null, "a", "b", null, "c", "d"];
  it("keeps the same id, else the nearest row above", () => {
    expect(reconcileSelection(ids, selectable, "b", 1)).toBe(2);
    expect(reconcileSelection(ids, selectable, "gone", 4)).toBe(2);
    expect(reconcileSelection(ids, selectable, null, -1)).toBe(1);
  });
});

describe("moveGridSelection", () => {
  const sections = [
    { count: 5, columns: 4 },
    { count: 3, columns: 2 },
  ];
  it("moves in 2D across sections", () => {
    expect(moveGridSelection(sections, 0, "right")).toBe(1);
    expect(moveGridSelection(sections, 1, "down")).toBe(4); // row 2 has one item
    expect(moveGridSelection(sections, 3, "down")).toBe(4);
    expect(moveGridSelection(sections, 4, "down")).toBe(5); // into next section, column 0
    expect(moveGridSelection(sections, 6, "down")).toBe(7);
    expect(moveGridSelection(sections, 5, "up")).toBe(4);
    expect(moveGridSelection(sections, 7, "down")).toBe(7);
    expect(moveGridSelection(sections, 0, "left")).toBe(0);
  });
});
