import {
  createLookupKey,
  normalizeSelection
} from "./resolver-core.js";

export function pronunciationLookupCandidates(selection, result, options = {}) {
  const selectedText = normalizeSelection(selection);
  const configuredLanguage = normalizeLanguageHint(options.language || options.forvoLanguage);
  const primaryLanguage = normalizeLanguageHint(result?.language);
  const languageHints = normalizeLanguageHints(options.languageHints);
  const includeResolvedLanguageFallback = Boolean(options.includeResolvedLanguageFallback);
  const candidates = [];

  addCandidateSet(candidates, result?.sourceForm, candidateLanguages(configuredLanguage, primaryLanguage, languageHints, includeResolvedLanguageFallback));
  addCandidateSet(candidates, result?.display, candidateLanguages(configuredLanguage, primaryLanguage, languageHints, includeResolvedLanguageFallback));
  addAliasCandidates(candidates, result?.aliases, candidateLanguages(configuredLanguage, primaryLanguage, languageHints, includeResolvedLanguageFallback));

  for (const alternate of Array.isArray(result?.alternateResults) ? result.alternateResults : []) {
    const alternateLanguage = normalizeLanguageHint(alternate.language) || primaryLanguage;
    const languages = candidateLanguages(configuredLanguage, alternateLanguage, languageHints, includeResolvedLanguageFallback);
    addCandidateSet(candidates, alternate.sourceForm, languages);
    addCandidateSet(candidates, alternate.display, languages);
    addAliasCandidates(candidates, alternate.aliases, languages);
  }

  addCandidateSet(candidates, selectedText, candidateLanguages(configuredLanguage, primaryLanguage, languageHints, includeResolvedLanguageFallback));

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

function addCandidateSet(candidates, word, languages) {
  const safeLanguages = Array.isArray(languages) && languages.length ? languages : [""];
  for (const language of safeLanguages) {
    addCandidate(candidates, word, language);
  }
}

function addAliasCandidates(candidates, aliases, languages) {
  const values = Array.isArray(aliases)
    ? aliases
    : String(aliases || "").split(/[;,\n]/);

  for (const alias of values) {
    addCandidateSet(candidates, alias, languages);
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

function normalizeLanguageHints(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[\s,;]+/);
  const seen = new Set();
  const languages = [];

  for (const item of values) {
    const language = normalizeLanguageHint(item).split("-")[0];
    if (!language || seen.has(language)) {
      continue;
    }

    seen.add(language);
    languages.push(language);
    if (languages.length >= 3) {
      break;
    }
  }

  return languages;
}

function candidateLanguages(configuredLanguage, resolvedLanguage, languageHints = [], includeResolvedLanguageFallback = false) {
  const languages = [];

  if (configuredLanguage) {
    languages.push(configuredLanguage);
  } else if (resolvedLanguage) {
    languages.push(resolvedLanguage);
  }

  if (!configuredLanguage) {
    languages.push(...languageHints);
  }

  if (includeResolvedLanguageFallback && configuredLanguage && resolvedLanguage) {
    languages.push(resolvedLanguage);
  }

  return uniqueLanguages(languages);
}

function uniqueLanguages(languages) {
  const seen = new Set();
  const unique = [];

  for (const language of languages) {
    const normalized = normalizeLanguageHint(language);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(number)));
}
