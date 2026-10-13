import { describe, expect, it } from "vitest";
import {
  offsetDate,
  renderTemplate,
  templateArguments,
} from "../../src/services/core/placeholders";
describe("dynamic placeholders", () => {
  it("applies modifiers in order and memoizes clipboard reads", async () => {
    let reads = 0;
    const value = await renderTemplate(
      "{clipboard | trim | uppercase} / {clipboard} / {clipboard offset=1}",
      {
        clipboard: async (n) => {
          reads++;
          return n ? "older" : "  hello  ";
        },
      },
    );
    expect(value.text).toBe("HELLO /   hello   / older");
    expect(reads).toBe(2);
  });
  it("encodes URL values and respects raw and repeated named arguments", async () => {
    const template =
      'https://example.com/{argument name="Name" default="World"}?q={query}&again={argument name="Name"}&raw={clipboard | raw}';
    const resolved = await renderTemplate(template, {
      url: true,
      query: "café & tea",
      arguments: { Name: "A/B" },
      clipboard: async () => "a+b",
    });
    expect(resolved.text).toBe(
      "https://example.com/A%2FB?q=caf%C3%A9%20%26%20tea&again=A%2FB&raw=a+b",
    );
    expect(resolved.arguments.map((a) => a.name)).toEqual(["Name", "query"]);
  });
  it("supports quoted braces and escaped option delimiters", async () => {
    const result = await renderTemplate(
      '{argument name="Name" default="{hello}" options="A\\,B,{hello}"}',
    );
    expect(result.text).toBe("{hello}");
    expect(result.arguments[0].options).toEqual(["A,B", "{hello}"]);
  });
  it("formats dates and sequential offsets in local calendar time", async () => {
    const now = new Date(2026, 9, 13, 17, 4, 5);
    const value = await renderTemplate(
      '{date format="yyyy-MM-dd" offset="+2d -2h"} {time format="HH:mm"} {day}',
      { now },
    );
    expect(value.text).toBe("2026-10-15 17:04 Tuesday");
    expect(offsetDate(now, "+1M").getMonth()).toBe(10);
  });
  it("reports cursor distance in Unicode characters and rejects multiple cursors", async () => {
    expect(await renderTemplate("😀{cursor}tail")).toMatchObject({
      text: "😀tail",
      cursorOffset: 4,
    });
    await expect(renderTemplate("{cursor}{cursor}")).rejects.toThrow(
      "Only one cursor",
    );
  });
  it("supports legacy query defaults, selection, snippet references and UUID reuse", async () => {
    const result = await renderTemplate(
      "{query:hello world}/{selection}/{snippet name=Signature}/{uuid}/{uuid}",
      {
        url: true,
        selection: async () => "selected",
        snippet: async () => "Signed",
      },
    );
    const values = result.text.split("/");
    expect(values.slice(0, 3)).toEqual(["hello%20world", "selected", "Signed"]);
    expect(values[3]).toBe(values[4]);
  });
  it("rejects too many distinct arguments, unknown modifiers and invalid offsets", async () => {
    expect(() =>
      templateArguments(
        "{argument name=a}{argument name=b}{argument name=c}{argument name=d}",
      ),
    ).toThrow("three");
    await expect(renderTemplate("{clipboard | execute}")).rejects.toThrow(
      "modifier",
    );
    await expect(renderTemplate("{clipboard offset=-1}")).rejects.toThrow(
      "nonnegative",
    );
    await expect(renderTemplate('{date offset="tomorrow"}')).rejects.toThrow(
      "offset",
    );
  });
  it("preserves ordinary braces and incomplete placeholders", async () => {
    expect((await renderTemplate("x {ordinary} {date\nunfinished}")).text).toBe(
      "x {ordinary} {date\nunfinished}",
    );
  });
});

describe("argument compatibility", () => {
  it("assigns consistent anonymous fields after named fields and ignores blank dropdown options", async () => {
    const value = await renderTemplate(
      '{argument name="Named"} {argument name="" options=""}',
      { arguments: { Named: "first", argument2: "second" } },
    );
    expect(value.text).toBe("first second");
    expect(value.arguments.map((a) => a.name)).toEqual(["Named", "argument2"]);
    expect(value.arguments[1].options).toEqual([]);
  });
});
