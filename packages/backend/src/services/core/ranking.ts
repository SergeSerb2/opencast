import type { CommandInfo, RootSearchItem } from "@opencast/protocol";

type Sensitivity = "low" | "medium" | "high";
interface Match {
  tier: number;
  quality: number;
  indexes: number[];
}

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

function wordStarts(value: string, positions: number[]): Set<number> {
  const starts = new Set<number>();
  const pattern = /[\p{L}\p{N}]+/gu;
  for (const word of value.matchAll(pattern)) {
    starts.add(word.index);
    // Split camelCase, acronym-to-word transitions (XMLParser), and 1Password.
    for (let i = word.index + 1; i < word.index + word[0].length; i++) {
      const before = value[i - 1];
      const current = value[i];
      const next = value[i + 1] ?? "";
      if (
        (/[\p{Ll}\p{N}]/u.test(before) && /\p{Lu}/u.test(current)) ||
        (/\p{Lu}/u.test(before) && /\p{Lu}/u.test(current) && /\p{Ll}/u.test(next))
      )
        starts.add(i);
    }
  }
  return new Set(positions.flatMap((position, i) => starts.has(position) ? [i] : []));
}

function wordPrefixMatch(q: string, text: string, starts: Set<number>): Match | null {
  const offsets = [...starts];
  const words = offsets.map((start, i) => {
    const end = offsets[i + 1] ?? text.length;
    return text.slice(start, end).match(/^[\p{L}\p{N}]+/u)?.[0] ?? "";
  });
  let candidates = new Map<number, number[]>([[0, []]]);
  for (const token of q.split(/\s+/)) {
    const next = new Map<number, number[]>();
    const save = (end: number, indexes: number[]) => {
      const existing = next.get(end);
      if (!existing || indexes.reduce((a, b) => a + b, 0) < existing.reduce((a, b) => a + b, 0))
        next.set(end, indexes);
    };
    for (const [from, indexes] of candidates) {
      for (let i = from; i < words.length; i++) {
        if (words[i].startsWith(token))
          save(i + 1, [...indexes, ...Array.from({ length: token.length }, (_, n) => offsets[i] + n)]);
        // Initialisms are intentional word matches, so remain available at low sensitivity.
        if (token.length > 1 && i + token.length <= words.length &&
          [...token].every((char, n) => words[i + n][0] === char))
          save(i + token.length, [...indexes, ...offsets.slice(i, i + token.length)]);
      }
    }
    if (!next.size) return null;
    candidates = next;
  }
  const indexes = [...candidates.values()].sort((a, b) =>
    a.reduce((sum, n) => sum + n, 0) - b.reduce((sum, n) => sum + n, 0))[0];
  return { tier: 4, quality: 200 / (1 + indexes[0] / 10) + 50 / (1 + text.length / 20), indexes };
}

function textMatch(
  q: string,
  text: string,
  starts: Set<number>,
  sensitivity: Sensitivity,
): Match | null {
  if (!q) return { tier: 0, quality: 0, indexes: [] };
  const at = text.indexOf(q);
  const contiguous = at < 0 ? [] : Array.from({ length: q.length }, (_, i) => at + i);
  if (text === q) return { tier: 6, quality: 250, indexes: contiguous };
  if (at === 0) return { tier: 5, quality: 250 / (1 + (text.length - q.length) / 20), indexes: contiguous };
  const words = wordPrefixMatch(q, text, starts);
  if (words) return words;
  if (at >= 0) return { tier: 3, quality: 200 / (1 + at / 10), indexes: contiguous };
  if (sensitivity === "low") return null;

  const compact = q.replace(/\s+/g, "");
  const maxGap = sensitivity === "medium" ? 1 : 2;
  // Keep all possible ends: the first occurrence may fail while a later word fits.
  let previous = new Map<number, number[]>();
  for (let qi = 0; qi < compact.length; qi++) {
    const current = new Map<number, number[]>();
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== compact[qi]) continue;
      if (qi === 0) {
        if (starts.has(i)) current.set(i, [i]);
      } else {
        for (let gap = 0; gap <= maxGap; gap++) {
          const indexes = previous.get(i - gap - 1);
          if (!indexes) continue;
          const candidate = [...indexes, i];
          const existing = current.get(i);
          if (!existing || candidate[0] > existing[0]) current.set(i, candidate);
        }
      }
    }
    if (!current.size) return null;
    previous = current;
  }
  const candidates = [...previous.values()].filter((indexes) =>
    indexes.at(-1)! - indexes[0] + 1 <= compact.length * (sensitivity === "medium" ? 2 : 3));
  if (!candidates.length) return null;
  const indexes = candidates.sort((a, b) =>
    (a.at(-1)! - a[0]) - (b.at(-1)! - b[0]) || a[0] - b[0])[0];
  return { tier: 1, quality: 150 / (1 + (indexes.at(-1)! - indexes[0] + 1 - compact.length)), indexes };
}

function highlight(value: string, positions: number[], indexes: number[]): [number, number][] {
  const matches: [number, number][] = [];
  for (const index of indexes) {
    const start = positions[index];
    let end = start + String.fromCodePoint(value.codePointAt(start)!).length;
    // Include decomposed accent marks in the original title's highlight.
    while (end < value.length && /\p{M}/u.test(value[end])) end++;
    const previous = matches.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else matches.push([start, end]);
  }
  return matches;
}

export function fuzzyMatch(
  query: string,
  value: string,
  sensitivity: Sensitivity = "high",
) {
  const q = normalized(query.trim()).text;
  const v = normalized(value);
  const match = textMatch(q, v.text, wordStarts(value, v.positions), sensitivity);
  return match
    ? {
        score: match.tier * 1000 + match.quality,
        matches: highlight(value, v.positions, match.indexes),
      }
    : null;
}

export function frecency(count: number, lastUsed: number, now = Date.now()): number {
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
  sensitivity: Sensitivity,
): RootSearchItem[] {
  const q = normalized(query.trim()).text;
  return commands
    .filter((c) => c.enabled)
    .flatMap((command) => {
      const title = fuzzyMatch(q, command.title, sensitivity);
      const alias = normalized(command.alias?.trim() ?? "").text;
      // Metadata must match deliberately. Fuzzy paths/bundle IDs otherwise flood the root list.
      const metadata = [command.subtitle ?? "", ...(command.keywords ?? []), alias]
        .filter(Boolean)
        .map((s) => fuzzyMatch(q, s, "low")?.score ?? -Infinity);
      let score = title?.score ?? -Infinity;
      const other = Math.max(...metadata);
      if (Number.isFinite(other)) score = Math.max(score, 2000 + other / 100);
      if (alias && alias === q) score = 7250;
      if (!Number.isFinite(score)) return [];
      const visit = visits.get(command.id);
      // Bands are 1000 points apart; quality and bounded usage cannot cross a tier.
      score += Math.min(
        80,
        (visit ? frecency(visit.count, visit.lastUsed) - 1 : 0) * 10,
      );
      // A feature should precede its settings shortcut when both have the same title prefix.
      if (command.extensionId === "settings") score -= 100;
      score += Math.min(30, Math.max(0, command.suggestionPriority ?? 0) * 0.3);
      if (command.kind === "app") score += 5;
      return [{ ...command, matches: title?.matches ?? [], score }];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
}
