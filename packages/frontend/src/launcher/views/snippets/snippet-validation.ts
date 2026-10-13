import type { Snippet } from "@surgecast/protocol";

export const MAX_SNIPPET_LENGTH = 65_536;
export const MAX_KEYWORD_LENGTH = 30;

export interface SnippetDraft {
  name: string;
  text: string;
  keyword: string;
  tags: string[];
  icon: string;
}

export type SnippetErrors = Partial<Record<"name" | "text" | "keyword", string>>;

/** Form validation, mirroring the backend's rules plus keyword uniqueness. */
export function validateSnippetDraft(draft: SnippetDraft, others: Pick<Snippet, "id" | "keyword">[], selfId?: string): SnippetErrors {
  const errors: SnippetErrors = {};
  if (!draft.name.trim()) errors.name = "Name is required";
  if (!draft.text.trim()) errors.text = "Snippet text is required";
  else if (draft.text.length >= MAX_SNIPPET_LENGTH) errors.text = `Snippets can be up to ${(MAX_SNIPPET_LENGTH - 1).toLocaleString("en-US")} characters`;
  const keyword = draft.keyword.trim();
  if (keyword) {
    if (/\s/.test(keyword)) errors.keyword = "Keywords can’t contain spaces";
    else if (keyword.length > MAX_KEYWORD_LENGTH) errors.keyword = `Keywords can be up to ${MAX_KEYWORD_LENGTH} characters`;
    else if (others.some((s) => s.id !== selfId && s.keyword === keyword)) errors.keyword = "Another snippet uses this keyword";
  }
  return errors;
}

/**
 * Payload for snippets.create / snippets.update from a valid draft. An empty
 * keyword is sent as "" (not omitted) so an update clears it.
 */
export function snippetPayload(draft: SnippetDraft): Pick<Snippet, "name" | "text" | "keyword" | "tags" | "icon"> {
  return {
    name: draft.name.trim(),
    text: draft.text,
    keyword: draft.keyword.trim(),
    tags: draft.tags,
    icon: draft.icon,
  };
}
