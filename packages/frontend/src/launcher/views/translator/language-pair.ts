import { AUTO_LANGUAGE, normalizeLanguageCode } from "./languages";

export interface LanguagePair {
  /** A language code or `auto`. */
  source: string;
  target: string;
}

/** The last pair the user chose, with the configured defaults at that time. */
export interface StoredLanguagePair extends LanguagePair {
  defaults: LanguagePair;
}

const STORAGE_KEY = "opencast.translator.languages";

function validSource(code: string | undefined): string | null {
  if (code === AUTO_LANGUAGE) return AUTO_LANGUAGE;
  return normalizeLanguageCode(code);
}

/**
 * The pair a new Translate view starts with: the last pair the user picked,
 * unless the defaults in Settings changed since (then the new defaults win),
 * with a command's own languages (e.g. "Translate to Spanish") on top.
 */
export function initialLanguagePair(stored: StoredLanguagePair | null, defaults: LanguagePair, override: Partial<LanguagePair> = {}): LanguagePair {
  const fallback = { source: validSource(defaults.source) ?? AUTO_LANGUAGE, target: normalizeLanguageCode(defaults.target) ?? "en" };
  const sameDefaults = stored && stored.defaults.source === defaults.source && stored.defaults.target === defaults.target;
  const base = sameDefaults ? { source: validSource(stored.source) ?? fallback.source, target: normalizeLanguageCode(stored.target) ?? fallback.target } : fallback;
  return { source: validSource(override.source) ?? base.source, target: normalizeLanguageCode(override.target) ?? base.target };
}

export function readStoredPair(storage: Pick<Storage, "getItem">): StoredLanguagePair | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const { source, target, defaults } = value as Partial<StoredLanguagePair>;
    if (typeof source !== "string" || typeof target !== "string" || typeof defaults?.source !== "string" || typeof defaults.target !== "string") return null;
    return { source, target, defaults: { source: defaults.source, target: defaults.target } };
  } catch {
    return null;
  }
}

export function writeStoredPair(storage: Pick<Storage, "setItem">, pair: LanguagePair, defaults: LanguagePair): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ source: pair.source, target: pair.target, defaults }));
  } catch {
    // Storage can be unavailable (private mode); the pair just isn't remembered.
  }
}

/**
 * Swapping needs a concrete source: with "Detect Language" the detected
 * language takes its place. Returns null when there is nothing to swap with.
 */
export function swapLanguagePair(pair: LanguagePair, detected: string | undefined): LanguagePair | null {
  const source = pair.source === AUTO_LANGUAGE ? detected : pair.source;
  if (!source || source === pair.target) return null;
  return { source: pair.target, target: source };
}
