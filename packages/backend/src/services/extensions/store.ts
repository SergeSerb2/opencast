import type { StoreExtension } from "@surgecast/protocol";
export const STORE_BASE = process.env.SURGECAST_EXTENSION_STORE_URL ?? "https://backend.raycast.com/api/v1";
const USER_AGENT = "Surgecast/0.1 (macOS; open-source extension compatibility)";
export async function fetchBytes(url: string, maxBytes = 50 * 1024 * 1024): Promise<Buffer> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Extension store request failed (${response.status})`);
  if (Number(response.headers.get("content-length")) > maxBytes) { await response.body?.cancel(); throw new Error("Extension download is too large"); }
  const chunks: Buffer[] = []; let size = 0;
  if (response.body) for await (const chunk of response.body as any as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Extension download is too large");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
export async function storeJSON(path: string, body?: unknown): Promise<any> {
  const url = `${STORE_BASE}/${path}`;
  if (body !== undefined) {
    const result = await fetch(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30000) });
    if (!result.ok) throw new Error(`Extension store request failed (${result.status})`);
    return result.json();
  }
  return JSON.parse((await fetchBytes(url, 8 * 1024 * 1024)).toString("utf8"));
}
export function storeExtension(raw: any): StoreExtension {
  if (!raw || typeof raw.name !== "string" || !raw.id) throw new Error("Invalid store listing");
  return {
    id: raw.id, name: raw.name, title: raw.title ?? raw.name, description: raw.description ?? "",
    author: raw.author, owner: raw.owner, icon: raw.icons ?? raw.icon ?? {},
    downloadCount: raw.download_count ?? 0, categories: raw.categories ?? [], commands: raw.commands ?? [], tools: raw.tools,
    platforms: raw.platforms, version: raw.commit_sha ?? raw.version,
    updatedAt: raw.updated_at ? Number(raw.updated_at) * 1000 : Date.now(),
    storeUrl: raw.store_url, sourceUrl: raw.source_url, readmeUrl: raw.readme_url, screenshots: raw.screenshots,
  };
}
function slug(value: string): string | undefined {
  const match = value.match(/^(?:https:\/\/www\.raycast\.com\/)?([^/]+)\/([^/?#]+)\/?$/);
  return match ? `${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}` : undefined;
}
export class ExtensionStoreClient {
  async search(params: { query?: string; category?: string; page?: number } = {}): Promise<{ items: StoreExtension[]; hasMore: boolean }> {
    const query = [params.query, params.category].filter(Boolean).join(" ");
    const search = new URLSearchParams({ page: String(params.page ?? 1), per_page: "50", explicit_platform: "macOS" });
    if (query) search.set("q", query);
    const result = await storeJSON(`store_listings${query ? "/search" : ""}?${search}`);
    const items = (result.data ?? []).map(storeExtension);
    return { items, hasMore: result.meta?.next_page != null || items.length === 50 };
  }
  async raw(value: string): Promise<any> {
    const path = slug(value);
    if (path) { const result = await storeJSON(`extensions/${path}`); return result.data ?? result; }
    const latest = await storeJSON("store_listings/latest", { filter: { id: [value] } }).catch(() => undefined);
    const found = latest?.data?.find((x: any) => x.id === value);
    if (found) return found;
    const result = await this.search({ query: value });
    const item = result.items.find((x) => x.id === value || x.name === value);
    if (!item) throw new Error("Extension store listing not found; use owner/name");
    return this.raw(`${item.owner?.handle ?? item.author.handle}/${item.name}`);
  }
  async get(value: string): Promise<StoreExtension & { readme?: string }> {
    const raw = await this.raw(value); const item = storeExtension(raw);
    let readme = typeof raw.readme === "string" ? raw.readme : undefined;
    if (!readme && item.readmeUrl) {
      const url = item.readmeUrl.replace("https://github.com/", "https://raw.githubusercontent.com/").replace("/tree/", "/").replace("/blob/", "/");
      readme = await fetchBytes(url, 2 * 1024 * 1024).then((data) => data.toString("utf8"));
    }
    return { ...item, readme };
  }
  async download(value: string): Promise<{ bytes: Buffer; item: StoreExtension }> {
    const raw = await this.raw(value); const item = storeExtension(raw);
    if (item.platforms?.length && !item.platforms.includes("macOS")) throw new Error("This extension does not support macOS");
    const path = `${encodeURIComponent(item.owner?.handle ?? item.author.handle)}/${encodeURIComponent(item.name)}`;
    const bytes = raw.download_url ? await fetchBytes(raw.download_url) : await fetchBytes(`${STORE_BASE}/extensions/${path}/download`);
    return { bytes, item };
  }
}
