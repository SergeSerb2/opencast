import type { BackendParams, BackendResult } from "@opencast/protocol";

type ListClipboard = (params: BackendParams<"clipboard.list">) => Promise<BackendResult<"clipboard.list">>;

/** Fetch before deleting so mutations cannot shift subsequent page offsets. */
export async function loadClipboardItems(list: ListClipboard, filter: Pick<BackendParams<"clipboard.list">, "kind" | "query">) {
  const items: BackendResult<"clipboard.list">["items"] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (;;) {
    const page = await list({ ...filter, limit: 100, offset });
    for (const item of page.items) {
      if (!seen.has(item.id)) items.push(item);
      seen.add(item.id);
    }
    offset += page.items.length;
    if (!page.items.length || offset >= page.total) return items;
  }
}
