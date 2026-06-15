import {
  getBestAudio,
  normalizeSelection
} from "./resolver-core.js";

export function correctionValuesFromResult(result = {}) {
  const bestAudio = getBestAudio(result);
  return {
    sourceForm: normalizeSelection(result.sourceForm),
    language: normalizeSelection(result.language),
    languageName: normalizeSelection(result.languageName),
    simple: normalizeSelection(result.pronunciation?.simple),
    ipa: normalizeSelection(result.pronunciation?.ipa),
    origin: normalizeSelection(result.origin),
    audioUrl: normalizeLongValue(bestAudio?.url),
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
    variantNote: normalizeSelection(values.variantNote)
  };
}

function normalizeLongValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
}
