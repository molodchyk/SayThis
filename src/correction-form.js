import {
  getBestAudio,
  normalizeSelection
} from "./resolver-core.js";

export function correctionValuesFromResult(result = {}) {
  const bestAudio = getBestAudio(result);
  const sourceUrl = firstSourceUrl(result);
  return {
    sourceForm: normalizeSelection(result.sourceForm),
    language: normalizeSelection(result.language),
    languageName: normalizeSelection(result.languageName),
    simple: normalizeSelection(result.pronunciation?.simple),
    ipa: normalizeSelection(result.pronunciation?.ipa),
    origin: normalizeSelection(result.origin),
    audioUrl: normalizeLongValue(bestAudio?.url),
    sourceUrl,
    variantNote: normalizeSelection(result.notes)
  };
}

export function correctionFeedbackFromValues(values = {}) {
  return {
    kind: "correction",
    sourceForm: normalizeSelection(values.sourceForm),
    language: normalizeSelection(values.language),
    languageName: normalizeSelection(values.languageName),
    simple: normalizeSelection(values.simple),
    ipa: normalizeSelection(values.ipa),
    origin: normalizeSelection(values.origin),
    audioUrl: normalizeLongValue(values.audioUrl),
    sourceUrl: normalizeLongValue(values.sourceUrl),
    variantNote: normalizeSelection(values.variantNote)
  };
}

export function hasCorrectionDetail(feedback = {}) {
  return ["sourceForm", "language", "languageName", "origin", "ipa", "simple", "audioUrl", "sourceUrl", "variantNote"]
    .some((field) => Boolean(feedback[field]));
}

function firstSourceUrl(result = {}) {
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const source = sources.find((item) => normalizeLongValue(item?.url));
  return normalizeLongValue(source?.url);
}

function normalizeLongValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
}
