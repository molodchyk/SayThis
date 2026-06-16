import {
  createLookupKey,
  normalizeSelection
} from "./resolver-core.js";

export function pronunciationLookupCandidates(selection, result, options = {}) {
  const selectedText = normalizeSelection(selection);
  const configuredLanguage = normalizeLanguageHint(options.language || options.forvoLanguage);
  const primaryLanguage = normalizeLanguageHint(result?.language);
  const candidates = [];

  addCandidate(candidates, result?.sourceForm, configuredLanguage || primaryLanguage);
  addCandidate(candidates, result?.display, configuredLanguage || primaryLanguage);
  addAliasCandidates(candidates, result?.aliases, configuredLanguage || primaryLanguage);

  for (const alternate of Array.isArray(result?.alternateResults) ? result.alternateResults : []) {
    const language = configuredLanguage || normalizeLanguageHint(alternate.language) || primaryLanguage;
    addCandidate(candidates, alternate.sourceForm, language);
    addCandidate(candidates, alternate.display, language);
    addAliasCandidates(candidates, alternate.aliases, language);
  }

  addCandidate(candidates, selectedText, configuredLanguage || primaryLanguage);

  return uniqueCandidates(candidates).slice(0, 5);
}

export function additionalPronunciationLookupCandidates(selection, result, options = {}) {
  const selectedKey = createLookupKey(selection);
  const limit = clampInteger(options.limit, 1, 5, 3);

  return pronunciationLookupCandidates(selection, result, options)
    .filter((candidate) => createLookupKey(candidate.word) !== selectedKey)
    .slice(0, limit);
}

function addCandidate(candidates, word, language) {
  const normalizedWord = normalizeSelection(word);
  if (!normalizedWord) {
    return;
  }

  candidates.push({
    word: normalizedWord,
    language: normalizeLanguageHint(language)
  });
}

function addAliasCandidates(candidates, aliases, language) {
  const values = Array.isArray(aliases)
    ? aliases
    : String(aliases || "").split(/[;,\n]/);

  for (const alias of values) {
    addCandidate(candidates, alias, language);
  }
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const unique = [];

  for (const candidate of candidates) {
    const key = `${createLookupKey(candidate.word)}|${candidate.language}`;
    if (!createLookupKey(candidate.word) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}

function normalizeLanguageHint(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)?.[0] || "";
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(number)));
}
