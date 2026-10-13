/**
 * Messages don't store how long the model reasoned, so the window measures it
 * while streaming and remembers it per message for "Thought for Ns" labels.
 */
const KEY = "opencast.ai.reasoningDurations";
const LIMIT = 500;

let cache: Map<string, number> | null = null;

function load(): Map<string, number> {
  if (cache) return cache;
  cache = new Map();
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) for (const [id, ms] of JSON.parse(raw) as [string, number][]) cache.set(id, ms);
  } catch {
    // Unreadable storage only loses the labels.
  }
  return cache;
}

export function rememberReasoningDuration(messageId: string, ms: number): void {
  const map = load();
  map.delete(messageId);
  map.set(messageId, ms);
  while (map.size > LIMIT) map.delete(map.keys().next().value as string);
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify([...map]));
  } catch {
    // Quota or privacy mode: keep the in-memory copy.
  }
}

export function reasoningDuration(messageId: string): number | undefined {
  return load().get(messageId);
}
