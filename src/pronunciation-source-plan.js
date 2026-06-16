import {
  createLookupKey,
  normalizeSelection
} from "./resolver-core.js";

export function pronunciationLookupCandidates(selection, result, options = {}) {
  const selectedText = normalizeSelection(selection);
  const configuredLanguage = normalizeLanguageHint(options.language || options.forvoLanguage);
  const primaryLanguage = normalizeLanguageHint(result?.language);
  const includeResolvedLanguageFallback = Boolean(options.includeResolvedLanguageFallback);
  const candidates = [];

  addCandidate(candidates, result?.sourceForm, configuredLanguage || primaryLanguage);
  addLanguageFallback(candidates, result?.sourceForm, configuredLanguage, primaryLanguage, includeResolvedLanguageFallback);
  addCandidate(candidates, result?.display, configuredLanguage || primaryLanguage);
  addLanguageFallback(candidates, result?.display, configuredLanguage, primaryLanguage, includeResolvedLanguageFallback);
  addAliasCandidates(candidates, result?.aliases, configuredLanguage || primaryLanguage);
  addAliasLanguageFallbacks(candidates, result?.aliases, configuredLanguage, primaryLanguage, includeResolvedLanguageFallback);

  for (const alternate of Array.isArray(result?.alternateResults) ? result.alternateResults : []) {
    const alternateLanguage = normalizeLanguageHint(alternate.language) || primaryLanguage;
    const language = configuredLanguage || alternateLanguage;
    addCandidate(candidates, alternate.sourceForm, language);
    addLanguageFallback(candidates, alternate.sourceForm, configuredLanguage, alternateLanguage, includeResolvedLanguageFallback);
    addCandidate(candidates, alternate.display, language);
    addLanguageFallback(candidates, alternate.display, configuredLanguage, alternateLanguage, includeResolvedLanguageFallback);
    addAliasCandidates(candidates, alternate.aliases, language);
    addAliasLanguageFallbacks(candidates, alternate.aliases, configuredLanguage, alternateLanguage, includeResolvedLanguageFallback);
  }

  addCandidate(candidates, selectedText, configuredLanguage || primaryLanguage);
  addLanguageFallback(candidates, selectedText, configuredLanguage, primaryLanguage, includeResolvedLanguageFallback);

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

function addLanguageFallback(candidates, word, configuredLanguage, resolvedLanguage, includeFallback) {
  if (!includeFallback || !configuredLanguage || !resolvedLanguage || configuredLanguage === resolvedLanguage) {
    return;
  }

  addCandidate(candidates, word, resolvedLanguage);
}

function addAliasLanguageFallbacks(candidates, aliases, configuredLanguage, resolvedLanguage, includeFallback) {
  const values = Array.isArray(aliases)
    ? aliases
    : String(aliases || "").split(/[;,\n]/);

  for (const alias of values) {
    addLanguageFallback(candidates, alias, configuredLanguage, resolvedLanguage, includeFallback);
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
