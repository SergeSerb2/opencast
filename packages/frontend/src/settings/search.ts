/** Searchable description of a settings page (sidebar entry and its rows). */
export interface SearchablePage {
  id: string;
  title: string;
  /** Extra words that should find the page ("theme", "hotkey", …). */
  keywords?: readonly string[];
  /** Titles of the rows and sections on the page. */
  rows?: readonly string[];
}

export interface PageMatch<P extends SearchablePage = SearchablePage> {
  page: P;
  /** Row titles that matched, in page order (empty when only the page itself matched). */
  rows: string[];
}

/** Stable DOM id for a settings row, used to scroll to and highlight it. */
export function settingId(title: string): string {
  return normalize(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tokenize(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

function matchesAll(text: string, tokens: string[]): boolean {
  const haystack = normalize(text);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Filter settings pages for the sidebar search. A page matches when every
 * query word appears in its title, its keywords, or one of its row titles.
 * Pages whose title matches come first (title prefix before substring), then
 * keyword matches, then pages that match only through rows; the original
 * order is kept within each tier.
 */
export function searchSettings<P extends SearchablePage>(pages: readonly P[], query: string, maxRows = 3): PageMatch<P>[] {
  const tokens = tokenize(query);
  if (!tokens.length) return pages.map((page) => ({ page, rows: [] }));
  const ranked: { match: PageMatch<P>; tier: number; index: number }[] = [];
  pages.forEach((page, index) => {
    const rows = (page.rows ?? []).filter((row) => matchesAll(row, tokens)).slice(0, maxRows);
    const titleMatch = matchesAll(page.title, tokens);
    const keywordMatch = matchesAll([page.title, ...(page.keywords ?? [])].join(" "), tokens);
    let tier: number;
    if (titleMatch) tier = normalize(page.title).startsWith(tokens.join(" ")) ? 0 : 1;
    else if (keywordMatch) tier = 2;
    else if (rows.length) tier = 3;
    else return;
    ranked.push({ match: { page, rows }, tier, index });
  });
  return ranked.sort((a, b) => a.tier - b.tier || a.index - b.index).map((entry) => entry.match);
}
