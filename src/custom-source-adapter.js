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

export function buildVoiceServiceResult(selection, result = {}, options = {}) {
  const selectedText = normalizeSelection(selection);
  const template = normalizeVoiceServiceUrlTemplate(options.urlTemplate);
  const sourceForm = normalizeSelection(result.sourceForm || result.display || selectedText);
  const language = normalizeSelection(result.language);
  const ttsLang = normalizeSelection(result.ttsLang || language);
  const url = buildVoiceServiceAudioUrl(template, {
    text: sourceForm,
    sourceForm,
    query: selectedText,
    lang: ttsLang,
    language
  });
  if (!selectedText || !sourceForm || !ttsLang || !url || !canGenerateVoiceServiceAudio(result)) {
    return null;
  }

  const label = normalizeSelection(options.label || "Voice service");
  return createRemoteStructuredResult(selectedText, {
    id: `voice-service:${createLookupKey([sourceForm, ttsLang || language].join(" "))}`,
    display: result.display || sourceForm,
    sourceForm,
    aliases: result.aliases || [],
    variants: result.variants || [],
    language,
    languageName: result.languageName,
    ttsLang,
    category: result.category || "term",
    root: result.root,
    domainHint: result.domainHint,
    pronunciation: {
      ipa: result.pronunciation?.ipa || "",
      simple: result.pronunciation?.simple || "",
      audio: [{
        url,
        label: `${label} audio`,
        source: label,
        quality: "generated"
      }]
    },
    sourceStatus: "generated-audio",
    confidence: "medium",
    evidence: [`Audio URL from ${label}`],
    sources: [{ label, url }]
  });
}

function canGenerateVoiceServiceAudio(result = {}) {
  return [
    "verified-audio",
    "community-confirmed",
    "structured-source"
  ].includes(normalizeSelection(result.sourceStatus));
}

export function buildVoiceServiceAudioUrl(template, values = {}) {
  const normalizedTemplate = normalizeVoiceServiceUrlTemplate(template);
  if (!normalizedTemplate) {
    return "";
  }

  const safeValues = {
    text: normalizeSelection(values.text),
    sourceForm: normalizeSelection(values.sourceForm || values.text),
    query: normalizeSelection(values.query),
    lang: normalizeSelection(values.lang),
    language: normalizeSelection(values.language || baseLanguage(values.lang))
  };

  const expanded = hasVoiceServicePlaceholders(normalizedTemplate)
    ? expandVoiceServiceTemplate(normalizedTemplate, safeValues)
    : appendVoiceServiceParams(normalizedTemplate, safeValues);

  return normalizeUrl(expanded);
}

export function normalizeVoiceServiceUrlTemplate(value) {
  const raw = String(value || "").replace(/\s+/g, " ").trim().slice(0, 2048);
  if (!raw) {
    return "";
  }

  const sample = hasVoiceServicePlaceholders(raw)
    ? expandVoiceServiceTemplate(raw, {
      text: "example",
      sourceForm: "example",
      query: "example",
      lang: "en-US",
      language: "en"
    })
    : raw;

  return normalizeUrl(sample) ? raw : "";
}

export function buildCustomSourceResult(query, payload = {}, options = {}) {
  const selectedText = normalizeSelection(query);
  const lookupText = normalizeSelection(options.lookupWord || selectedText);
  const rankedEntries = rankedCustomEntries(lookupText, payload);
  const entry = rankedEntries[0]?.entry;
  if (!selectedText || !lookupText || !entry) {
    return null;
  }

  const label = normalizeSelection(options.label || payload.sourceName || payload.name || "Custom source");
  const result = createCustomSourceEntryResult(selectedText, entry, payload, label);
  const alternateResults = alternateResultsFromRankedEntries(selectedText, rankedEntries.slice(1), payload, label);

  return alternateResults.length
    ? { ...result, alternateResults }
    : result;
}

export function selectBestCustomEntry(query, payload = {}) {
  return rankedCustomEntries(query, payload)[0]?.entry || null;
}

function rankedCustomEntries(query, payload = {}) {
  const entries = normalizeEntries(payload);
  return entries
    .map((entry, index) => ({
      entry,
      score: scoreEntry(query, entry, index)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
}

function createCustomSourceEntryResult(selectedText, entry, payload, label) {
  const sourceForm = normalizeSelection(entry.sourceForm || entry.native || entry.term || entry.display || selectedText);
  const display = normalizeSelection(entry.display || entry.term || sourceForm || selectedText);
  const audio = normalizeAudio(entry);
  const ipa = normalizeSelection(entry.ipa || entry.pronunciation?.ipa);
  const simple = normalizeSelection(entry.simple || entry.pronunciation?.simple);
  const sourceStatus = normalizeSourceStatus(entry.sourceStatus || (audio.length ? "verified-audio" : "structured-source"));
  const confidence = normalizeConfidence(entry.confidence || (audio.length || ipa || simple ? "high" : "medium"));
  const sourceUrl = normalizeUrl(entry.sourceUrl || entry.url || payload.sourceUrl);

  return createRemoteStructuredResult(selectedText, {
    id: `custom:${normalizeSelection(entry.id || createLookupKey(display || sourceForm))}`,
    display,
    aliases: normalizeAliases(entry.aliases),
    trustSignals: entry.trustSignals || [],
    variants: normalizeAliases(entry.variants),
    sourceForm,
    language: normalizeSelection(entry.language),
    languageName: normalizeSelection(entry.languageName),
    category: normalizeSelection(entry.category || "domain-term"),
    origin: normalizeSelection(entry.origin || entry.root || entry.domain),
    root: normalizeSelection(entry.root),
    domainHint: normalizeSelection(entry.domainHint || entry.domain),
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

function alternateResultsFromRankedEntries(selectedText, rankedEntries, payload, label) {
  const alternates = [];
  const seen = new Set();

  for (const { entry } of rankedEntries) {
    const result = createCustomSourceEntryResult(selectedText, entry, payload, label);
    const key = customResultKey(result);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    alternates.push(result);

    if (alternates.length >= 4) {
      break;
    }
  }

  return alternates;
}

function customResultKey(result = {}) {
  return [
    normalizeSelection(result.id),
    createLookupKey(result.sourceForm || result.display || result.query),
    normalizeSelection(result.language)
  ].filter(Boolean).join("|");
}

function normalizeEntries(payload = {}) {
  if (Array.isArray(payload)) {
    return payload.filter(isPlainObject);
  }

  if (Array.isArray(payload.entries)) {
    return payload.entries.filter(isPlainObject);
  }

  if (isPlainObject(payload.entries)) {
    return Object.values(payload.entries).filter(isPlainObject);
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
    ...normalizeAliases(entry.aliases),
    ...normalizeAliases(entry.variants)
  ]
    .map(createLookupKey)
    .filter(Boolean);
}

function normalizeAliases(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))].slice(0, 12);
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

function hasVoiceServicePlaceholders(template) {
  return voiceServicePlaceholders().some((placeholder) => template.includes(placeholder));
}

function expandVoiceServiceTemplate(template, values) {
  return voiceServicePlaceholders().reduce((next, placeholder) => {
    const key = placeholder.slice(1, -1);
    return next.replaceAll(placeholder, encodeURIComponent(values[key] || ""));
  }, template);
}

function appendVoiceServiceParams(template, values) {
  try {
    const url = new URL(template);
    if (values.text) {
      url.searchParams.set("text", values.text);
    }
    if (values.lang) {
      url.searchParams.set("lang", values.lang);
    }
    return url.toString();
  } catch {
    return "";
  }
}

function voiceServicePlaceholders() {
  return [
    "{text}",
    "{sourceForm}",
    "{query}",
    "{lang}",
    "{language}"
  ];
}

function baseLanguage(value) {
  return normalizeSelection(value).split("-")[0];
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
