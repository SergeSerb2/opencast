import type { CommandInfo, RootSearchItem } from "@surgecast/protocol";

function normalized(value: string): { text: string; positions: number[] } {
  let text = "";
  const positions: number[] = [];
  for (let index = 0; index < value.length; ) {
    const char = String.fromCodePoint(value.codePointAt(index)!);
    const folded = char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    text += folded;
    for (let i = 0; i < folded.length; i++) positions.push(index);
    index += char.length;
  }
  return { text, positions };
}
export function fuzzyMatch(
  query: string,
  value: string,
  sensitivity: "low" | "medium" | "high" = "high",
): { score: number; matches: [number, number][] } | null {
  const q = normalized(query.trim()).text;
  const v = normalized(value);
  if (!q) return { score: 0, matches: [] };
  let indexes: number[] = [];
  let score = 0;
  const at = v.text.indexOf(q);
  if (at >= 0) {
    indexes = Array.from({ length: q.length }, (_, i) => at + i);
    score = v.text === q ? 1000 : at === 0 ? 800 : 550 - at;
  } else {
    if (sensitivity === "low") return null;
    let previous = new Map<number, { score: number; indexes: number[] }>();
    for (let qi = 0; qi < q.length; qi++) {
      const current = new Map<number, { score: number; indexes: number[] }>();
      let best: { score: number; indexes: number[] } | undefined;
      for (let i = 0; i < v.text.length; i++) {
        const preceding = previous.get(i - 1);
        if (
          preceding &&
          (!best || preceding.score + i - 1 > best.score + best.indexes.at(-1)!)
        )
          best = preceding;
        if (v.text[i] !== q[qi]) continue;
        const boundary = i === 0 || /[\s._\-/]/.test(v.text[i - 1]) ? 35 : 0;
        if (!qi)
          current.set(i, {
            score: 150 + boundary + (i === 0 ? 30 : 5) - i,
            indexes: [i],
          });
        else if (best) {
          const contiguous = preceding ? preceding.score + 30 : -Infinity;
          const separated = best.score + 5 - (i - best.indexes.at(-1)! - 1);
          const chosen = contiguous >= separated ? preceding! : best;
          current.set(i, {
            score: Math.max(contiguous, separated) + boundary,
            indexes: [...chosen.indexes, i],
          });
        }
      }
      if (!current.size) return null;
      previous = current;
    }
    const best = [...previous.values()].sort((a, b) => b.score - a.score)[0];
    indexes = best.indexes;
    score = best.score;
    const spread = indexes[indexes.length - 1] - indexes[0] + 1;
    if (sensitivity === "medium" && spread > q.length * 3) return null;
  }
  const matches: [number, number][] = [];
  for (const index of indexes) {
    const start = v.positions[index];
    const end = start + String.fromCodePoint(value.codePointAt(start)!).length;
    const previous = matches[matches.length - 1];
    if (previous && start <= previous[1])
      previous[1] = Math.max(previous[1], end);
    else matches.push([start, end]);
  }
  return { score, matches };
}
export function frecency(
  count: number,
  lastUsed: number,
  now = Date.now(),
): number {
  // Raycast's native decay is undocumented. A smooth 30-day decay keeps new visits useful.
  return (
    1 +
    Math.log2(count + 1) *
      Math.exp(-Math.max(0, now - lastUsed) / (30 * 86400000))
  );
}
export function rankCommands(
  query: string,
  commands: CommandInfo[],
  visits: Map<string, { count: number; lastUsed: number }>,
  sensitivity: "low" | "medium" | "high",
): RootSearchItem[] {
  const q = normalized(query.trim()).text;
  return commands
    .filter((c) => c.enabled)
    .flatMap((command) => {
      const title = fuzzyMatch(q, command.title, sensitivity);
      const alias = command.alias ? normalized(command.alias).text : "";
      const other = [command.subtitle ?? "", ...(command.keywords ?? [])].map(
        (s) => fuzzyMatch(q, s, sensitivity)?.score ?? -Infinity,
      );
      let score = Math.max(
        title?.score ?? -Infinity,
        ...other.map((n) => n * 0.65),
      );
      if (alias && alias === q) score = 1e9;
      else if (alias && alias.startsWith(q)) score = 1e6 + q.length;
      if (!Number.isFinite(score)) return [];
      const visit = visits.get(command.id);
      score += Math.min(
        100,
        (visit ? frecency(visit.count, visit.lastUsed) : 1) * 10,
      );
      return [{ ...command, matches: title?.matches ?? [], score }];
    })
    .sort((a, b) => b.score! - a.score! || a.title.localeCompare(b.title));
}
