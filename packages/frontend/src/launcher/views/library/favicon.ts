import type { SettingsValues } from "@surgecast/protocol";

export type FaviconProvider = SettingsValues["advanced.faviconProvider"];

/** Favicon URL for an http(s) link from the configured provider, or null (no provider, not a web link). */
export function faviconUrl(link: string, provider: FaviconProvider): string | null {
  if (provider === "none") return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname.includes(".")) return null;
  const host = url.hostname === "youtu.be" ? "youtube.com" : url.hostname;
  return provider === "duckduckgo" ? `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico` : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}
