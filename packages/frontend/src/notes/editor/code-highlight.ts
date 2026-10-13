import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import less from "highlight.js/lib/languages/less";
import lua from "highlight.js/lib/languages/lua";
import makefile from "highlight.js/lib/languages/makefile";
import markdown from "highlight.js/lib/languages/markdown";
import objectivec from "highlight.js/lib/languages/objectivec";
import perl from "highlight.js/lib/languages/perl";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Languages offered by the code block's language menu ("" = detect automatically). */
export const CODE_LANGUAGES: readonly { value: string; label: string }[] = [
  { value: "", label: "Auto" },
  { value: "bash", label: "Bash" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "css", label: "CSS" },
  { value: "diff", label: "Diff" },
  { value: "go", label: "Go" },
  { value: "graphql", label: "GraphQL" },
  { value: "ini", label: "INI" },
  { value: "java", label: "Java" },
  { value: "javascript", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "kotlin", label: "Kotlin" },
  { value: "less", label: "Less" },
  { value: "lua", label: "Lua" },
  { value: "makefile", label: "Makefile" },
  { value: "markdown", label: "Markdown" },
  { value: "objectivec", label: "Objective-C" },
  { value: "perl", label: "Perl" },
  { value: "php", label: "PHP" },
  { value: "python", label: "Python" },
  { value: "r", label: "R" },
  { value: "ruby", label: "Ruby" },
  { value: "rust", label: "Rust" },
  { value: "scss", label: "SCSS" },
  { value: "shell", label: "Shell" },
  { value: "sql", label: "SQL" },
  { value: "swift", label: "Swift" },
  { value: "typescript", label: "TypeScript" },
  { value: "xml", label: "XML" },
  { value: "yaml", label: "YAML" },
];

const GRAMMARS = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  go,
  graphql,
  ini,
  java,
  javascript,
  json,
  kotlin,
  less,
  lua,
  makefile,
  markdown,
  objectivec,
  perl,
  php,
  python,
  r,
  ruby,
  rust,
  scss,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};
for (const [name, grammar] of Object.entries(GRAMMARS)) hljs.registerLanguage(name, grammar);
const AUTO_SUBSET = Object.keys(GRAMMARS);

/** Display label for a stored language attribute (aliases such as "ts" resolve through highlight.js). */
export function languageLabel(language: string | null | undefined): string {
  if (!language) return "Auto";
  const known = CODE_LANGUAGES.find((entry) => entry.value === language);
  if (known) return known.label;
  const grammar = hljs.getLanguage(language);
  return grammar?.name ?? language;
}

export interface HighlightToken {
  from: number;
  to: number;
  className: string;
}

/**
 * Convert highlight.js HTML into character ranges. The output only contains
 * `<span class>` tags and the five escaped entities, each one character long.
 */
export function tokensFromHighlightHtml(html: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const open: { className: string; from: number }[] = [];
  let offset = 0;
  let i = 0;
  while (i < html.length) {
    if (html.startsWith("<span", i)) {
      const end = html.indexOf(">", i);
      const className = /class="([^"]*)"/.exec(html.slice(i, end))?.[1] ?? "";
      open.push({ className, from: offset });
      i = end + 1;
    } else if (html.startsWith("</span>", i)) {
      const span = open.pop();
      if (span?.className && offset > span.from) tokens.push({ from: span.from, to: offset, className: span.className });
      i += "</span>".length;
    } else if (html[i] === "&") {
      offset += 1;
      i = html.indexOf(";", i) + 1;
    } else {
      offset += 1;
      i += 1;
    }
  }
  return tokens;
}

const CACHE_LIMIT = 200;
const cache = new Map<string, HighlightToken[]>();

export function highlightCode(code: string, language: string | null | undefined): HighlightToken[] {
  if (!code.trim()) return [];
  const key = `${language ?? ""}\u0000${code}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let tokens: HighlightToken[] = [];
  try {
    const html = language && hljs.getLanguage(language) ? hljs.highlight(code, { language, ignoreIllegals: true }).value : hljs.highlightAuto(code, AUTO_SUBSET).value;
    tokens = tokensFromHighlightHtml(html);
  } catch {
    tokens = [];
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, tokens);
  return tokens;
}

function buildDecorations(doc: ProseMirrorNode, nodeName: string): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== nodeName) return true;
    for (const token of highlightCode(node.textContent, node.attrs.language as string | null)) {
      decorations.push(Decoration.inline(pos + 1 + token.from, pos + 1 + token.to, { class: token.className }));
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** Syntax colors for code blocks as inline decorations (token colors in editor.css). */
export function codeHighlightPlugin(nodeName: string): Plugin<DecorationSet> {
  const key = new PluginKey<DecorationSet>("notesCodeHighlight");
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_, { doc }) => buildDecorations(doc, nodeName),
      apply: (tr, previous) => (tr.docChanged ? buildDecorations(tr.doc, nodeName) : previous),
    },
    props: {
      decorations: (state) => key.getState(state),
    },
  });
}
