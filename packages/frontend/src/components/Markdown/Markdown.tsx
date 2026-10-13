import { memo, useState, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { native } from "../../bridge/native";
import { Icon } from "../../icons/Icon";
import { localFileUrl } from "../../icons/image-source";
import "./markdown.css";

export interface MarkdownProps {
  children: string;
  /** "detail" = Raycast Detail stylesheet; "chat" = AI Chat typography (14px body, larger headings). */
  variant?: "detail" | "chat";
  className?: string;
  /** Called for link clicks; defaults to opening the URL with the system. */
  onOpenLink?: (url: string) => void;
}

const SAFE_URL = /^(https?:|mailto:|opencast:|surgecast:|raycast:|opencast-file:|surgecast-file:|file:|data:image\/)/i;

/** Allow web links, app deeplinks, local files and inline images; drop script-like schemes. */
export function markdownUrlTransform(url: string): string {
  const trimmed = url.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed; // relative or absolute path
  return SAFE_URL.test(trimmed) ? trimmed : "";
}

/** Resolve markdown image sources: local paths → opencast-file://, keep sizing hints from Raycast's query params. */
export function resolveMarkdownImage(src: string): { url: string; width?: number; height?: number; tintColor?: string } {
  let url = src;
  let width: number | undefined;
  let height: number | undefined;
  let tintColor: string | undefined;
  const queryIndex = src.indexOf("?");
  if (queryIndex !== -1) {
    const params = new URLSearchParams(src.slice(queryIndex + 1));
    const w = Number(params.get("raycast-width"));
    const h = Number(params.get("raycast-height"));
    if (w > 0) width = w;
    if (h > 0) height = h;
    tintColor = params.get("raycast-tint-color") ?? undefined;
    for (const key of ["raycast-width", "raycast-height", "raycast-tint-color"]) params.delete(key);
    const rest = params.toString();
    url = src.slice(0, queryIndex) + (rest ? `?${rest}` : "");
  }
  if (url.startsWith("file://")) url = localFileUrl(decodeURI(url.slice(7)));
  else if (url.startsWith("/") || url.startsWith("~/")) url = localFileUrl(url);
  return { url, width, height, tintColor };
}

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) return extractText((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

/** Fence language from the `<code class="language-…">` child (rehype-highlight keeps it). */
function codeLanguage(children: ReactNode): string | undefined {
  const child = Array.isArray(children) ? children[0] : children;
  const className = child && typeof child === "object" && "props" in child ? (child as { props: { className?: string } }).props.className : undefined;
  return className?.match(/(?:^|\s)language-([\w+#.-]+)/)?.[1];
}

function CodeBlock({ children, variant, node: _node, ...rest }: ComponentProps<"pre"> & { variant: "detail" | "chat"; node?: unknown }) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const copy = async () => {
    const text = extractText(children).replace(/\n$/, "");
    await native.call("clipboard.write", { content: { kind: "text", text } }).catch(() => navigator.clipboard?.writeText(text));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const copyButton = (className: string) => (
    <button type="button" className={className} aria-label="Copy code" title="Copy Code" onMouseDown={(e) => e.preventDefault()} onClick={() => void copy()}>
      <Icon name={copied ? "checkmark-16" : "copy-clipboard-16"} size={14} />
    </button>
  );
  if (variant === "chat") {
    // Chat: a sticky pill with the fence language, line wrapping and copy (§6.6).
    const language = codeLanguage(children);
    return (
      <div className="sc-md-code" data-wrap={wrap || undefined}>
        <div className="sc-md-code__bar">
          <div className="sc-md-code__toolbar">
            {language && <span className="sc-md-code__language">{language}</span>}
            <button type="button" className="sc-md-code__tool" aria-label="Wrap lines" aria-pressed={wrap} title={wrap ? "Don’t Wrap Lines" : "Wrap Lines"} onMouseDown={(e) => e.preventDefault()} onClick={() => setWrap((w) => !w)}>
              <Icon name="text-16" size={14} />
            </button>
            {copyButton("sc-md-code__tool")}
          </div>
        </div>
        <pre {...rest}>{children}</pre>
      </div>
    );
  }
  return (
    <div className="sc-md-code">
      <pre {...rest}>{children}</pre>
      {copyButton("sc-md-code__copy")}
    </div>
  );
}

/**
 * Markdown with GFM (tables, task lists, strikethrough) and highlight.js code
 * colors mapped to the theme's syntax tokens. Shared by Detail, List detail
 * panes and the AI Chat transcript.
 */
export const Markdown = memo(function Markdown({ children, variant = "detail", className, onOpenLink }: MarkdownProps) {
  const open = onOpenLink ?? ((url: string) => void native.call("open.url", { url }).catch(() => window.open(url, "_blank", "noopener")));
  const components: Components = {
    a: ({ href, children: content, ...rest }) => (
      <a
        {...rest}
        href={href}
        onClick={(event) => {
          event.preventDefault();
          if (href) open(href);
        }}
      >
        {content}
      </a>
    ),
    img: ({ src, alt }) => {
      if (typeof src !== "string" || !src) return null;
      const { url, width, height } = resolveMarkdownImage(src);
      return <img src={url} alt={alt ?? ""} width={width} height={height} loading="lazy" draggable={false} />;
    },
    pre: (props) => <CodeBlock {...props} variant={variant} />,
    input: ({ type, checked }) => (type === "checkbox" ? <span className="sc-md-task" data-checked={checked || undefined} aria-checked={checked} role="checkbox" /> : null),
    table: ({ children: content }) => (
      <div className="sc-md-table">
        <table>{content}</table>
      </div>
    ),
  };
  return (
    <div className={`sc-markdown${className ? ` ${className}` : ""}`} data-variant={variant} data-selectable="true">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]} components={components} urlTransform={markdownUrlTransform}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
