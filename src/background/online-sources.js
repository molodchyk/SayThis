import {
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
  buildCustomSourceResult,
  buildCustomSourceUrl
} from "../custom-source-adapter.js";

export async function resolveWithOnlineSources(text, settings = {}, credentials = {}) {
  const [customSourceResult, wikidataResult, wiktionaryResult, nominatimResult] = await Promise.all([
    settings.customSourceEnabled
      ? resolveSafely(resolveWithCustomSource, text, settings.customSourceEndpoint, settings.customSourceLabel)
      : Promise.resolve(null),
    resolveSafely(resolveWithWikidata, text, {
      languageHints: settings.lookupLanguageHints
    }),
    resolveSafely(resolveWithWiktionary, text, {
      languageHints: settings.lookupLanguageHints
    }),
    settings.gazetteerEnabled
      ? resolveSafely(resolveWithNominatim, text, settings.gazetteerEndpoint, {
        languageHints: settings.lookupLanguageHints
      })
      : Promise.resolve(null)
  ]);

  const structuredResult = [customSourceResult, wikidataResult, wiktionaryResult, nominatimResult]
    .filter(Boolean)
    .reduce((best, candidate) => mergeRemoteResult(best, candidate), null);
  const nominatimCandidateResult = settings.gazetteerEnabled && structuredResult
    ? await resolveWithNominatimCandidates(text, structuredResult, settings.gazetteerEndpoint, {
      languageHints: settings.lookupLanguageHints
    })
    : null;
  const wiktionaryCandidateResult = structuredResult
    ? await resolveWithWiktionaryCandidates(text, structuredResult)
    : null;
  const refinedStructuredResult = [structuredResult, nominatimCandidateResult, wiktionaryCandidateResult]
    .filter(Boolean)
    .reduce((best, candidate) => mergeRemoteResult(best, candidate), null);
  const forvoResult = settings.forvoEnabled
    ? await resolveWithForvoCandidates(text, refinedStructuredResult, credentials.forvoApiKey, settings)
    : null;

  return [refinedStructuredResult, forvoResult]
    .filter(Boolean)
    .reduce((best, candidate) => mergeRemoteResult(best, candidate), null);
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

  const searchResults = await Promise.all(wikidataSearchLanguages(query, {
    languageHints: options.languageHints
  }).map(async (language) => {
    try {
      return await fetchWikidataSearch(query, language);
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
    languageHints: options.languageHints
  });
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

  const searchResponse = await fetch(`https://www.wikidata.org/w/api.php?${params.toString()}`);
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

  const response = await fetch(url);
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

export async function resolveWithCustomSource(text, endpoint, label) {
  const query = normalizeSelection(text);
  const url = buildCustomSourceUrl(query, endpoint);
  if (!query || !url) {
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
  return buildCustomSourceResult(query, data, { label });
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
  return buildForvoResult(query, data);
}

export async function resolveWithForvoCandidates(text, structuredResult, apiKey, settings = {}) {
  let result = null;
  for (const candidate of pronunciationLookupCandidates(text, structuredResult, {
    language: settings.forvoLanguage,
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
      const response = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(match.id)}.json`);
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
