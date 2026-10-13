import type { ImageLike, StoreExtension } from "@opencast/protocol";

/** Category dropdown value that lists installed Store extensions instead of searching. */
export const INSTALLED_FILTER = "__installed__";
export const ALL_CATEGORIES = "all";

export interface StoreCategory {
  value: string;
  title: string;
  icon: string;
}

/** Store categories in the order of the category dropdown. */
export const STORE_CATEGORIES: StoreCategory[] = [
  { value: "AI Extensions", title: "AI Extensions", icon: "stars-16" },
  { value: "Applications", title: "Applications", icon: "finder-16" },
  { value: "Communication", title: "Communication", icon: "megaphone-16" },
  { value: "Data", title: "Data", icon: "computer-chip-16" },
  { value: "Documentation", title: "Documentation", icon: "blank-document-16" },
  { value: "Design Tools", title: "Design Tools", icon: "pencil-16" },
  { value: "Developer Tools", title: "Developer Tools", icon: "hammer-16" },
  { value: "Finance", title: "Finance", icon: "bank-note-16" },
  { value: "Fun", title: "Fun", icon: "emoji-16" },
  { value: "Media", title: "Media", icon: "music-16" },
  { value: "News", title: "News", icon: "book-16" },
  { value: "Productivity", title: "Productivity", icon: "calendar-16" },
  { value: "Security", title: "Security", icon: "lock-16" },
  { value: "System", title: "System", icon: "monitor-16" },
  { value: "Web", title: "Web", icon: "globe-01-16" },
  { value: "Other", title: "Other", icon: "box-16" },
];

/** Generic extension glyph for missing or broken icons. */
export const EXTENSION_FALLBACK_ICON = "box-16";

/** `owner/name` path the Store resolves directly (owner falls back to the author). */
export function storeSlug(item: Pick<StoreExtension, "name" | "author" | "owner">): string {
  return `${item.owner?.handle ?? item.author.handle}/${item.name}`;
}

/** Store icons come as light/dark URLs; either may be missing. */
export function storeIcon(icon: StoreExtension["icon"] | undefined): ImageLike {
  const light = icon?.light ?? icon?.dark;
  const dark = icon?.dark ?? icon?.light;
  if (!light || !dark) return EXTENSION_FALLBACK_ICON;
  return { source: { light, dark }, fallback: EXTENSION_FALLBACK_ICON };
}

/** Round avatar for a Store developer. */
export function avatarImage(person: { avatar?: string } | undefined): ImageLike {
  return person?.avatar ? { source: person.avatar, mask: "circle", fallback: "person-circle-16" } : "person-circle-16";
}

/** The developer shown for a listing: public extensions are presented by their owner (organisation), else the author. */
export function storeDeveloper(item: Pick<StoreExtension, "author" | "owner">): { handle: string; name: string; avatar?: string } {
  if (!item.owner) return item.author;
  return { ...item.owner, avatar: item.owner.avatar ?? (item.owner.handle === item.author.handle ? item.author.avatar : undefined) };
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US");

/** 412880 → "412.9K" (download accessory). */
export function formatCompactCount(count: number): string {
  return compact.format(count);
}

/** 412880 → "412,880". */
export function formatFullCount(count: number): string {
  return full.format(count);
}

/** "1 Install", "2 Installs". */
export function pluralize(count: number, noun: string): string {
  return `${formatFullCount(count)} ${noun}${count === 1 ? "" : "s"}`;
}

export function isAIExtension(item: Pick<StoreExtension, "tools">): boolean {
  return Boolean(item.tools?.length);
}

export function supportsMacOS(item: Pick<StoreExtension, "platforms">): boolean {
  return !item.platforms?.length || item.platforms.some((p) => p.toLowerCase() === "macos");
}

/** "Results" while searching or filtering by category, "All Extensions" when browsing everything. */
export function storeSectionTitle(query: string, category: string): string {
  return query.trim() || category !== ALL_CATEGORIES ? "Results" : "All Extensions";
}

/** Append a page of results, dropping listings already shown (pages can shift while new extensions are published). */
export function mergeStorePages(existing: StoreExtension[], next: StoreExtension[]): StoreExtension[] {
  const seen = new Set(existing.map((item) => item.id));
  return [...existing, ...next.filter((item) => !seen.has(item.id))];
}

/** Developer profile page next to the listing on the Store website. */
export function developerUrl(item: Pick<StoreExtension, "storeUrl" | "author" | "owner">): string | undefined {
  try {
    return `${new URL(item.storeUrl).origin}/${encodeURIComponent(storeDeveloper(item).handle)}`;
  } catch {
    return undefined;
  }
}

/** Extensions keep their changelog next to the sources. */
export function changelogUrl(sourceUrl: string | undefined): string | undefined {
  return sourceUrl ? `${sourceUrl.replace(/\/+$/, "")}/CHANGELOG.md` : undefined;
}

/** Most Store versions are commit SHAs; show the short form. */
export function formatVersion(version: string): string {
  return /^[0-9a-f]{40}$/i.test(version) ? version.slice(0, 7) : version;
}

/** "github.com" for a link label. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Directory of a README on GitHub, as a web URL (links) and a raw URL (images). */
function readmeBases(readmeUrl: string): { web: string; raw: string } | null {
  let url: URL;
  try {
    url = new URL(readmeUrl);
  } catch {
    return null;
  }
  const web = new URL(".", url).toString();
  if (url.hostname !== "github.com") return { web, raw: web };
  const [owner, repo, kind, ...rest] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo || (kind !== "blob" && kind !== "tree")) return { web, raw: web };
  const raw = new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${rest.join("/")}`);
  return { web, raw: new URL(".", raw).toString() };
}

function resolveRelative(target: string, base: string): string {
  if (!target || SCHEME.test(target) || target.startsWith("#") || target.startsWith("/")) return target;
  try {
    return new URL(target, base).toString();
  } catch {
    return target;
  }
}

/**
 * Store READMEs reference screenshots and docs with paths relative to the
 * extension folder; point images at the raw files and links at the web view
 * so they work inside the launcher.
 */
export function resolveReadmeLinks(markdown: string, readmeUrl: string | undefined): string {
  const bases = readmeUrl ? readmeBases(readmeUrl) : null;
  if (!bases) return markdown;
  return markdown.replace(/(!?)\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(\s+"[^"]*")?\s*\)/g, (_match, bang: string, text: string, rawTarget: string, title: string | undefined) => {
    const target = rawTarget.startsWith("<") ? rawTarget.slice(1, -1) : rawTarget;
    const resolved = resolveRelative(target, bang ? bases.raw : bases.web);
    return `${bang}[${text}](${resolved.includes(" ") ? `<${resolved}>` : resolved}${title ?? ""})`;
  });
}

/** The detail header already shows the title; drop a README's leading `# Title` when it repeats it. */
export function stripLeadingTitle(markdown: string, title: string): string {
  const match = /^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/.exec(markdown);
  if (!match || match[1].trim().toLowerCase() !== title.trim().toLowerCase()) return markdown;
  return markdown.slice(match[0].length).replace(/^\s+/, "");
}
