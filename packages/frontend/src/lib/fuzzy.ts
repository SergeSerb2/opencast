/** Character ranges `[start, end)` that matched, for highlighting. */
export type MatchRange = [start: number, end: number];

export interface FuzzyResult {
  score: number;
  ranges: MatchRange[];
}

const WORD_START_BONUS = 8;
const FIRST_CHAR_BONUS = 12;
const CONSECUTIVE_BONUS = 6;
const CASE_BONUS = 1;
const GAP_PENALTY = 1;
const MAX_GAP_PENALTY = 6;

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  const prev = text[index - 1];
  const char = text[index];
  if (/[\s\-_./\\:@(“"']/.test(prev)) return true;
  // camelCase boundary
  return prev === prev.toLowerCase() && char !== char.toLowerCase() && /[a-z]/i.test(char);
}

/**
 * Best in-order alignment of `query` inside `text` (dynamic programming over
 * query × text). Rewards word starts and consecutive runs, penalises gaps.
 */
function alignToken(token: string, text: string, lowerText: string): { score: number; positions: number[] } | null {
  const lowerToken = token.toLowerCase();
  const n = lowerToken.length;
  const m = lowerText.length;
  if (n === 0) return { score: 0, positions: [] };
  if (n > m) return null;

  // Quick subsequence check.
  for (let i = 0, j = 0; i < n; i++, j++) {
    j = lowerText.indexOf(lowerToken[i], j);
    if (j === -1) return null;
  }

  const NEG = -1e9;
  // score[i][j]: best score with token[i] matched at text[j]
  const score: Float64Array[] = [];
  const from: Int32Array[] = [];
  for (let i = 0; i < n; i++) {
    const row = new Float64Array(m).fill(NEG);
    const back = new Int32Array(m).fill(-1);
    for (let j = i; j < m; j++) {
      if (lowerText[j] !== lowerToken[i]) continue;
      let bonus = 1;
      if (j === 0) bonus += FIRST_CHAR_BONUS;
      else if (isWordStart(text, j)) bonus += WORD_START_BONUS;
      if (text[j] === token[i]) bonus += CASE_BONUS;
      if (i === 0) {
        row[j] = bonus - Math.min(MAX_GAP_PENALTY, j * GAP_PENALTY * 0.5);
        continue;
      }
      const prevRow = score[i - 1];
      let best = NEG;
      let bestK = -1;
      for (let k = i - 1; k < j; k++) {
        if (prevRow[k] === NEG) continue;
        const gap = j - k - 1;
        const candidate = prevRow[k] + (gap === 0 ? CONSECUTIVE_BONUS : -Math.min(MAX_GAP_PENALTY, gap * GAP_PENALTY));
        if (candidate > best) {
          best = candidate;
          bestK = k;
        }
      }
      if (bestK >= 0) {
        row[j] = best + bonus;
        back[j] = bestK;
      }
    }
    score.push(row);
    from.push(back);
  }

  let bestJ = -1;
  let best = NEG;
  const last = score[n - 1];
  for (let j = 0; j < m; j++) {
    if (last[j] > best) {
      best = last[j];
      bestJ = j;
    }
  }
  if (bestJ < 0) return null;
  const positions = new Array<number>(n);
  for (let i = n - 1, j = bestJ; i >= 0; i--) {
    positions[i] = j;
    j = from[i][j];
  }
  return { score: best, positions };
}

/** Merge sorted positions into contiguous ranges. */
export function positionsToRanges(positions: number[]): MatchRange[] {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const ranges: MatchRange[] = [];
  for (const p of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === p) last[1] = p + 1;
    else ranges.push([p, p + 1]);
  }
  return ranges;
}

/**
 * Fuzzy-match a query against text. Whitespace splits the query into tokens
 * that must all match (in any order). Returns null when something does not match.
 */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { score: 0, ranges: [] };
  const lowerText = text.toLowerCase();
  let total = 0;
  const positions: number[] = [];
  for (const token of tokens) {
    const aligned = alignToken(token, text, lowerText);
    if (!aligned) return null;
    total += aligned.score;
    positions.push(...aligned.positions);
  }
  // Prefer exact prefixes and shorter texts.
  if (lowerText.startsWith(query.trim().toLowerCase())) total += 10;
  total -= text.length * 0.01;
  return { score: total, ranges: positionsToRanges(positions) };
}

export interface FilterField {
  text: string | undefined;
  /** Score multiplier; the title is usually 1, keywords/subtitle lower. */
  weight?: number;
  /** Report ranges for this field (the title). */
  highlight?: boolean;
}

export interface FilterHit<T> {
  item: T;
  score: number;
  ranges: MatchRange[];
}

/** Rank items by their best-matching field; stable for equal scores. */
export function fuzzyFilter<T>(items: readonly T[], query: string, fields: (item: T) => FilterField[]): FilterHit<T>[] {
  if (!query.trim()) return items.map((item) => ({ item, score: 0, ranges: [] }));
  const hits: (FilterHit<T> & { index: number })[] = [];
  items.forEach((item, index) => {
    let best: FilterHit<T> | null = null;
    let ranges: MatchRange[] = [];
    for (const field of fields(item)) {
      if (!field.text) continue;
      const result = fuzzyMatch(query, field.text);
      if (!result) continue;
      const score = result.score * (field.weight ?? 1);
      if (field.highlight) ranges = result.ranges;
      if (!best || score > best.score) best = { item, score, ranges: [] };
    }
    if (best) hits.push({ item, score: best.score, ranges, index });
  });
  hits.sort((a, b) => b.score - a.score || a.index - b.index);
  return hits.map(({ item, score, ranges }) => ({ item, score, ranges }));
}
