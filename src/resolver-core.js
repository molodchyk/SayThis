import {
  createLookupKey,
  detectScript,
  normalizeSelection
} from "./resolver/text.js";
import {
  languageNameFromCode,
  scriptHintForScript,
  ttsLangFromLanguage
} from "./resolver/language.js";
import {
  orthographicLanguageHint
} from "./resolver/orthography.js";
import {
  confidenceRank,
  normalizeConfidence,
  normalizeSourceStatus,
  sourceLabelForStatus,
  strongerConfidence
} from "./resolver/status.js";
import {
  normalizeAliases,
  normalizeLongValue,
  normalizeTrustSignals,
} from "./resolver/values.js";
import {
  getBestAudio,
  mapResultAudioUrls,
  mergeAudioItems,
  normalizePronunciation
} from "./resolver/audio.js";
import {
  communitySourceLinks,
  communitySummary,
  emptyCommunity,
  findCommunityEntry,
  hasCommunityPronunciationData,
  withCommunitySummary
} from "./resolver/community.js";

export {
  MAX_SELECTION_LENGTH,
  createLookupKey,
  detectScript,
  normalizeSelection
} from "./resolver/text.js";
export { orthographicLanguageHint } from "./resolver/orthography.js";
export { sourceLabelForStatus } from "./resolver/status.js";
export { getBestAudio, mapResultAudioUrls } from "./resolver/audio.js";
export {
  applyCommunitySummary,
  hasCommunityPronunciationData,
  normalizeCommunityEntries,
  updateCommunityEntries
} from "./resolver/community.js";

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

  const localRank = confidenceRank(localResult.confidence);
  const remoteRank = confidenceRank(remoteResult.confidence);

  if (localResult.sourceStatus === "best-effort-fallback" && remoteRank >= localRank) {
    return withAlternateResults(remoteResult, [localResult]);
  }

  if (shouldMergeAudioIntoResult(localResult, remoteResult)) {
    return withAlternateResults(mergeAudioIntoResult(localResult, remoteResult), remoteResult.alternateResults || []);
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
    trustSignals: remoteTrustSignals(source, sourceStatus, hasAudio),
    variants: source.variants || [],
    sourceForm,
    speakText: remoteSpeakText(source, sourceForm, query, hasAudio),
    script: detectScript(sourceForm || query).script,
    queryScript: scriptInfo.script,
    language,
    languageName: source.languageName || languageNameFromCode(language) || "Unknown",
    ttsLang: source.ttsLang || ttsLangFromLanguage(language),
    category: source.category || "term",
    origin: source.origin || "",
    root: normalizeSelection(source.root),
    domainHint: normalizeSelection(source.domainHint || source.domain),
    pronunciation: source.pronunciation || {},
    confidence: source.confidence || (hasAudio ? "high" : "medium"),
    sourceStatus,
    sourceLabel: sourceLabelForStatus(sourceStatus),
    evidence: source.evidence || [],
    sources: source.sources || [],
    notes: source.notes || "",
    community: emptyCommunity()
  });
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

function remoteSpeakText(source = {}, sourceForm, query, hasAudio) {
  return hasAudio
    ? sourceForm || query
    : normalizeSelection(source.speakText || source.pronunciation?.simple || sourceForm || query);
}

function remoteTrustSignals(source = {}, sourceStatus, hasAudio) {
  const signals = [...normalizeTrustSignals(source.trustSignals)];

  if (["verified-audio", "structured-source", "community-confirmed"].includes(sourceStatus)) {
    signals.push("source-backed");
  }

  if (hasAudio || sourceStatus === "verified-audio") {
    signals.push("audio-backed");
  }

  if (normalizeSelection(source.root)) {
    signals.push("root-noted");
  }

  return normalizeTrustSignals(signals);
}

function findSeedEntry(lookupKey, entries = []) {
  return entries.find((entry) => entryKeys(entry).includes(lookupKey));
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
    root: normalizeSelection(entry.root),
    domainHint: normalizeSelection(entry.domainHint || entry.domain),
    variants: entry.variants || [],
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
    speakText: communitySpeakText(entry, sourceForm, query),
    script: detectScript(sourceForm || query).script,
    queryScript: scriptInfo.script,
    language,
    languageName: entry.languageName || languageNameFromCode(language),
    ttsLang: ttsLangFromLanguage(language),
    category: "community-entry",
    origin: entry.origin || "",
    root: normalizeSelection(entry.root),
    domainHint: normalizeSelection(entry.domainHint),
    variants: normalizeAliases(entry.variants),
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

function communitySpeakText(entry = {}, sourceForm, query) {
  return entry.audioUrl
    ? sourceForm || query
    : normalizeSelection(entry.simple || sourceForm || query);
}

function createFallbackResult(query, lookupKey, scriptInfo) {
  const hint = scriptHintForScript(scriptInfo.script);
  const isLatin = scriptInfo.script === "Latin";
  const orthographyHint = isLatin ? orthographicLanguageHint(query) : null;
  const sourceStatus = isLatin ? "best-effort-fallback" : "generated-from-source";
  const language = hint.language || orthographyHint?.language || "";
  const languageName = hint.languageName || orthographyHint?.languageName || (isLatin ? "Unresolved Latin-script term" : "Unresolved term");

  return normalizeResult({
    id: `fallback:${lookupKey}`,
    query,
    lookupKey,
    display: query,
    sourceForm: query,
    speakText: query,
    script: scriptInfo.script,
    queryScript: scriptInfo.script,
    language,
    languageName,
    ttsLang: hint.ttsLang || ttsLangFromLanguage(language),
    category: "unresolved",
    origin: "",
    domainHint: "",
    pronunciation: {},
    confidence: isLatin ? orthographyHint?.confidence || "low" : "medium",
    sourceStatus,
    sourceLabel: sourceLabelForStatus(sourceStatus),
    evidence: [
      ...(isLatin ? ["No structured match found"] : [`Detected ${scriptInfo.script} script`]),
      orthographyHint?.evidence || ""
    ].filter(Boolean),
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
    domainHint: "",
    pronunciation: {},
    confidence: "unknown",
    sourceStatus: "unknown",
    sourceLabel: sourceLabelForStatus("unknown"),
    evidence: [],
    sources: [],
    notes: "",
    community: emptyCommunity()
  });
}

function shouldMergeAudioIntoResult(primary, audioResult) {
  return Boolean(
    primary?.sourceStatus &&
    !["unknown", "best-effort-fallback"].includes(primary.sourceStatus) &&
    hasAudioResult(audioResult) &&
    hasCompatibleLanguage(primary, audioResult) &&
    sharesPronunciationTarget(primary, audioResult)
  );
}

function mergeAudioIntoResult(primary, audioResult) {
  const sourceStatus = "verified-audio";
  const pronunciation = {
    ipa: primary.pronunciation?.ipa || audioResult.pronunciation?.ipa || "",
    simple: primary.pronunciation?.simple || audioResult.pronunciation?.simple || "",
    audio: mergeAudioItems(primary.pronunciation?.audio, audioResult.pronunciation?.audio)
  };

  return normalizeResult({
    ...primary,
    pronunciation,
    confidence: strongerConfidence(primary.confidence, audioResult.confidence),
    sourceStatus,
    sourceLabel: sourceLabelForStatus(sourceStatus),
    evidence: mergeTextItems(primary.evidence, audioResult.evidence),
    sources: mergeSourceItems(primary.sources, audioResult.sources)
  });
}

function hasAudioResult(result = {}) {
  return result.sourceStatus === "verified-audio" && Boolean(result.pronunciation?.audio?.some((item) => item?.url));
}

function hasCompatibleLanguage(primary = {}, candidate = {}) {
  const primaryLanguage = baseLanguage(primary.language);
  const candidateLanguage = baseLanguage(candidate.language);
  return !primaryLanguage || !candidateLanguage || primaryLanguage === candidateLanguage;
}

function sharesPronunciationTarget(primary = {}, candidate = {}) {
  const primaryKeys = new Set(pronunciationTargetKeys(primary));
  return pronunciationTargetKeys(candidate).some((key) => primaryKeys.has(key));
}

function pronunciationTargetKeys(result = {}) {
  return [
    result.sourceForm,
    result.display,
    result.query,
    ...(Array.isArray(result.aliases) ? result.aliases : [])
  ]
    .map(createLookupKey)
    .filter(Boolean);
}

function baseLanguage(language) {
  return normalizeLanguage(language).toLowerCase().split(/[-_]/)[0];
}

function mergeTextItems(...groups) {
  const seen = new Set();
  const items = [];

  for (const value of groups.flatMap((group) => Array.isArray(group) ? group : [])) {
    const item = normalizeSelection(value);
    if (!item || seen.has(item)) {
      continue;
    }

    seen.add(item);
    items.push(item);
  }

  return items;
}

function mergeSourceItems(...groups) {
  const seen = new Set();
  const items = [];

  for (const source of groups.flatMap((group) => Array.isArray(group) ? group : [])) {
    const label = normalizeSelection(source?.label);
    const url = normalizeLongValue(source?.url);
    if (!label && !url) {
      continue;
    }

    const key = [label, url].join("|");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push(source);
  }

  return items;
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
  const language = normalizeLanguage(result.language);
  return {
    id: normalizeSelection(result.id),
    display: normalizeSelection(result.display || result.query || result.sourceForm),
    sourceForm: normalizeSelection(result.sourceForm || result.display || result.query),
    language,
    languageName: normalizeSelection(result.languageName || languageNameFromCode(language)),
    ttsLang: normalizeSelection(result.ttsLang || ttsLangFromLanguage(language)),
    category: normalizeSelection(result.category),
    root: normalizeSelection(result.root),
    domainHint: normalizeSelection(result.domainHint),
    variants: normalizeAliases(result.variants),
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
    root: normalizeSelection(result.root),
    domainHint: normalizeSelection(result.domainHint),
    variants: normalizeAliases(result.variants),
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

function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
