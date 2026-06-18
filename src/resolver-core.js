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
  initialismGuide
} from "./resolver/abbreviation.js";
import {
  normalizeConfidence,
  normalizeSourceStatus,
  sourceLabelForStatus
} from "./resolver/status.js";
import {
  normalizeAliases,
  normalizeTrustSignals,
} from "./resolver/values.js";
import {
  normalizePronunciation
} from "./resolver/audio.js";
import {
  normalizeSpeakableGuide,
  withGeneratedPronunciationGuide
} from "./resolver/pronunciation-guide.js";
import {
  communitySourceLinks,
  communitySummary,
  emptyCommunity,
  findCommunityEntry,
  hasCommunityPronunciationData,
  withCommunitySummary
} from "./resolver/community.js";
import {
  normalizeResult
} from "./resolver/merge.js";

export {
  MAX_SELECTION_LENGTH,
  createLookupKey,
  detectScript,
  normalizeSelection
} from "./resolver/text.js";
export { orthographicLanguageHint } from "./resolver/orthography.js";
export { initialismGuide } from "./resolver/abbreviation.js";
export { sourceLabelForStatus } from "./resolver/status.js";
export { getBestAudio, hasGeneratedAudio, hasPreferredAudio, mapResultAudioUrls, rankedAudioItems } from "./resolver/audio.js";
export { mergeRemoteResult } from "./resolver/merge.js";
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

export function createRemoteStructuredResult(selection, source) {
  const query = normalizeSelection(selection);
  const lookupKey = createLookupKey(query);
  const scriptInfo = detectScript(query);
  const sourceForm = normalizeSelection(source.sourceForm || source.display || query);
  const language = normalizeLanguage(source.language);
  const sourcePronunciation = source.pronunciation || {};
  const pronunciation = normalizePronunciation(withGeneratedPronunciationGuide(sourcePronunciation, sourceForm, language));
  const hasAudio = Boolean(pronunciation.audio.length);
  const speechSource = sourcePronunciation.simple
    ? { ...source, pronunciation }
    : source;
  const sourceStatus = remoteSourceStatus(source.sourceStatus, hasAudio);

  return normalizeResult({
    id: source.id || `remote:${lookupKey}`,
    query,
    lookupKey,
    display: source.display || query,
    aliases: source.aliases || [],
    trustSignals: remoteTrustSignals(source, sourceStatus, hasAudio),
    variants: source.variants || [],
    sourceForm,
    speakText: remoteSpeakText(speechSource, sourceForm, query, hasAudio),
    script: detectScript(sourceForm || query).script,
    queryScript: scriptInfo.script,
    language,
    languageName: source.languageName || languageNameFromCode(language) || "Unknown",
    ttsLang: source.ttsLang || ttsLangFromLanguage(language),
    category: source.category || "term",
    origin: source.origin || "",
    root: normalizeSelection(source.root),
    domainHint: normalizeSelection(source.domainHint || source.domain),
    pronunciation,
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
    : normalizeSelection(source.speakText || normalizeSpeakableGuide(source.pronunciation?.simple) || sourceForm || query);
}

function remoteSourceStatus(status, hasAudio) {
  const sourceStatus = normalizeSourceStatus(status);
  if (hasAudio) {
    return sourceStatus === "unknown" ? "verified-audio" : sourceStatus;
  }

  if (["verified-audio", "generated-audio", "unknown"].includes(sourceStatus)) {
    return "structured-source";
  }

  return sourceStatus;
}

function remoteTrustSignals(source = {}, sourceStatus, hasAudio) {
  const signals = [...normalizeTrustSignals(source.trustSignals)];

  if (["verified-audio", "structured-source", "community-confirmed"].includes(sourceStatus)) {
    signals.push("source-backed");
  }

  if (hasAudio) {
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
  const entryStatus = normalizeSourceStatus(entry.sourceStatus);
  const trustSignals = normalizeTrustSignals(entry.trustSignals);
  const hasGeneratedAudio = entryStatus === "generated-audio" || trustSignals.includes("generated-audio");
  const hasReviewedAudio = Boolean(entry.audioUrl && trustSignals.includes("audio-backed") && (
    trustSignals.includes("moderator-reviewed") || trustSignals.includes("source-backed")
  ));
  const sourceStatus = hasGeneratedAudio
    ? "generated-audio"
    : hasReviewedAudio
      ? "verified-audio"
      : confirmations >= 2 ? "community-confirmed" : "structured-source";
  const confidence = confirmations >= 2 ? "medium" : "low";
  const sourceForm = normalizeSelection(entry.sourceForm || entry.term || query);
  const language = normalizeLanguage(entry.language);
  const audioQuality = hasGeneratedAudio ? "generated" : hasReviewedAudio ? "verified" : "";

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
    ttsLang: entry.ttsLang || ttsLangFromLanguage(language),
    category: "community-entry",
    origin: entry.origin || "",
    root: normalizeSelection(entry.root),
    domainHint: normalizeSelection(entry.domainHint),
    variants: normalizeAliases(entry.variants),
    pronunciation: {
      ipa: entry.ipa || "",
      simple: entry.simple || "",
      audio: entry.audioUrl ? [{
        url: entry.audioUrl,
        label: hasGeneratedAudio ? "Generated shared audio" : "Community audio source",
        source: hasGeneratedAudio ? "SayThis shared audio" : "Community audio source",
        quality: audioQuality
      }] : []
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
    : normalizeSelection(normalizeSpeakableGuide(entry.simple) || sourceForm || query);
}

function createFallbackResult(query, lookupKey, scriptInfo) {
  const hint = scriptHintForScript(scriptInfo.script);
  const isLatin = scriptInfo.script === "Latin";
  const orthographyHint = isLatin ? orthographicLanguageHint(query) : null;
  const initialism = isLatin ? initialismGuide(query) : "";
  const sourceStatus = isLatin ? "best-effort-fallback" : "generated-from-source";
  const language = initialism ? "en" : hint.language || orthographyHint?.language || "";
  const languageName = initialism ? "English" : hint.languageName || orthographyHint?.languageName || (isLatin ? "Unresolved Latin-script term" : "Unresolved term");

  return normalizeResult({
    id: `fallback:${lookupKey}`,
    query,
    lookupKey,
    display: query,
    sourceForm: query,
    speakText: initialism || query,
    script: scriptInfo.script,
    queryScript: scriptInfo.script,
    language,
    languageName,
    ttsLang: hint.ttsLang || ttsLangFromLanguage(language),
    category: initialism ? "abbreviation" : "unresolved",
    origin: "",
    domainHint: "",
    pronunciation: initialism ? { simple: initialism } : {},
    confidence: isLatin ? orthographyHint?.confidence || "low" : "medium",
    sourceStatus,
    sourceLabel: sourceLabelForStatus(sourceStatus),
    evidence: [
      ...(isLatin ? ["No structured match found"] : [`Detected ${scriptInfo.script} script`]),
      initialism ? "Detected compact initialism" : "",
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
