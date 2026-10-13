import { describe, expect, it } from "vitest";
import { NoteHistory } from "../lib/history";
import { parseNotesRoute } from "../lib/routes";
import { clampZoom, zoomIn, zoomOut } from "../lib/zoom";

describe("NoteHistory", () => {
  it("goes back and forward and drops forward entries on a new visit", () => {
    const history = new NoteHistory();
    for (const id of ["a", "b", "c"]) history.visit(id);
    expect(history.back()).toBe("b");
    expect(history.back()).toBe("a");
    expect(history.canGoBack).toBe(false);
    expect(history.forward()).toBe("b");
    history.visit("d");
    expect(history.canGoForward).toBe(false);
    expect(history.back()).toBe("b");
  });

  it("ignores repeated visits and keeps at most the limit", () => {
    const history = new NoteHistory(3);
    for (const id of ["a", "a", "b", "c", "d"]) history.visit(id);
    expect(history.back()).toBe("c");
    expect(history.back()).toBe("b");
    expect(history.back()).toBeNull();
  });

  it("forgets deleted notes and merges the neighbours", () => {
    const history = new NoteHistory();
    for (const id of ["a", "b", "a", "c"]) history.visit(id);
    history.remove("b");
    expect(history.back()).toBe("a");
    expect(history.canGoBack).toBe(false);
    history.remove("a");
    expect(history.canGoBack).toBe(false);
    expect(history.canGoForward).toBe(false);
  });
});

describe("parseNotesRoute", () => {
  it("opens notes by id", () => {
    expect(parseNotesRoute("1F2E-ab")).toEqual({ kind: "open", id: "1F2E-ab" });
    expect(parseNotesRoute("note:xyz")).toEqual({ kind: "open", id: "xyz" });
    expect(parseNotesRoute("", { id: "p1" })).toEqual({ kind: "open", id: "p1" });
    expect(parseNotesRoute(undefined, { noteId: "p2" })).toEqual({ kind: "open", id: "p2" });
  });

  it("starts new notes, optionally with text", () => {
    expect(parseNotesRoute("new")).toEqual({ kind: "new", text: undefined });
    expect(parseNotesRoute("create", { text: "hello" })).toEqual({ kind: "new", text: "hello" });
    expect(parseNotesRoute("", { content: "hi" })).toEqual({ kind: "new", text: "hi" });
  });

  it("just shows the window otherwise", () => {
    expect(parseNotesRoute("")).toEqual({ kind: "show" });
    expect(parseNotesRoute("show")).toEqual({ kind: "show" });
    expect(parseNotesRoute("command:builtin:notes.open")).toEqual({ kind: "show" });
    expect(parseNotesRoute(null, "not an object")).toEqual({ kind: "show" });
  });
});

describe("zoom", () => {
  it("steps by 5% within 75–200%", () => {
    expect(zoomIn(1)).toBe(1.05);
    expect(zoomOut(1)).toBe(0.95);
    expect(zoomIn(2)).toBe(2);
    expect(zoomOut(0.75)).toBe(0.75);
    expect(zoomIn(1.1)).toBe(1.15);
    expect(clampZoom(undefined)).toBe(1);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(5)).toBe(2);
  });
});
