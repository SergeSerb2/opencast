import data from "emojibase-data/en/data.json";
import type { EmojiItem } from "@opencast/protocol";
import type { Service } from "../../context";
import { fuzzyMatch } from "./ranking";
import { RpcError } from "../../util/errors";
interface Entry {
  label: string;
  emoji: string;
  tags?: string[];
  group?: number;
  order?: number;
  skins?: { emoji: string; tone?: number | number[] }[];
}
const categories = [
  "Smileys & Emotion",
  "People & Body",
  "Components",
  "Animals & Nature",
  "Food & Drink",
  "Travel & Places",
  "Activities",
  "Objects",
  "Symbols",
  "Flags",
];
const entries = (data as Entry[])
  .filter((e) => e.group !== undefined)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const emojiService: Service = {
  name: "core.emoji",
  register(ctx) {
    ctx.db.addMigrations({
      id: "core-emoji-use-001",
      up: "CREATE TABLE emoji_use (emoji TEXT PRIMARY KEY, count INTEGER NOT NULL, last_used INTEGER NOT NULL)",
    });
    const item = (entry: Entry): EmojiItem => {
      const tone = ctx.settings.get("emoji.skinTone");
      const skin = entry.skins?.find((s) => s.tone === tone);
      return {
        emoji: skin?.emoji ?? entry.emoji,
        name: entry.label,
        keywords: entry.tags ?? [],
        category: categories[entry.group!] ?? "Other",
        skins: entry.skins?.map((s) => s.emoji),
      };
    };
    ctx.rpc.handleAll({
      "emoji.search": ({ query = "", category }) => {
        const selected = entries
          .filter(
            (e) =>
              !category ||
              category === String(e.group) ||
              category.toLowerCase() ===
                (categories[e.group!] ?? "Other").toLowerCase(),
          )
          .flatMap((e) => {
            const match = query.trim()
              ? Math.max(
                  fuzzyMatch(query, e.label)?.score ?? -Infinity,
                  ...(e.tags ?? []).map(
                    (t) => fuzzyMatch(query, t)?.score ?? -Infinity,
                  ),
                )
              : 0;
            return Number.isFinite(match) || e.emoji === query
              ? [{ item: item(e), score: match }]
              : [];
          })
          .sort((a, b) => b.score - a.score);
        const map = new Map<string, EmojiItem[]>();
        const frequently = ctx.db
          .all<{ emoji: string }>(
            "SELECT emoji FROM emoji_use ORDER BY count DESC,last_used DESC LIMIT 32",
          )
          .map(
            (r) =>
              selected.find(
                (e) =>
                  e.item.emoji === r.emoji || e.item.skins?.includes(r.emoji),
              )?.item,
          )
          .filter((e): e is EmojiItem => !!e);
        if (frequently.length) map.set("Frequently Used", frequently);
        for (const { item: e } of selected) {
          const key = query.trim() ? "Results" : e.category;
          const bucket = map.get(key) ?? [];
          bucket.push(e);
          map.set(key, bucket);
        }
        return {
          sections: [...map].map(([title, items]) => ({ title, items })),
        };
      },
      "emoji.recordUse": ({ emoji }) => {
        if (
          !entries.some(
            (e) => e.emoji === emoji || e.skins?.some((s) => s.emoji === emoji),
          )
        )
          throw RpcError.invalidParams("Unknown emoji");
        ctx.db.run(
          "INSERT INTO emoji_use VALUES (?,1,?) ON CONFLICT(emoji) DO UPDATE SET count=count+1,last_used=excluded.last_used",
          emoji,
          Date.now(),
        );
      },
    });
  },
};
