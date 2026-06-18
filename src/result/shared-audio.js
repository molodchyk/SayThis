import {
  createLookupKey,
  hasPreferredAudio,
  normalizeSelection
} from "../resolver-core.js";

export function isSharedAudioCandidate(result = {}, selectedText = "") {
  const sourceForm = normalizeSelection(result?.sourceForm || result?.display || result?.query);
  const ttsLang = normalizeSelection(result?.ttsLang || result?.language);
  const sourceStatus = normalizeSelection(result?.sourceStatus);
  return Boolean(
    result &&
    !hasPreferredAudio(result) &&
    sourceForm &&
    ttsLang &&
    !["", "unknown", "best-effort-fallback"].includes(sourceStatus) &&
    hasUsefulSharedAudioTarget(selectedText || result?.query || result?.display, sourceForm, result?.language, ttsLang)
  );
}

export function hasUsefulSharedAudioTarget(selectedText, sourceForm, language, ttsLang) {
  return createLookupKey(selectedText) !== createLookupKey(sourceForm) ||
    hasNonEnglishLanguageSignal(language) ||
    hasNonEnglishLanguageSignal(ttsLang);
}

export function hasNonEnglishLanguageSignal(value) {
  const normalized = normalizeSelection(value).toLowerCase();
  const base = baseLanguage(normalized);
  if (!base || ["unknown", "und", "en", "eng"].includes(base) || normalized.startsWith("english")) {
    return false;
  }

  return true;
}

function baseLanguage(value) {
  return normalizeSelection(value).toLowerCase().split(/[-_]/)[0];
}
