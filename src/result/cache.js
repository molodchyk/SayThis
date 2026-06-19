import {
  createLookupKey,
  normalizeSelection,
  rankedAudioItems
} from "../resolver-core.js";

export const RESULT_CACHE_SCHEMA_VERSION = 1;
export const DEFAULT_RESULT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_RESULT_CACHE_LIMIT = 200;

const CACHEABLE_STATUSES = new Set([
  "verified-audio",
  "generated-audio",
  "community-confirmed",
  "structured-source",
  "generated-from-source"
]);

export function normalizeResultCache(value = {}, options = {}) {
  const now = normalizeTimestamp(options.now, Date.now());
  const ttlMs = normalizePositiveInteger(options.ttlMs, DEFAULT_RESULT_CACHE_TTL_MS);
  const limit = normalizePositiveInteger(options.limit, DEFAULT_RESULT_CACHE_LIMIT);
  const rawEntries = value?.entries && typeof value.entries === "object" ? value.entries : value;
  const entries = Object.values(rawEntries || {})
    .map((entry) => normalizeCacheEntry(entry, now))
    .filter((entry) => entry && !isExpired(entry, now, ttlMs))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit);

  return {
    schemaVersion: RESULT_CACHE_SCHEMA_VERSION,
    updatedAt: entries[0]?.updatedAt || now,
    entries: Object.fromEntries(entries.map((entry) => [entry.cacheKey, entry]))
  };
}

export function readCachedResult(cache, selection, options = {}) {
  const normalized = normalizeResultCache(cache, options);
  const lookupKey = createLookupKey(selection);
  const cacheKey = cacheKeyForLookupKey(lookupKey, options.cacheScope);
  const entry = normalized.entries[cacheKey];
  if (!entry) {
    return {
      hit: false,
      cache: normalized,
      result: null
    };
  }

  return {
    hit: true,
    cache: normalized,
    entry,
    result: {
      ...entry.result,
      query: normalizeSelection(selection) || entry.result.query,
      lookupKey,
      evidence: [
        "Local lookup cache",
        ...(entry.result.evidence || [])
      ]
    }
  };
}

export function upsertCachedResult(cache, selection, result, options = {}) {
  const now = normalizeTimestamp(options.now, Date.now());
  const normalized = normalizeResultCache(cache, { ...options, now });
  if (!isCacheableResult(result)) {
    return normalized;
  }

  const lookupKey = createLookupKey(selection || result.query || result.display || result.sourceForm);
  if (!lookupKey) {
    return normalized;
  }

  const cacheKey = cacheKeyForLookupKey(lookupKey, options.cacheScope);
  const term = normalizeSelection(selection || result.query || result.display || result.sourceForm);
  const nextEntry = {
    cacheKey,
    lookupKey,
    term,
    createdAt: normalized.entries[cacheKey]?.createdAt || now,
    updatedAt: now,
    result: normalizeCachedResult(result, lookupKey, term)
  };

  return normalizeResultCache({
    ...normalized,
    updatedAt: now,
    entries: {
      ...normalized.entries,
      [cacheKey]: nextEntry
    }
  }, { ...options, now });
}

export function resultCacheSummary(cache, options = {}) {
  const normalized = normalizeResultCache(cache, options);
  const entries = Object.values(normalized.entries);
  const newest = entries.reduce((latest, entry) => Math.max(latest, entry.updatedAt), 0);
  return {
    count: entries.length,
    newestAt: newest ? new Date(newest).toISOString() : ""
  };
}

export function isCacheableResult(result) {
  if (!result || typeof result !== "object") {
    return false;
  }

  return CACHEABLE_STATUSES.has(result.sourceStatus) && Boolean(
    result.sourceForm ||
    result.pronunciation?.ipa ||
    result.pronunciation?.simple ||
    result.pronunciation?.audio?.length
  );
}

function normalizeCacheEntry(value, now) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result = value.result && typeof value.result === "object" ? value.result : null;
  if (!result) {
    return null;
  }

  const lookupKey = createLookupKey(value.lookupKey || result.lookupKey || value.term || result.query || result.display);
  if (!lookupKey) {
    return null;
  }

  const cacheKey = normalizeCacheKey(value.cacheKey) || lookupKey;
  const term = normalizeSelection(value.term || result.query || result.display || result.sourceForm);
  return {
    cacheKey,
    lookupKey,
    term,
    createdAt: normalizeTimestamp(value.createdAt, now),
    updatedAt: normalizeTimestamp(value.updatedAt, now),
    result: normalizeCachedResult(result, lookupKey, term)
  };
}

function cacheKeyForLookupKey(lookupKey, cacheScope) {
  const scope = normalizeCacheKey(cacheScope);
  return scope ? `${scope}:${lookupKey}` : lookupKey;
}

function normalizeCacheKey(value) {
  return createLookupKey(value).slice(0, 220);
}

function normalizeCachedResult(result, lookupKey, term) {
  return {
    id: normalizeSelection(result.id),
    lookupKey,
    query: normalizeSelection(result.query || term),
    display: normalizeSelection(result.display || term),
    aliases: normalizeAliases(result.aliases),
    trustSignals: normalizeAliases(result.trustSignals),
    sourceForm: normalizeSelection(result.sourceForm),
    speakText: normalizeSelection(result.speakText || result.sourceForm || result.display || term),
    script: normalizeSelection(result.script),
    queryScript: normalizeSelection(result.queryScript),
    language: normalizeSelection(result.language),
    languageName: normalizeSelection(result.languageName),
    ttsLang: normalizeSelection(result.ttsLang),
    category: normalizeSelection(result.category),
    origin: normalizeSelection(result.origin),
    root: normalizeSelection(result.root),
    domainHint: normalizeSelection(result.domainHint),
    variants: normalizeAliases(result.variants),
    pronunciation: normalizePronunciation(result.pronunciation),
    confidence: normalizeSelection(result.confidence),
    sourceStatus: normalizeSelection(result.sourceStatus),
    sourceLabel: normalizeSelection(result.sourceLabel),
    evidence: Array.isArray(result.evidence) ? result.evidence.slice(0, 8).map(normalizeSelection).filter(Boolean) : [],
    sources: normalizeSourceItems(result.sources).slice(0, 8),
    notes: normalizeSelection(result.notes || result.variantNote),
    community: normalizeCommunity(result.community),
    alternateResults: normalizeAlternateResults(result.alternateResults).slice(0, 3)
  };
}

function normalizePronunciation(pronunciation = {}) {
  return {
    ipa: normalizeSelection(pronunciation.ipa),
    simple: normalizeSelection(pronunciation.simple),
    audio: normalizeAudioItems(pronunciation.audio)
  };
}

function normalizeAudioItems(audio = []) {
  if (!Array.isArray(audio)) {
    return [];
  }

  return rankedAudioItems(audio.map((item) => ({
      url: normalizeSafeUrl(item?.url),
      label: normalizeSelection(item?.label),
      source: normalizeSelection(item?.source),
      quality: normalizeSelection(item?.quality)
    })).filter((item) => item.url)).slice(0, 8);
}

function normalizeSourceItems(sources = []) {
  return Array.isArray(sources)
    ? sources.map((item) => ({
      label: normalizeSelection(item?.label || item?.source || "Source"),
      url: normalizeSafeUrl(item?.url)
    })).filter((item) => item.url)
    : [];
}

function normalizeAlternateResults(items = []) {
  return Array.isArray(items)
    ? items.map((item) => ({
      id: normalizeSelection(item?.id),
      display: normalizeSelection(item?.display),
      sourceForm: normalizeSelection(item?.sourceForm),
      language: normalizeSelection(item?.language),
      languageName: normalizeSelection(item?.languageName),
      ttsLang: normalizeSelection(item?.ttsLang),
      category: normalizeSelection(item?.category),
      root: normalizeSelection(item?.root),
      domainHint: normalizeSelection(item?.domainHint),
      variants: normalizeAliases(item?.variants),
      confidence: normalizeSelection(item?.confidence),
      sourceStatus: normalizeSelection(item?.sourceStatus),
      sourceLabel: normalizeSelection(item?.sourceLabel),
      pronunciation: normalizePronunciation(item?.pronunciation),
      evidence: Array.isArray(item?.evidence) ? item.evidence.slice(0, 2).map(normalizeSelection).filter(Boolean) : [],
      sources: normalizeSourceItems(item?.sources).slice(0, 2)
    })).filter((item) => item.display || item.sourceForm || item.pronunciation.ipa || item.pronunciation.simple)
    : [];
}

function normalizeCommunity(value = {}) {
  return {
    confirmations: normalizeCount(value.confirmations),
    flags: normalizeCount(value.flags),
    requests: normalizeCount(value.requests),
    corrections: normalizeCount(value.corrections),
    updatedAt: normalizeSelection(value.updatedAt)
  };
}

function normalizeAliases(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))].slice(0, 12);
}

function normalizeSafeUrl(value) {
  const raw = normalizeLongValue(value);
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    return ["https:", "chrome-extension:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function isExpired(entry, now, ttlMs) {
  return ttlMs > 0 && now - entry.updatedAt > ttlMs;
}

function normalizeTimestamp(value, fallback) {
  const number = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeLongValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
}

function normalizeCount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return Math.floor(Math.min(100000, number));
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.floor(number);
}
