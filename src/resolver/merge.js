import {
  languageCodeFromLanguage,
  languageNameFromCode,
  normalizeTtsLanguage
} from "./language.js";
import {
  confidenceRank,
  normalizeConfidence,
  normalizeSourceStatus,
  sourceLabelForStatus,
  strongerConfidence
} from "./status.js";
import {
  createLookupKey,
  detectScript,
  normalizeSelection
} from "./text.js";
import {
  hasPreferredAudio,
  mergeAudioItems,
  normalizePronunciation
} from "./audio.js";
import {
  normalizeAliases,
  normalizeLongValue,
  normalizeTrustSignals
} from "./values.js";
import {
  emptyCommunity
} from "./community.js";

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

  if (shouldMergeAudioIntoResult(remoteResult, localResult)) {
    return withAlternateResults(mergeAudioIntoResult(remoteResult, localResult), localResult.alternateResults || []);
  }

  if (shouldKeepPronunciationTargetPrimary(localResult, remoteResult)) {
    return withAlternateResults(localResult, [remoteResult]);
  }

  if (shouldKeepPronunciationTargetPrimary(remoteResult, localResult)) {
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

export function normalizeResult(result) {
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
  const pronunciation = {
    ipa: primary.pronunciation?.ipa || audioResult.pronunciation?.ipa || "",
    simple: primary.pronunciation?.simple || audioResult.pronunciation?.simple || "",
    audio: mergeAudioItems(primary.pronunciation?.audio, audioResult.pronunciation?.audio)
  };
  const sourceStatus = mergedAudioSourceStatus(primary, audioResult, pronunciation);

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

function mergedAudioSourceStatus(primary = {}, audioResult = {}, pronunciation = {}) {
  if (hasPreferredAudio({
    sourceStatus: primary.sourceStatus,
    pronunciation
  }) || hasPreferredAudio({
    sourceStatus: audioResult.sourceStatus,
    pronunciation
  })) {
    return "verified-audio";
  }

  return audioResult.sourceStatus === "generated-audio"
    ? "generated-audio"
    : "verified-audio";
}

function hasAudioResult(result = {}) {
  return ["verified-audio", "generated-audio"].includes(result.sourceStatus) && Boolean(result.pronunciation?.audio?.some((item) => item?.url));
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

function shouldKeepPronunciationTargetPrimary(primary = {}, challenger = {}) {
  const selected = normalizeSelection(primary.query || challenger.query || primary.display || challenger.display);
  const primaryLanguage = baseLanguage(primary.language);
  const challengerLanguage = baseLanguage(challenger.language);
  if (
    !selected ||
    !primaryLanguage ||
    primaryLanguage === "en" ||
    hasCompatibleLanguage(primary, challenger) ||
    !hasNativeSourceFormAdvantage(primary, selected)
  ) {
    return false;
  }

  return hasAudioResult(challenger) && (
    !challengerLanguage ||
    challengerLanguage === "en" ||
    sourceFormMatchesSelected(challenger.sourceForm || challenger.display, selected)
  );
}

function hasNativeSourceFormAdvantage(result = {}, selected = "") {
  const sourceForm = normalizeSelection(result.sourceForm || result.display || result.query);
  if (!sourceForm || sourceFormMatchesSelected(sourceForm, selected)) {
    return false;
  }

  const sourceScript = detectScript(sourceForm).script;
  const selectedScript = detectScript(selected).script;
  if (sourceScript !== "Unknown" && selectedScript !== "Unknown" && sourceScript !== selectedScript) {
    return true;
  }

  const evidence = (Array.isArray(result.evidence) ? result.evidence : [])
    .join(" ")
    .toLowerCase();
  return /source form from (?:native label|native name|official name)|source form matched lookup language hint/.test(evidence);
}

function sourceFormMatchesSelected(sourceForm, selected) {
  const sourceKey = createLookupKey(sourceForm);
  const selectedKey = createLookupKey(selected);
  return Boolean(sourceKey && selectedKey && sourceKey === selectedKey);
}

function pronunciationTargetKeys(result = {}) {
  return [
    result.sourceForm,
    result.display,
    result.query,
    ...(Array.isArray(result.aliases) ? result.aliases : []),
    ...(Array.isArray(result.variants) ? result.variants : [])
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
    ttsLang: normalizeTtsLanguage(result.ttsLang, language),
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

function normalizeLanguage(language) {
  return languageCodeFromLanguage(language) || String(language || "").trim();
}
