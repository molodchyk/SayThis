import {
  hasGeneratedAudio,
  hasPreferredAudio,
  mergeRemoteResult,
  normalizeSelection
} from "../resolver-core.js";
import {
  selectBestWikidataResult,
  wikidataSearchLanguages
} from "../wikidata-adapter.js";
import {
  buildWiktionaryApiUrl,
  buildWiktionaryResult,
  wiktionarySourceLanguages
} from "../wiktionary-adapter.js";
import {
  buildNominatimResult,
  buildNominatimSearchUrl,
  nominatimAcceptLanguage
} from "../nominatim-adapter.js";
import {
  buildForvoResult,
  buildForvoWordPronunciationsUrl
} from "../forvo-adapter.js";
import {
  additionalPronunciationLookupCandidates,
  pronunciationLookupCandidates
} from "../pronunciation-source-plan.js";
import {
  transliterationLookupCandidates
} from "../resolver/transliteration.js";
import {
  buildCustomSourceResult,
  buildCustomSourceUrl,
  buildVoiceServiceResult
} from "../custom-source-adapter.js";
import {
  buildDbpediaLookupUrl,
  buildDbpediaResult
} from "./dbpedia-source.js";
import {
  fetchWikimediaApi
} from "./sources/wikimedia-api.js";
import {
  resolveWithCommonsAudioCandidates
} from "./sources/commons-audio-source.js";

export async function resolveWithOnlineSources(text, settings = {}, credentials = {}, context = {}) {
  const languageHints = onlineLookupLanguageHints(settings.lookupLanguageHints, context.localResult);
  const [customSourceResult, wikidataResult, dbpediaResult, wiktionaryResult, nominatimResult] = await Promise.all([
    settings.customSourceEnabled
      ? resolveSafely(resolveWithCustomSource, text, settings.customSourceEndpoint, settings.customSourceLabel)
      : Promise.resolve(null),
    resolveSafely(resolveWithWikidata, text, {
      languageHints
    }),
    settings.dbpediaEnabled
      ? resolveSafely(resolveWithDbpedia, text, settings.dbpediaEndpoint)
      : Promise.resolve(null),
    resolveSafely(resolveWithWiktionary, text, {
      languageHints
    }),
    settings.gazetteerEnabled
      ? resolveSafely(resolveWithNominatim, text, settings.gazetteerEndpoint, {
        languageHints
      })
      : Promise.resolve(null)
  ]);

  const structuredResult = [customSourceResult, wikidataResult, dbpediaResult, wiktionaryResult, nominatimResult]
    .filter(Boolean)
    .reduce((best, candidate) => mergeRemoteResult(best, candidate), null);
  const customSourceCandidateResult = settings.customSourceEnabled && structuredResult
    ? await resolveWithCustomSourceCandidates(text, structuredResult, settings.customSourceEndpoint, settings.customSourceLabel)
    : null;
  const nominatimCandidateResult = settings.gazetteerEnabled && structuredResult
    ? await resolveWithNominatimCandidates(text, structuredResult, settings.gazetteerEndpoint, {
      languageHints
    })
    : null;
  const dbpediaCandidateResult = settings.dbpediaEnabled && structuredResult
    ? await resolveWithDbpediaCandidates(text, structuredResult, settings.dbpediaEndpoint)
    : null;
  const wiktionaryCandidateResult = structuredResult
    ? await resolveWithWiktionaryCandidates(text, structuredResult)
    : null;
  const refinedStructuredResult = [structuredResult, customSourceCandidateResult, nominatimCandidateResult, dbpediaCandidateResult, wiktionaryCandidateResult]
    .filter(Boolean)
    .reduce((best, candidate) => mergeRemoteResult(best, candidate), null);
  const forvoResult = settings.forvoEnabled
    ? await resolveWithForvoCandidates(text, refinedStructuredResult || context.localResult, credentials.forvoApiKey, {
      ...settings,
      lookupLanguageHints: languageHints
    })
    : null;
  const preAudioResult = [refinedStructuredResult, forvoResult, context.localResult]
    .filter(Boolean)
    .reduce((best, candidate) => mergeRemoteResult(best, candidate), null);
  const commonsAudioResult = !hasPreferredAudio(preAudioResult)
    ? await resolveWithCommonsAudioCandidates(text, preAudioResult)
    : null;
  const audioBaseResult = [preAudioResult, commonsAudioResult]
    .filter(Boolean)
    .reduce((best, candidate) => mergeRemoteResult(best, candidate), null);
  const voiceServiceResult = settings.voiceServiceEnabled
    ? resolveWithVoiceService(text, audioBaseResult, settings)
    : null;

  return [refinedStructuredResult, forvoResult, commonsAudioResult, voiceServiceResult]
    .filter(Boolean)
    .reduce((best, candidate) => mergeRemoteResult(best, candidate), null);
}

export function onlineLookupLanguageHints(configuredHints = [], localResult = {}) {
  const hints = normalizedLanguageHints(configuredHints);
  const localLanguage = localResult?.sourceStatus === "best-effort-fallback"
    ? normalizeLanguageHint(localResult.language)
    : "";

  return localLanguage && !hints.includes(localLanguage)
    ? [...hints, localLanguage].slice(0, 8)
    : hints;
}

export function resolveWithVoiceService(text, result, settings = {}) {
  if (!settings.voiceServiceUrlTemplate || hasPreferredAudio(result) || hasGeneratedAudio(result)) {
    return null;
  }

  return buildVoiceServiceResult(text, result, {
    urlTemplate: settings.voiceServiceUrlTemplate,
    label: settings.voiceServiceLabel
  });
}

export async function resolveSafely(resolver, ...args) {
  try {
    return await resolver(...args);
  } catch {
    return null;
  }
}

export async function resolveWithWikidata(text, options = {}) {
  const query = normalizeSelection(text);
  if (!query) {
    return null;
  }

  const lookupCandidates = wikidataLookupCandidates(query, options);
  const languageHints = wikidataLookupLanguageHints(options.languageHints, lookupCandidates);
  const requests = lookupCandidates.flatMap((candidate) => wikidataSearchLanguages(candidate.sourceForm, {
    languageHints
  }).map((language) => ({
    query: candidate.sourceForm,
    language
  })));
  const searchResults = await Promise.all(requests.map(async ({ query: lookupQuery, language }) => {
    try {
      return await fetchWikidataSearch(lookupQuery, language);
    } catch {
      return [];
    }
  }));
  const matches = uniqueWikidataMatches(searchResults.flat()).slice(0, 8);
  if (!matches.length) {
    return null;
  }

  const entityById = await fetchWikidataEntities(matches.slice(0, 5));
  return selectBestWikidataResult(query, matches, entityById, {
    languageHints
  });
}

export function wikidataLookupCandidates(query, options = {}) {
  const selectedText = normalizeSelection(query);
  if (!selectedText) {
    return [];
  }

  return [{
    sourceForm: selectedText,
    language: ""
  }, ...transliterationLookupCandidates(selectedText, {
    languageHints: options.languageHints
  })].slice(0, 4);
}

export async function fetchWikidataSearch(query, language) {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: query,
    language,
    uselang: "en",
    format: "json",
    origin: "*",
    limit: "8"
  });

  const searchResponse = await fetchWikimediaApi(`https://www.wikidata.org/w/api.php?${params.toString()}`);
  if (!searchResponse.ok) {
    return [];
  }

  const searchData = await searchResponse.json();
  return (searchData.search || [])
    .filter((match) => match?.id)
    .map((match) => ({
      ...match,
      language: match.language || language
    }));
}

export function uniqueWikidataMatches(matches = []) {
  const seen = new Set();
  const unique = [];

  for (const match of matches) {
    if (!match?.id || seen.has(match.id)) {
      continue;
    }

    seen.add(match.id);
    unique.push(match);
  }

  return unique;
}

export async function resolveWithWiktionary(text, options = {}) {
  return resolveWithWiktionarySources(text, text, options);
}

export async function resolveWithWiktionaryLookup(selectedText, lookupWord, options = {}) {
  const selected = normalizeSelection(selectedText);
  const query = normalizeSelection(lookupWord);
  const sourceLanguage = options.sourceLanguage || "en";
  const url = buildWiktionaryApiUrl(query, sourceLanguage);
  if (!selected || !query) {
    return null;
  }

  if (!url) {
    return null;
  }

  const response = await fetchWikimediaApi(url);
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const page = data.query?.pages?.find((candidate) => !candidate.missing);
  const wikitext = page?.revisions?.[0]?.slots?.main?.content;
  if (!wikitext) {
    return null;
  }

  return buildWiktionaryResult(selected, page.title || query, wikitext, {
    preferredLanguage: options.language || options.preferredLanguage || sourceLanguage,
    sourceLanguage
  });
}

export async function resolveWithWiktionarySources(selectedText, lookupWord, options = {}) {
  let result = null;
  for (const sourceLanguage of wiktionarySourceLanguages(options)) {
    const wiktionaryResult = await resolveSafely(resolveWithWiktionaryLookup, selectedText, lookupWord, {
      ...options,
      sourceLanguage
    });
    if (!wiktionaryResult) {
      continue;
    }

    result = mergeRemoteResult(result, wiktionaryResult);
    if (result?.sourceStatus === "verified-audio") {
      return result;
    }
  }

  return result;
}

export async function resolveWithWiktionaryCandidates(text, structuredResult) {
  const query = normalizeSelection(text);
  if (!query) {
    return null;
  }

  let result = null;
  for (const candidate of additionalPronunciationLookupCandidates(query, structuredResult, { limit: 3 })) {
    const wiktionaryResult = await resolveSafely(resolveWithWiktionarySources, query, candidate.word, {
      language: candidate.language,
      languageHints: [candidate.language]
    });
    if (!wiktionaryResult) {
      continue;
    }

    result = mergeRemoteResult(result, wiktionaryResult);
    if (result?.sourceStatus === "verified-audio") {
      return result;
    }
  }

  return result;
}

export async function resolveWithNominatim(text, endpoint, options = {}) {
  return resolveWithNominatimLookup(text, text, endpoint, options);
}

export async function resolveWithNominatimLookup(selectedText, lookupWord, endpoint, options = {}) {
  const selected = normalizeSelection(selectedText);
  const query = normalizeSelection(lookupWord);
  const acceptLanguage = nominatimAcceptLanguage({
    language: options.language,
    languageHints: options.languageHints
  });
  const url = buildNominatimSearchUrl(query, endpoint, {
    limit: 5,
    acceptLanguage
  });
  if (!selected || !query || !url) {
    return null;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return buildNominatimResult(selected, data, {
    languageHints: options.languageHints
  });
}

export async function resolveWithNominatimCandidates(text, structuredResult, endpoint, options = {}) {
  const query = normalizeSelection(text);
  if (!query) {
    return null;
  }

  let result = null;
  for (const candidate of additionalPronunciationLookupCandidates(query, structuredResult, { limit: 3 })) {
    const placeResult = await resolveSafely(resolveWithNominatimLookup, query, candidate.word, endpoint, {
      language: candidate.language,
      languageHints: options.languageHints
    });
    if (!placeResult) {
      continue;
    }

    result = mergeRemoteResult(result, placeResult);
  }

  return result;
}

export async function resolveWithCustomSource(text, endpoint, label, options = {}) {
  const query = normalizeSelection(text);
  const lookupWord = normalizeSelection(options.lookupWord || query);
  const url = buildCustomSourceUrl(lookupWord, endpoint);
  if (!query || !lookupWord || !url) {
    return null;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return buildCustomSourceResult(query, data, { label, lookupWord });
}

export async function resolveWithCustomSourceCandidates(text, structuredResult, endpoint, label) {
  const query = normalizeSelection(text);
  if (!query) {
    return null;
  }

  let result = null;
  for (const candidate of additionalPronunciationLookupCandidates(query, structuredResult, { limit: 3 })) {
    const customResult = await resolveSafely(resolveWithCustomSource, query, endpoint, label, {
      lookupWord: candidate.word
    });
    if (!customResult) {
      continue;
    }

    result = mergeRemoteResult(result, customResult);
    if (result?.sourceStatus === "verified-audio") {
      return result;
    }
  }

  return result;
}

export async function resolveWithDbpedia(text, endpoint, options = {}) {
  const query = normalizeSelection(text);
  const lookupWord = normalizeSelection(options.lookupWord || query);
  const url = buildDbpediaLookupUrl(lookupWord, endpoint, { limit: 5 });
  if (!query || !lookupWord || !url) {
    return null;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return buildDbpediaResult(query, data);
}

export async function resolveWithDbpediaCandidates(text, structuredResult, endpoint) {
  const query = normalizeSelection(text);
  if (!query) {
    return null;
  }

  let result = null;
  for (const candidate of additionalPronunciationLookupCandidates(query, structuredResult, { limit: 3 })) {
    const dbpediaResult = await resolveSafely(resolveWithDbpedia, query, endpoint, {
      lookupWord: candidate.word
    });
    if (!dbpediaResult) {
      continue;
    }

    result = mergeRemoteResult(result, dbpediaResult);
  }

  return result;
}

export async function resolveWithForvo(text, apiKey, language) {
  const query = normalizeSelection(text);
  return resolveWithForvoLookup(query, query, apiKey, language);
}

export async function resolveWithForvoLookup(selectedText, lookupWord, apiKey, language) {
  const query = normalizeSelection(selectedText);
  const word = normalizeSelection(lookupWord);
  const url = buildForvoWordPronunciationsUrl(word, apiKey, {
    language,
    limit: 5
  });
  if (!query || !word || !url) {
    return null;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return buildForvoResult(query, data, {
    lookupWord: word,
    language
  });
}

export async function resolveWithForvoCandidates(text, structuredResult, apiKey, settings = {}) {
  let result = null;
  for (const candidate of pronunciationLookupCandidates(text, structuredResult, {
    language: settings.forvoLanguage,
    languageHints: settings.lookupLanguageHints,
    includeResolvedLanguageFallback: true
  })) {
    const forvoResult = await resolveSafely(resolveWithForvoLookup, text, candidate.word, apiKey, candidate.language);
    if (!forvoResult) {
      continue;
    }

    result = mergeRemoteResult(result, forvoResult);
    if (result?.sourceStatus === "verified-audio") {
      return result;
    }
  }

  return result;
}

export async function fetchWikidataEntities(matches) {
  const pairs = await Promise.all(matches.map(async (match) => {
    try {
      const response = await fetchWikimediaApi(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(match.id)}.json`);
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const entity = data.entities?.[match.id];
      return entity ? [match.id, entity] : null;
    } catch {
      return null;
    }
  }));

  return Object.fromEntries(pairs.filter(Boolean));
}

function normalizedLanguageHints(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[\s,;]+/);
  const seen = new Set();
  const hints = [];

  for (const item of values) {
    const language = normalizeLanguageHint(item);
    if (!language || seen.has(language)) {
      continue;
    }

    seen.add(language);
    hints.push(language);
    if (hints.length >= 8) {
      break;
    }
  }

  return hints;
}

function wikidataLookupLanguageHints(configuredHints = [], candidates = []) {
  return normalizedLanguageHints([
    ...normalizedLanguageHints(configuredHints),
    ...candidates.map((candidate) => candidate.language)
  ]);
}

function normalizeLanguageHint(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)?.[0]
    ?.split("-")[0] || "";
}
