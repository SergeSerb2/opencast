import { describe, expect, it } from "vitest";
import type { EmojiItem } from "@surgecast/protocol";
import { FREQUENTLY_USED, skinToneVariant, titleCase, unicodeCodePoints, visibleSections } from "./emoji-model";

const wave: EmojiItem = { emoji: "👋", name: "waving hand", keywords: [], category: "People & Body", skins: ["👋🏻", "👋🏼", "👋🏽", "👋🏾", "👋🏿"] };

describe("emoji model", () => {
  it("title-cases emojibase labels", () => {
    expect(titleCase("rolling on the floor laughing")).toBe("Rolling On The Floor Laughing");
    expect(titleCase("flag: united states")).toBe("Flag: United States");
  });

  it("picks single-tone variants and strips a default tone for None", () => {
    expect(skinToneVariant(wave, 3)).toBe("👋🏽");
    expect(skinToneVariant({ ...wave, emoji: "👋🏿" }, 0)).toBe("👋");
    const couple: EmojiItem = { emoji: "🧑‍🤝‍🧑", name: "people holding hands", keywords: [], category: "People & Body", skins: ["🧑🏻‍🤝‍🧑🏼", "🧑🏻‍🤝‍🧑🏻"] };
    expect(skinToneVariant(couple, 1)).toBe("🧑🏻‍🤝‍🧑🏻");
  });

  it("lists code points", () => {
    expect(unicodeCodePoints("😀")).toBe("U+1F600");
    expect(unicodeCodePoints("❤️")).toBe("U+2764 U+FE0F");
  });

  it("caps Frequently Used at two rows and hides it while searching", () => {
    const frequent = { title: FREQUENTLY_USED, items: Array.from({ length: 20 }, () => wave) };
    const people = { title: "People & Body", items: [wave] };
    expect(visibleSections([frequent, people], { query: "", filter: "all", columns: 8 }).map((s) => [s.title, s.items.length])).toEqual([
      [FREQUENTLY_USED, 16],
      ["People & Body", 1],
    ]);
    expect(visibleSections([frequent, people], { query: "wave", filter: "all", columns: 8 }).map((s) => s.title)).toEqual(["People & Body"]);
    expect(visibleSections([frequent, people], { query: "", filter: FREQUENTLY_USED, columns: 8 }).map((s) => [s.title, s.items.length])).toEqual([[FREQUENTLY_USED, 20]]);
  });
});
