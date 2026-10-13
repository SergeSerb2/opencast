/**
 * Help links shown in editors. Surgecast's documentation lives in the
 * repository's docs folder (the backend's "Search Surgecast Docs" uses the same root).
 */
const DOCS_ROOT = "https://github.com/sergeserbinenko/surgecast/tree/main/docs";

export const DOCS = {
  snippets: DOCS_ROOT,
  quicklinks: DOCS_ROOT,
  placeholders: DOCS_ROOT,
} as const;
