import {
  createLookupKey,
  createRemoteStructuredResult,
  normalizeSelection
} from "./resolver-core.js";

const VALID_CONFIDENCE = new Set(["high", "medium", "low", "unknown"]);
const VALID_SOURCE_STATUS = new Set([
  "verified-audio",
  "community-confirmed",
  "structured-source",
  "generated-from-source",
  "unknown"
]);

export function buildCustomSourceUrl(query, endpoint) {
  const selectedText = normalizeSelection(query);
  const url = normalizeEndpoint(endpoint);
  if (!selectedText || !url) {
    return "";
  }

  url.searchParams.set("q", selectedText);
  return url.toString();
}

export function buildCustomSourceResult(query, payload = {}, options = {}) {
  const selectedText = normalizeSelection(query);
  const entry = selectBestCustomEntry(selectedText, payload);
  if (!selectedText || !entry) {
    return null;
  }

  const sourceForm = normalizeSelection(entry.sourceForm || entry.native || entry.term || entry.display || selectedText);
  const display = normalizeSelection(entry.display || entry.term || sourceForm || selectedText);
  const label = normalizeSelection(options.label || payload.sourceName || payload.name || "Custom source");
  const audio = normalizeAudio(entry);
  const ipa = normalizeSelection(entry.ipa || entry.pronunciation?.ipa);
  const simple = normalizeSelection(entry.simple || entry.pronunciation?.simple);
  const sourceStatus = normalizeSourceStatus(entry.sourceStatus || (audio.length ? "verified-audio" : "structured-source"));
  const confidence = normalizeConfidence(entry.confidence || (audio.length || ipa || simple ? "high" : "medium"));
  const sourceUrl = normalizeUrl(entry.sourceUrl || entry.url || payload.sourceUrl);

  return createRemoteStructuredResult(selectedText, {
    id: `custom:${normalizeSelection(entry.id || createLookupKey(display || sourceForm))}`,
    display,
    sourceForm,
    language: normalizeSelection(entry.language),
    languageName: normalizeSelection(entry.languageName),
    category: normalizeSelection(entry.category || "domain-term"),
    origin: normalizeSelection(entry.origin || entry.root || entry.domain),
    pronunciation: {
      ipa,
      simple,
      audio
    },
    sourceStatus,
    confidence,
    evidence: [
      `Structured result from ${label}`,
      entry.root ? `Root: ${normalizeSelection(entry.root)}` : "",
      entry.domain ? `Domain: ${normalizeSelection(entry.domain)}` : "",
      ...(Array.isArray(entry.evidence) ? entry.evidence.map(normalizeSelection) : [])
    ].filter(Boolean),
    sources: [
      sourceUrl ? { label, url: sourceUrl } : null,
      ...normalizeSourceLinks(entry.sources)
    ].filter(Boolean),
    notes: normalizeSelection(entry.notes || entry.variantNote)
  });
}

export function selectBestCustomEntry(query, payload = {}) {
  const entries = normalizeEntries(payload);
  return entries
    .map((entry, index) => ({
      entry,
      score: scoreEntry(query, entry, index)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.entry || null;
}

function normalizeEntries(payload = {}) {
  if (Array.isArray(payload)) {
    return payload.filter(isPlainObject);
  }

  if (Array.isArray(payload.entries)) {
    return payload.entries.filter(isPlainObject);
  }

  if (isPlainObject(payload.entry)) {
    return [payload.entry];
  }

  if (isPlainObject(payload.result)) {
    return [payload.result];
  }

  return isPlainObject(payload) && hasPronunciationShape(payload) ? [payload] : [];
}

function hasPronunciationShape(entry = {}) {
  return Boolean(
    entry.term ||
    entry.display ||
    entry.sourceForm ||
    entry.native ||
    entry.ipa ||
    entry.simple ||
    entry.audioUrl ||
    entry.pronunciation
  );
}

function scoreEntry(query, entry = {}, index) {
  const queryKey = createLookupKey(query);
  const keys = entryKeys(entry);
  let score = Math.max(0, 16 - index);

  if (!queryKey || !keys.length) {
    return 0;
  }

  if (keys.includes(queryKey)) {
    score += 50;
  } else if (keys.some((key) => key.includes(queryKey) || queryKey.includes(key))) {
    score += 12;
  } else {
    return 0;
  }

  if (entry.sourceForm || entry.native) {
    score += 8;
  }

  if (entry.ipa || entry.simple || entry.pronunciation?.ipa || entry.pronunciation?.simple) {
    score += 8;
  }

  if (normalizeAudio(entry).length) {
    score += 18;
  }

  if (entry.confidence === "high") {
    score += 8;
  }

  return score;
}

function entryKeys(entry = {}) {
  return [
    entry.term,
    entry.display,
    entry.sourceForm,
    entry.native,
    ...(Array.isArray(entry.aliases) ? entry.aliases : [])
  ]
    .map(createLookupKey)
    .filter(Boolean);
}

function normalizeAudio(entry = {}) {
  const pronunciationAudio = Array.isArray(entry.pronunciation?.audio)
    ? entry.pronunciation.audio
    : [];
  const audio = [
    entry.audioUrl ? {
      url: entry.audioUrl,
      label: entry.audioLabel,
      source: entry.audioSource,
      quality: entry.audioQuality
    } : null,
    ...pronunciationAudio
  ].filter(Boolean);

  return audio
    .map((item) => ({
      url: normalizeUrl(item.url),
      label: normalizeSelection(item.label || item.source || "Pronunciation audio"),
      source: normalizeSelection(item.source || "Custom source"),
      quality: normalizeSelection(item.quality || "verified")
    }))
    .filter((item) => item.url);
}

function normalizeSourceLinks(value = []) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      label: normalizeSelection(item?.label || item?.source || "Source"),
      url: normalizeUrl(item?.url)
    }))
    .filter((item) => item.url);
}

function normalizeEndpoint(endpoint) {
  try {
    const url = new URL(String(endpoint || "").trim());
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeConfidence(value) {
  return VALID_CONFIDENCE.has(value) ? value : "";
}

function normalizeSourceStatus(value) {
  return VALID_SOURCE_STATUS.has(value) ? value : "";
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
