export const MAX_SELECTION_LENGTH = 160;

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const SPACE_OR_DASH = /[\s\-_]+/g;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

const LANGUAGE_TO_TTS = {
  ar: "ar",
  de: "de-DE",
  el: "el-GR",
  en: "en-US",
  es: "es-ES",
  fa: "fa-IR",
  fr: "fr-FR",
  ga: "en-IE",
  he: "he-IL",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  la: "it-IT",
  pl: "pl-PL",
  pt: "pt-PT",
  ru: "ru-RU",
  vi: "vi-VN",
  zh: "zh-CN"
};

const SCRIPT_HINTS = {
  Arabic: { language: "ar", languageName: "Arabic", ttsLang: "ar" },
  Armenian: { language: "hy", languageName: "Armenian", ttsLang: "hy-AM" },
  Cyrillic: { language: "ru", languageName: "Cyrillic-script term", ttsLang: "ru-RU" },
  Devanagari: { language: "hi", languageName: "Devanagari-script term", ttsLang: "hi-IN" },
  Greek: { language: "el", languageName: "Greek", ttsLang: "el-GR" },
  Han: { language: "zh", languageName: "CJK ideographic term", ttsLang: "zh-CN" },
  Hangul: { language: "ko", languageName: "Korean", ttsLang: "ko-KR" },
  Hebrew: { language: "he", languageName: "Hebrew", ttsLang: "he-IL" },
  Hiragana: { language: "ja", languageName: "Japanese", ttsLang: "ja-JP" },
  Katakana: { language: "ja", languageName: "Japanese", ttsLang: "ja-JP" },
  Thai: { language: "th", languageName: "Thai", ttsLang: "th-TH" }
};

const SOURCE_LABELS = {
  "verified-audio": "Verified audio",
  "community-confirmed": "Community confirmed",
  "structured-source": "Structured source",
  "generated-from-source": "Generated from source form",
  "best-effort-fallback": "Best-effort fallback",
  unknown: "Unknown"
};

const CONFIDENCE_RANK = {
  high: 5,
  medium: 3,
  low: 1,
  unknown: 0
};

export function normalizeSelection(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SELECTION_LENGTH);
}

export function createLookupKey(value) {
  return normalizeSelection(value)
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(EDGE_PUNCTUATION, "")
    .replace(SPACE_OR_DASH, " ")
    .toLocaleLowerCase();
}

export function detectScript(value) {
  const text = normalizeSelection(value);
  const counts = new Map();

  for (const char of text) {
    const code = char.codePointAt(0);
    const script = scriptForCodePoint(code);
    if (!script) {
      continue;
    }
    counts.set(script, (counts.get(script) || 0) + 1);
  }

  if (!counts.size) {
    return { script: "Unknown", confidence: "unknown", counts: {} };
  }

  const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  const [script, count] = sorted[0];
  const total = sorted.reduce((sum, [, value]) => sum + value, 0);
  const ratio = count / total;

  return {
    script,
    confidence: ratio >= 0.8 ? "high" : "medium",
    counts: Object.fromEntries(sorted)
  };
}

export function resolveTerm(selection, options = {}) {
  const query = normalizeSelection(selection);
  const lookupKey = createLookupKey(query);
  const scriptInfo = detectScript(query);

  if (!query || !lookupKey) {
    return createUnknownResult(query, lookupKey, scriptInfo);
  }

  const communityEntry = findCommunityEntry(lookupKey, options.communityEntries);
  if (communityEntry && hasCommunityPronunciationData(communityEntry)) {
    return createCommunityResult(query, lookupKey, scriptInfo, communityEntry);
  }

  const seedEntry = findSeedEntry(lookupKey, options.entries);
  if (seedEntry) {
    return withCommunitySummary(createEntryResult(query, lookupKey, scriptInfo, seedEntry), communityEntry);
  }

  return withCommunitySummary(createFallbackResult(query, lookupKey, scriptInfo), communityEntry);
}

export function mergeRemoteResult(localResult, remoteResult) {
  if (!remoteResult) {
    return localResult;
  }

  if (!localResult || localResult.sourceStatus === "unknown") {
    return remoteResult;
  }

  const localRank = CONFIDENCE_RANK[localResult.confidence] || 0;
  const remoteRank = CONFIDENCE_RANK[remoteResult.confidence] || 0;

  if (localResult.sourceStatus === "best-effort-fallback" && remoteRank >= localRank) {
    return withAlternateResults(remoteResult, [localResult]);
  }

  if (remoteRank > localRank) {
    return withAlternateResults(remoteResult, [localResult]);
  }

  if (!localResult.sourceForm && remoteResult.sourceForm) {
    return withAlternateResults({
      ...localResult,
      ...remoteResult,
      community: localResult.community
    }, [localResult]);
  }

  return withAlternateResults(localResult, [remoteResult]);
}

export function createRemoteStructuredResult(selection, source) {
  const query = normalizeSelection(selection);
  const lookupKey = createLookupKey(query);
  const scriptInfo = detectScript(query);
  const sourceForm = normalizeSelection(source.sourceForm || source.display || query);
  const language = normalizeLanguage(source.language);
  const hasAudio = Boolean(source.pronunciation?.audio?.length);
  const sourceStatus = normalizeSourceStatus(source.sourceStatus || (hasAudio ? "verified-audio" : "structured-source"));

  return normalizeResult({
    id: source.id || `remote:${lookupKey}`,
    query,
    lookupKey,
    display: source.display || query,
    aliases: source.aliases || [],
    trustSignals: source.trustSignals || [],
    sourceForm,
    speakText: sourceForm || query,
    script: detectScript(sourceForm || query).script,
    queryScript: scriptInfo.script,
    language,
    languageName: source.languageName || languageNameFromCode(language) || "Unknown",
    ttsLang: source.ttsLang || ttsLangFromLanguage(language),
    category: source.category || "term",
    origin: source.origin || "",
    pronunciation: source.pronunciation || {},
    confidence: source.confidence || (hasAudio ? "high" : "medium"),
    sourceStatus,
    sourceLabel: SOURCE_LABELS[sourceStatus],
    evidence: source.evidence || [],
    sources: source.sources || [],
    notes: source.notes || "",
    community: emptyCommunity()
  });
}

export function updateCommunityEntries(entries, selection, feedback) {
  const query = normalizeSelection(selection);
  const lookupKey = createLookupKey(query);
  if (!lookupKey) {
    return entries || {};
  }

  const now = new Date().toISOString();
  const existing = { ...((entries || {})[lookupKey] || {}) };
  const next = {
    term: existing.term || query,
    lookupKey,
    confirmations: Number(existing.confirmations || 0),
    flags: Number(existing.flags || 0),
    requests: Number(existing.requests || 0),
    corrections: Number(existing.corrections || 0),
    sourceForm: existing.sourceForm || "",
    aliases: normalizeAliases(existing.aliases),
    language: existing.language || "",
    languageName: existing.languageName || "",
    origin: existing.origin || "",
    ipa: existing.ipa || "",
    simple: existing.simple || "",
    audioUrl: existing.audioUrl || "",
    sourceUrl: existing.sourceUrl || "",
    variantNote: existing.variantNote || "",
    createdAt: existing.createdAt || now,
    updatedAt: now
  };

  if (feedback.kind === "confirm") {
    next.confirmations += 1;
  } else if (feedback.kind === "wrong") {
    next.flags += 1;
  } else if (feedback.kind === "missing") {
    next.requests += 1;
  } else if (feedback.kind === "correction") {
    next.corrections += 1;
    for (const field of ["sourceForm", "aliases", "language", "languageName", "origin", "ipa", "simple", "audioUrl", "sourceUrl", "variantNote"]) {
      const value = field === "aliases"
        ? normalizeAliases(feedback[field])
        : field === "audioUrl" || field === "sourceUrl"
          ? normalizeLongValue(feedback[field])
          : normalizeSelection(feedback[field]);
      if (Array.isArray(value) ? value.length : Boolean(value)) {
        next[field] = value;
      }
    }
  }

  return {
    ...(entries || {}),
    [lookupKey]: next
  };
}

export function applyCommunitySummary(result, communityEntry) {
  if (!result || !communityEntry) {
    return result;
  }

  return withCommunitySummary(result, communityEntry);
}

export function resultToSpeechOptions(result, overrides = {}) {
  const text = normalizeSelection(overrides.text || result?.speakText || result?.sourceForm || result?.display || result?.query);
  const lang = overrides.lang && overrides.lang !== "auto" ? overrides.lang : result?.ttsLang;
  const rate = Number(overrides.rate || 0.82);
  const options = {
    enqueue: false,
    rate: clamp(rate, 0.45, 1.4)
  };

  if (lang) {
    options.lang = lang;
  }

  return { text, options };
}

export function getBestAudio(result) {
  const audio = result?.pronunciation?.audio;
  if (!Array.isArray(audio) || !audio.length) {
    return null;
  }

  return audio.find((item) => item?.url && item.quality === "verified") || audio.find((item) => item?.url) || null;
}

export function mapResultAudioUrls(result, resolveUrl) {
  if (!result?.pronunciation?.audio?.length || typeof resolveUrl !== "function") {
    return result;
  }

  return {
    ...result,
    pronunciation: {
      ...result.pronunciation,
      audio: result.pronunciation.audio.map((item) => ({
        ...item,
        url: shouldResolveAudioUrl(item.url) ? resolveUrl(item.url) : item.url
      }))
    }
  };
}

export function sourceLabelForStatus(status) {
  return SOURCE_LABELS[status] || SOURCE_LABELS.unknown;
}

function findSeedEntry(lookupKey, entries = []) {
  return entries.find((entry) => entryKeys(entry).includes(lookupKey));
}

function findCommunityEntry(lookupKey, entries = {}) {
  if (Array.isArray(entries)) {
    return entries.find((entry) => communityEntryKeys(entry).includes(lookupKey));
  }

  return entries[lookupKey] || Object.values(entries).find((entry) => communityEntryKeys(entry).includes(lookupKey)) || null;
}

function createEntryResult(query, lookupKey, scriptInfo, entry) {
  const pronunciation = normalizePronunciation(entry.pronunciation);
  const language = normalizeLanguage(entry.language);
  const sourceForm = normalizeSelection(entry.sourceForm || entry.native || entry.display || query);
  const sourceStatus = normalizeSourceStatus(entry.sourceStatus || "structured-source");

  return normalizeResult({
    id: entry.id,
    query,
    lookupKey,
    display: entry.display || query,
    sourceForm,
    speakText: sourceForm || query,
    script: detectScript(sourceForm || query).script,
    queryScript: scriptInfo.script,
    language,
    languageName: entry.languageName || languageNameFromCode(language),
    ttsLang: entry.ttsLang || ttsLangFromLanguage(language),
    category: entry.category || "term",
    origin: normalizeOrigin(entry.origin),
    pronunciation,
    confidence: normalizeConfidence(entry.confidence || "medium"),
    sourceStatus,
    sourceLabel: sourceLabelForStatus(sourceStatus),
    evidence: entry.evidence || ["Bundled resolver entry"],
    sources: entry.sources || [],
    notes: entry.notes || "",
    community: emptyCommunity()
  });
}

function createCommunityResult(query, lookupKey, scriptInfo, entry) {
  const confirmations = Number(entry.confirmations || 0);
  const corrections = Number(entry.corrections || 0);
  const sourceStatus = confirmations >= 2 ? "community-confirmed" : "structured-source";
  const confidence = confirmations >= 2 ? "medium" : "low";
  const sourceForm = normalizeSelection(entry.sourceForm || entry.term || query);
  const language = normalizeLanguage(entry.language);

  return normalizeResult({
    id: `community:${lookupKey}`,
    query,
    lookupKey,
    display: entry.term || query,
    aliases: normalizeAliases(entry.aliases),
    trustSignals: normalizeTrustSignals(entry.trustSignals),
    sourceForm,
    speakText: sourceForm || query,
    script: detectScript(sourceForm || query).script,
    queryScript: scriptInfo.script,
    language,
    languageName: entry.languageName || languageNameFromCode(language),
    ttsLang: ttsLangFromLanguage(language),
    category: "community-entry",
    origin: entry.origin || "",
    pronunciation: {
      ipa: entry.ipa || "",
      simple: entry.simple || "",
      audio: entry.audioUrl ? [{ url: entry.audioUrl, label: "Community audio source" }] : []
    },
    confidence,
    sourceStatus,
    sourceLabel: sourceLabelForStatus(sourceStatus),
    evidence: [`${corrections} correction${corrections === 1 ? "" : "s"}`, `${confirmations} confirmation${confirmations === 1 ? "" : "s"}`],
    sources: communitySourceLinks(entry),
    notes: entry.variantNote || "",
    community: communitySummary(entry)
  });
}

function createFallbackResult(query, lookupKey, scriptInfo) {
  const hint = SCRIPT_HINTS[scriptInfo.script] || {};
  const isLatin = scriptInfo.script === "Latin";
  const sourceStatus = isLatin ? "best-effort-fallback" : "generated-from-source";

  return normalizeResult({
    id: `fallback:${lookupKey}`,
    query,
    lookupKey,
    display: query,
    sourceForm: query,
    speakText: query,
    script: scriptInfo.script,
    queryScript: scriptInfo.script,
    language: hint.language || "",
    languageName: hint.languageName || (isLatin ? "Unresolved Latin-script term" : "Unresolved term"),
    ttsLang: hint.ttsLang || "",
    category: "unresolved",
    origin: "",
    pronunciation: {},
    confidence: isLatin ? "low" : "medium",
    sourceStatus,
    sourceLabel: sourceLabelForStatus(sourceStatus),
    evidence: isLatin ? ["No structured match found"] : [`Detected ${scriptInfo.script} script`],
    sources: [],
    notes: "",
    community: emptyCommunity()
  });
}

function createUnknownResult(query, lookupKey, scriptInfo) {
  return normalizeResult({
    id: "unknown",
    query,
    lookupKey,
    display: query,
    sourceForm: "",
    speakText: "",
    script: scriptInfo.script,
    queryScript: scriptInfo.script,
    language: "",
    languageName: "Unknown",
    ttsLang: "",
    category: "unknown",
    origin: "",
    pronunciation: {},
    confidence: "unknown",
    sourceStatus: "unknown",
    sourceLabel: SOURCE_LABELS.unknown,
    evidence: [],
    sources: [],
    notes: "",
    community: emptyCommunity()
  });
}

function withCommunitySummary(result, communityEntry) {
  if (!communityEntry) {
    return result;
  }

  return {
    ...result,
    community: communitySummary(communityEntry)
  };
}

function hasCommunityPronunciationData(entry) {
  return Boolean(entry.sourceForm || entry.language || entry.ipa || entry.simple || entry.audioUrl || entry.sourceUrl);
}

function communitySummary(entry) {
  return {
    confirmations: Number(entry.confirmations || 0),
    flags: Number(entry.flags || 0),
    requests: Number(entry.requests || 0),
    corrections: Number(entry.corrections || 0),
    updatedAt: entry.updatedAt || ""
  };
}

function emptyCommunity() {
  return {
    confirmations: 0,
    flags: 0,
    requests: 0,
    corrections: 0,
    updatedAt: ""
  };
}

function communitySourceLinks(entry = {}) {
  return [
    entry.sourceUrl ? { label: "Community source", url: entry.sourceUrl } : null,
    entry.audioUrl ? { label: "Community audio source", url: entry.audioUrl } : null
  ].filter(Boolean);
}

function withAlternateResults(primary, candidates = []) {
  const alternates = [
    ...(Array.isArray(primary.alternateResults) ? primary.alternateResults : []),
    ...candidates.flatMap(flattenAlternateCandidate)
  ];
  const unique = [];
  const seen = new Set();
  const primaryKey = alternateKey(primary);

  for (const alternate of alternates) {
    const summary = alternateResultSummary(alternate);
    const key = alternateKey(summary);
    if (!key || key === primaryKey || seen.has(key) || !isUsefulAlternate(summary)) {
      continue;
    }

    seen.add(key);
    unique.push(summary);
  }

  return {
    ...primary,
    alternateResults: unique.slice(0, 5)
  };
}

function flattenAlternateCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return [];
  }

  return [
    candidate,
    ...(Array.isArray(candidate.alternateResults) ? candidate.alternateResults : [])
  ];
}

function alternateResultSummary(result = {}) {
  const sourceStatus = normalizeSourceStatus(result.sourceStatus);
  return {
    id: normalizeSelection(result.id),
    display: normalizeSelection(result.display || result.query || result.sourceForm),
    sourceForm: normalizeSelection(result.sourceForm || result.display || result.query),
    language: normalizeLanguage(result.language),
    languageName: normalizeSelection(result.languageName || languageNameFromCode(result.language)),
    category: normalizeSelection(result.category),
    confidence: normalizeConfidence(result.confidence),
    sourceStatus,
    sourceLabel: result.sourceLabel || sourceLabelForStatus(sourceStatus),
    pronunciation: normalizePronunciation(result.pronunciation),
    evidence: Array.isArray(result.evidence) ? result.evidence.slice(0, 2).map(normalizeSelection).filter(Boolean) : [],
    sources: Array.isArray(result.sources) ? result.sources.slice(0, 2) : []
  };
}

function alternateKey(result = {}) {
  return [
    normalizeSelection(result.id),
    createLookupKey(result.sourceForm || result.display || result.query),
    normalizeSelection(result.language),
    normalizeSelection(result.sourceStatus)
  ].filter(Boolean).join("|");
}

function isUsefulAlternate(result = {}) {
  return Boolean(
    result.sourceStatus &&
    !["unknown", "best-effort-fallback"].includes(result.sourceStatus) &&
    (result.sourceForm || result.display || result.pronunciation?.ipa || result.pronunciation?.simple)
  );
}

function normalizeResult(result) {
  return {
    ...result,
    aliases: normalizeAliases(result.aliases),
    confidence: normalizeConfidence(result.confidence),
    sourceStatus: normalizeSourceStatus(result.sourceStatus),
    pronunciation: normalizePronunciation(result.pronunciation),
    trustSignals: normalizeTrustSignals(result.trustSignals),
    sourceLabel: result.sourceLabel || sourceLabelForStatus(result.sourceStatus),
    evidence: result.evidence || [],
    sources: result.sources || [],
    community: result.community || emptyCommunity()
  };
}

function normalizePronunciation(pronunciation = {}) {
  return {
    ipa: pronunciation.ipa || "",
    simple: pronunciation.simple || "",
    audio: normalizeAudio(pronunciation.audio)
  };
}

function normalizeAudio(audio) {
  if (!Array.isArray(audio)) {
    return [];
  }

  return audio
    .map((item) => ({
      url: normalizeLongValue(item?.url),
      label: normalizeSelection(item?.label),
      source: normalizeSelection(item?.source),
      quality: normalizeSelection(item?.quality)
    }))
    .filter((item) => item.url);
}

function normalizeLongValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
}

function normalizeAliases(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))].slice(0, 12);
}

function normalizeTrustSignals(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))].slice(0, 12);
}

function shouldResolveAudioUrl(url) {
  return Boolean(url && !/^(?:https?:|chrome-extension:|data:|blob:)/i.test(url));
}

function normalizeOrigin(origin) {
  if (!origin) {
    return "";
  }

  if (typeof origin === "string") {
    return origin;
  }

  const parts = [origin.label, ...(origin.roots || [])].filter(Boolean);
  return parts.join("; ");
}

function normalizeLanguage(language) {
  return String(language || "").trim();
}

function normalizeConfidence(confidence) {
  return CONFIDENCE_RANK[confidence] !== undefined ? confidence : "unknown";
}

function normalizeSourceStatus(status) {
  return SOURCE_LABELS[status] ? status : "unknown";
}

function ttsLangFromLanguage(language) {
  if (!language) {
    return "";
  }

  if (language.includes("-")) {
    return language;
  }

  return LANGUAGE_TO_TTS[language] || language;
}

function languageNameFromCode(language) {
  const names = {
    ar: "Arabic",
    de: "German",
    el: "Greek",
    en: "English",
    es: "Spanish",
    fa: "Persian",
    fr: "French",
    ga: "Irish",
    he: "Hebrew",
    it: "Italian",
    ja: "Japanese",
    ko: "Korean",
    la: "Latin",
    pl: "Polish",
    pt: "Portuguese",
    ru: "Russian",
    vi: "Vietnamese",
    zh: "Chinese"
  };

  return names[language] || "";
}

function entryKeys(entry) {
  return [
    entry.display,
    entry.native,
    entry.sourceForm,
    ...normalizeAliases(entry.aliases)
  ]
    .map(createLookupKey)
    .filter(Boolean);
}

function communityEntryKeys(entry = {}) {
  return [
    entry.lookupKey,
    entry.term,
    entry.sourceForm,
    ...normalizeAliases(entry.aliases)
  ]
    .map(createLookupKey)
    .filter(Boolean);
}

function scriptForCodePoint(code) {
  if (inRange(code, 0x0041, 0x007a) || inRange(code, 0x00c0, 0x024f) || inRange(code, 0x1e00, 0x1eff)) {
    return "Latin";
  }
  if (inRange(code, 0x0370, 0x03ff) || inRange(code, 0x1f00, 0x1fff)) {
    return "Greek";
  }
  if (inRange(code, 0x0400, 0x052f)) {
    return "Cyrillic";
  }
  if (inRange(code, 0x0530, 0x058f)) {
    return "Armenian";
  }
  if (inRange(code, 0x0590, 0x05ff)) {
    return "Hebrew";
  }
  if (inRange(code, 0x0600, 0x06ff) || inRange(code, 0x0750, 0x077f) || inRange(code, 0x08a0, 0x08ff)) {
    return "Arabic";
  }
  if (inRange(code, 0x0900, 0x097f)) {
    return "Devanagari";
  }
  if (inRange(code, 0x0e00, 0x0e7f)) {
    return "Thai";
  }
  if (inRange(code, 0x3040, 0x309f)) {
    return "Hiragana";
  }
  if (inRange(code, 0x30a0, 0x30ff)) {
    return "Katakana";
  }
  if (inRange(code, 0x4e00, 0x9fff)) {
    return "Han";
  }
  if (inRange(code, 0xac00, 0xd7af)) {
    return "Hangul";
  }
  return "";
}

function inRange(code, start, end) {
  return code >= start && code <= end;
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
