import type { AppInfo, ImageLike, Quicklink } from "@opencast/protocol";
import { isIconName } from "../../../icons/Icon";
import { faviconUrl, type FaviconProvider } from "../library/favicon";
import { glyphTile } from "../library/icons";
import { validateTemplate } from "../snippets/placeholders";

/** Icon picker value for "use the favicon / app icon". */
export const DEFAULT_ICON = "default";
export const CUSTOM_ICON = "custom";

export interface QuicklinkDraft {
  name: string;
  link: string;
  /** Bundle id or path; "" = the link's default app. */
  openWith: string;
  tags: string[];
  /** Icon name or DEFAULT_ICON. */
  icon: string;
  originalIcon?: ImageLike;
}

export type QuicklinkErrors = Partial<Record<"name" | "link", string>>;

export function isPathLink(link: string): boolean {
  return /^(\/|~\/|file:)/i.test(link.trim());
}

export function quicklinkDraft(source?: Partial<Pick<Quicklink, "name" | "link" | "openWith" | "tags" | "icon">>): QuicklinkDraft {
  const icon = typeof source?.icon === "string" && isIconName(source.icon) ? source.icon : source?.icon ? CUSTOM_ICON : DEFAULT_ICON;
  return { name: source?.name ?? "", link: source?.link ?? "", openWith: source?.openWith ?? "", tags: source?.tags ?? [], icon, originalIcon: source?.icon };
}

export function validateQuicklink(draft: QuicklinkDraft): QuicklinkErrors {
  const errors: QuicklinkErrors = {};
  if (!draft.link.trim()) errors.link = "Link is required";
  else {
    const error = validateTemplate(draft.link, "quicklink");
    if (error) errors.link = error;
  }
  if (!draft.name.trim()) errors.name = "Name is required";
  return errors;
}

/**
 * Create/update payload. Cleared optional fields are sent as JSON null: the
 * backend merges patches with object spread, so an omitted key would keep the
 * old Open With app or icon, while null resets it to the default.
 */
export function quicklinkPayload(draft: QuicklinkDraft): Omit<Quicklink, "id" | "createdAt" | "updatedAt"> {
  return {
    name: draft.name.trim(),
    link: draft.link.trim(),
    openWith: (draft.openWith || null) as string | undefined,
    icon: (draft.icon === DEFAULT_ICON ? null : draft.icon === CUSTOM_ICON ? draft.originalIcon : draft.icon) as ImageLike | undefined,
    tags: draft.tags,
  };
}

/** What Raycast shows for "Default": the Open With app, the site's favicon, the file's icon, or a link glyph. */
export function defaultLinkIcon(link: string, provider: FaviconProvider, app?: AppInfo | null): ImageLike {
  if (app) return { fileIcon: app.path };
  const trimmed = link.trim();
  if (isPathLink(trimmed)) return { fileIcon: trimmed.replace(/^file:\/\//i, "") };
  const favicon = faviconUrl(trimmed.replace(/\{[^}]*\}/g, ""), provider);
  return favicon ? { source: favicon, fallback: "link-16" } : glyphTile("link-16");
}

/** Row icon: the chosen icon as a tile, otherwise the default icon. */
export function quicklinkIcon(quicklink: Quicklink, provider: FaviconProvider, apps: AppInfo[]): ImageLike {
  if (typeof quicklink.icon === "string" && isIconName(quicklink.icon)) return glyphTile(quicklink.icon);
  if (quicklink.icon) return quicklink.icon;
  const app = quicklink.openWith ? apps.find((a) => a.bundleId === quicklink.openWith || a.path === quicklink.openWith) : undefined;
  return defaultLinkIcon(quicklink.link, provider, app);
}

/** "Never", "Once", "3 times". */
export function openedLabel(count: number | undefined): string {
  if (!count) return "Never";
  if (count === 1) return "Once";
  return `${count.toLocaleString()} times`;
}
