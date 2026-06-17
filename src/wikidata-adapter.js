import {
  createRemoteStructuredResult,
  createLookupKey,
  detectScript,
  normalizeSelection
} from "./resolver-core.js";
import {
  normalizeSearchLanguageHints as normalizeWikidataSearchLanguageHints
} from "./wikidata/search-languages.js";
import {
  wikidataClaimedLanguage,
  wikidataResultLanguage
} from "./wikidata/language-claims.js";
import {
  wikidataEntityType
} from "./wikidata/entity-types.js";

export {
  normalizeSearchLanguageHints,
  wikidataSearchLanguages
} from "./wikidata/search-languages.js";

const NATIVE_LABEL = "P1705";
const NATIVE_NAME = "P1559";
const OFFICIAL_NAME = "P1448";
const SHORT_NAME = "P1813";
const BIRTH_NAME = "P1477";
const NAME = "P2561";
const NICKNAME = "P1449";
const TITLE = "P1476";
const TAXON_NAME = "P225";
const TAXON_COMMON_NAME = "P1843";
const PSEUDONYM = "P742";
const PRONUNCIATION_AUDIO = "P443";
const IPA_TRANSCRIPTION = "P898";
export function buildWikidataResult(query, match, entity, options = {}) {
  if (!match?.id || !entity) {
    return null;
  }

  const sourceCandidate = chooseSourceCandidate(query, match, entity, options);
  const description = entity.descriptions?.en?.value || match.description || "";
  const entityType = wikidataEntityType(entity);
  const audioFiles = stringClaimValues(entity, PRONUNCIATION_AUDIO).slice(0, 4);
  const ipa = firstStringClaimValue(entity, IPA_TRANSCRIPTION);
  const sourceForm = sourceCandidate?.value || match.label || query;
  const claimedLanguage = wikidataClaimedLanguage(entity, options);
  const language = wikidataResultLanguage(sourceCandidate, claimedLanguage, match);
  const aliases = wikidataAliases(entity, [match.label, sourceForm]).slice(0, 8);

  return createRemoteStructuredResult(query, {
    id: `wikidata:${entity.id || match.id}`,
    display: match.label || query,
    aliases,
    sourceForm,
    language,
    languageName: "",
    category: entityType.category || description || "structured source match",
    origin: description,
    pronunciation: {
      ipa,
      simple: "",
      audio: audioFiles.map((audioFile, index) => ({
        url: commonsRedirectUrl(audioFile),
        label: audioFiles.length > 1 ? `Pronunciation audio ${index + 1}` : "Pronunciation audio",
        source: "Wikimedia Commons",
        quality: "verified"
      }))
    },
    sourceStatus: audioFiles.length ? "verified-audio" : "structured-source",
    confidence: audioFiles.length ? "high" : confidenceForCandidate(query, sourceCandidate),
    evidence: [
      `Wikidata entity ${entity.id || match.id}`,
      entityEvidenceItem(entityType),
      sourceCandidate?.source ? `Source form from ${sourceCandidate.source}` : "",
      sourceCandidate?.languageHint ? `Source form matched lookup language hint: ${sourceCandidate.language}` : "",
      claimedLanguage?.code === language ? `Language from ${claimedLanguage.source}: ${claimedLanguage.code}` : "",
      audioFiles.length ? "Pronunciation audio from Wikidata" : "",
      audioFiles.length > 1 ? `Additional Wikidata pronunciation audio: ${audioFiles.length - 1}` : "",
      ipa ? "IPA from Wikidata" : "",
      aliases.length ? `Aliases: ${aliases.join(", ")}` : ""
    ].filter(Boolean),
    sources: [
      { label: "Wikidata", url: `https://www.wikidata.org/wiki/${entity.id || match.id}` },
      ...audioFiles.map((audioFile, index) => ({
        label: audioFiles.length > 1 ? `Pronunciation audio ${index + 1}` : "Pronunciation audio",
        url: commonsRedirectUrl(audioFile)
      }))
    ].filter(Boolean)
  });
}

export function selectBestWikidataResult(query, matches = [], entityById = {}, options = {}) {
  const languageHints = languageHintSet(options.languageHints);
  const results = matches
    .filter((match) => match?.id)
    .map((match, index) => {
      const entity = entityById[match.id];
      const result = entity
        ? buildWikidataResult(query, match, entity, { languageHints })
        : createWikidataSearchOnlyResult(query, match);
      if (!result) {
        return null;
      }

      return {
        result,
        score: scoreWikidataResult(query, match, entity, result, index, { languageHints })
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  const best = results[0]?.result || null;
  if (!best) {
    return null;
  }

  if (results.length <= 1) {
    return best;
  }

  const alternateResults = alternateWikidataResults(results, best);

  return {
    ...best,
    evidence: [...(best.evidence || []), `Selected from ${results.length} Wikidata candidates`],
    ...(alternateResults.length ? { alternateResults } : {})
  };
}

export function createWikidataSearchOnlyResult(query, match) {
  return createRemoteStructuredResult(query, {
    id: `wikidata:${match.id}`,
    display: match.label || query,
    aliases: searchOnlyAliases(query, match),
    sourceForm: match.label || query,
    language: match.language || "en",
    languageName: "English",
    category: match.description || "structured source match",
    confidence: "low",
    evidence: [`Wikidata search match ${match.id}`],
    sources: [{ label: "Wikidata", url: match.concepturi || `https://www.wikidata.org/wiki/${match.id}` }]
  });
}

export function commonsRedirectUrl(fileName) {
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}`;
}

function searchOnlyAliases(query, match = {}) {
  const excluded = new Set([
    createLookupKey(query),
    createLookupKey(match.label)
  ].filter(Boolean));

  return [match.match?.text]
    .map(normalizeSelection)
    .filter((value) => {
      const key = createLookupKey(value);
      return key && !excluded.has(key);
    });
}

function chooseSourceCandidate(query, match, entity, options = {}) {
  const selectedScript = detectScript(query).script;
  const languageHints = languageHintSet(options.languageHints);
  const candidates = [
    ...textClaimCandidates(entity, NATIVE_LABEL, "native label"),
    ...textClaimCandidates(entity, NATIVE_NAME, "native name"),
    ...textClaimCandidates(entity, OFFICIAL_NAME, "official name"),
    ...textClaimCandidates(entity, BIRTH_NAME, "birth name"),
    ...textClaimCandidates(entity, NAME, "name"),
    ...textClaimCandidates(entity, SHORT_NAME, "short name"),
    ...textClaimCandidates(entity, NICKNAME, "nickname"),
    ...textClaimCandidates(entity, TITLE, "title"),
    ...textClaimCandidates(entity, TAXON_COMMON_NAME, "taxon common name"),
    ...stringClaimCandidates(entity, TAXON_NAME, "taxon name", { language: "la" }),
    ...stringClaimCandidates(entity, PSEUDONYM, "pseudonym"),
    ...aliasCandidates(entity, "alias"),
    ...sitelinkCandidates(entity, "sitelink title"),
    ...labelCandidates(entity, "label")
  ].filter((candidate) => candidate.value);

  if (!candidates.length) {
    return {
      value: match.label || query,
      language: match.language || "en",
      source: "Wikidata search result"
    };
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      languageHint: matchesLanguageHint(candidate.language, languageHints),
      score: scoreCandidate(candidate, selectedScript, languageHints)
    }))
    .sort((left, right) => right.score - left.score)[0];
}

function scoreWikidataResult(query, match, entity, result, index, options = {}) {
  const queryKey = createLookupKey(query);
  const labelKey = createLookupKey(match.label);
  const matchTextKey = createLookupKey(match.match?.text);
  const aliasKeys = wikidataAliases(entity || {}).map(createLookupKey);
  const sourceKey = createLookupKey(result.sourceForm);
  const description = String(match.description || entity?.descriptions?.en?.value || "").toLowerCase();
  const entityType = wikidataEntityType(entity);
  const languageHints = languageHintSet(options.languageHints);
  let score = Math.max(0, 24 - index * 2);

  if (labelKey === queryKey) {
    score += 45;
  } else if (labelKey.includes(queryKey) || queryKey.includes(labelKey)) {
    score += 12;
  }

  if (matchTextKey === queryKey) {
    score += 24;
  }

  if (aliasKeys.includes(queryKey)) {
    score += 36;
  }

  if (sourceKey && sourceKey !== queryKey) {
    score += 8;
  }

  if (matchesLanguageHint(match.language, languageHints)) {
    score += 8;
  }

  if (matchesLanguageHint(result.language, languageHints)) {
    score += 8;
  }

  if (result.sourceStatus === "verified-audio") {
    score += 35;
  }

  if (result.pronunciation?.ipa) {
    score += 10;
  }

  if (result.confidence === "high") {
    score += 18;
  } else if (result.confidence === "medium") {
    score += 8;
  }

  if (description.includes("disambiguation")) {
    score -= 50;
  }

  if (description.includes("wikimedia category") || description.includes("category page")) {
    score -= 35;
  }

  score += entityType.score || 0;

  score += descriptionRelevanceScore(description);

  return score;
}

function entityEvidenceItem(entityType = {}) {
  if (!entityType.label) {
    return "";
  }

  return entityType.source
    ? `Entity signal from ${entityType.source}: ${entityType.label}`
    : `Entity type: ${entityType.label}`;
}

function descriptionRelevanceScore(description) {
  const text = String(description || "").toLowerCase();
  let score = 0;

  if (hasAnyDescription(text, ["family name", "given name", "surname"])) {
    score += 4;
  }

  if (hasAnyDescription(text, ["place", "city", "town", "village", "settlement", "municipality", "commune", "river", "mountain", "island", "region"])) {
    score += 4;
  }

  if (hasAnyDescription(text, ["species", "taxon", "protein", "gene", "enzyme", "chemical", "compound", "disease", "medical", "anatomical", "syndrome", "virus", "bacterium", "bacteria"])) {
    score += 5;
  }

  if (hasAnyDescription(text, ["algorithm", "programming language", "computer program", "computer science", "protocol", "data structure"])) {
    score += 5;
  }

  if (hasAnyDescription(text, ["mathematical", "mathematics", "theorem", "academic discipline", "scientific discipline", "field of study"])) {
    score += 5;
  }

  if (hasAnyDescription(text, ["index entry", "set index", "list of"])) {
    score -= 12;
  }

  return score;
}

function hasAnyDescription(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function alternateWikidataResults(results, best) {
  const seen = new Set([wikidataResultKey(best)].filter(Boolean));
  const alternates = [];

  for (const item of results) {
    const result = item.result;
    const key = wikidataResultKey(result);
    if (!key || seen.has(key) || !isUsefulWikidataAlternate(result)) {
      continue;
    }

    seen.add(key);
    alternates.push(result);

    if (alternates.length >= 4) {
      break;
    }
  }

  return alternates;
}

function wikidataResultKey(result = {}) {
  return [
    normalizeSelection(result.id),
    createLookupKey(result.sourceForm || result.display || result.query),
    normalizeSelection(result.language)
  ].filter(Boolean).join("|");
}

function isUsefulWikidataAlternate(result = {}) {
  const category = normalizeSelection(result.category || result.origin).toLowerCase();
  return Boolean(
    result.sourceForm &&
    result.sourceStatus &&
    !category.includes("disambiguation") &&
    !category.includes("metadata") &&
    !category.includes("wikimedia category") &&
    !category.includes("category page")
  );
}

function scoreCandidate(candidate, selectedScript, languageHints = new Set()) {
  const script = detectScript(candidate.value).script;
  let score = 0;

  if (candidate.source === "native label") {
    score += 8;
  } else if (candidate.source === "native name") {
    score += 7;
  } else if (candidate.source === "official name") {
    score += 6;
  } else if (candidate.source === "birth name" || candidate.source === "name") {
    score += 5;
  } else if (candidate.source === "title") {
    score += 5;
  } else if (candidate.source === "nickname" || candidate.source === "taxon common name") {
    score += 4;
  } else if (candidate.source === "taxon name" || candidate.source === "pseudonym") {
    score += 3;
  } else if (candidate.source === "alias") {
    score -= 3;
  } else if (candidate.source === "short name") {
    score += 3;
  } else if (candidate.source === "sitelink title") {
    score += 3;
  }

  if (candidate.language && candidate.language !== "en") {
    score += 4;
  }

  if (matchesLanguageHint(candidate.language, languageHints)) {
    score += 7;
  }

  if (script && script !== "Unknown" && script !== selectedScript) {
    score += 4;
  }

  if (candidate.language === "en") {
    score -= 2;
  }

  return score;
}

function confidenceForCandidate(query, candidate) {
  if (!candidate) {
    return "low";
  }

  if (normalizeSelection(candidate.value) === normalizeSelection(query) && candidate.language === "en") {
    return "low";
  }

  if (candidate.source === "native label" || candidate.source === "native name" || candidate.source === "official name") {
    return "medium";
  }

  if (["title", "nickname", "taxon common name"].includes(candidate.source) && candidate.language && candidate.language !== "en") {
    return "medium";
  }

  if (candidate.source === "alias" && candidate.language && candidate.language !== "en" && detectScript(candidate.value).script !== detectScript(query).script) {
    return "medium";
  }

  if (candidate.source === "sitelink title" && detectScript(candidate.value).script !== detectScript(query).script) {
    return "medium";
  }

  return "low";
}

function textClaimCandidates(entity, propertyId, source, options = {}) {
  const claims = entity.claims?.[propertyId] || [];
  return claims
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .map((value) => ({
      value: normalizeSelection(value?.text || (typeof value === "string" ? value : "")),
      language: value?.language || options.language || "",
      source
    }))
    .filter((candidate) => candidate.value);
}

function stringClaimCandidates(entity, propertyId, source, options = {}) {
  const claims = entity.claims?.[propertyId] || [];
  return claims
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => ({
      value: normalizeSelection(value),
      language: options.language || "",
      source
    }));
}

function labelCandidates(entity, source) {
  return Object.values(entity.labels || {}).map((label) => ({
    value: label.value,
    language: label.language || "",
    source
  }));
}

function aliasCandidates(entity, source) {
  return Object.values(entity.aliases || {})
    .flatMap((aliases) => Array.isArray(aliases) ? aliases : [])
    .map((alias) => ({
      value: normalizeSelection(alias?.value),
      language: alias?.language || "",
      source
    }))
    .filter((candidate) => candidate.value);
}

function sitelinkCandidates(entity, source) {
  return Object.entries(entity.sitelinks || {})
    .map(([key, sitelink]) => {
      const value = normalizeSitelinkTitle(sitelink?.title);
      const language = languageFromSitelink(sitelink?.site || key);
      return value && language
        ? { value, language, source }
        : null;
    })
    .filter(Boolean);
}

function firstStringClaimValue(entity, propertyId) {
  return stringClaimValues(entity, propertyId)[0] || "";
}

function stringClaimValues(entity, propertyId) {
  const claims = entity.claims?.[propertyId] || [];
  const values = [];
  const seen = new Set();

  for (const claim of claims) {
    const value = claim?.mainsnak?.datavalue?.value;
    if (typeof value === "string" && value.trim()) {
      const text = value.trim();
      const key = createLookupKey(text);
      if (key && !seen.has(key)) {
        seen.add(key);
        values.push(text);
      }
    }
  }

  return values;
}

function wikidataAliases(entity, excludedValues = []) {
  const excluded = new Set(excludedValues.map(createLookupKey).filter(Boolean));
  const values = [
    ...Object.values(entity.aliases || {}).flat().map((alias) => alias.value),
    ...textClaimCandidates(entity, NATIVE_LABEL, "native label").map((candidate) => candidate.value),
    ...textClaimCandidates(entity, NATIVE_NAME, "native name").map((candidate) => candidate.value),
    ...textClaimCandidates(entity, OFFICIAL_NAME, "official name").map((candidate) => candidate.value),
    ...textClaimCandidates(entity, BIRTH_NAME, "birth name").map((candidate) => candidate.value),
    ...textClaimCandidates(entity, NAME, "name").map((candidate) => candidate.value),
    ...textClaimCandidates(entity, SHORT_NAME, "short name").map((candidate) => candidate.value),
    ...textClaimCandidates(entity, NICKNAME, "nickname").map((candidate) => candidate.value),
    ...textClaimCandidates(entity, TITLE, "title").map((candidate) => candidate.value),
    ...textClaimCandidates(entity, TAXON_COMMON_NAME, "taxon common name").map((candidate) => candidate.value),
    ...stringClaimCandidates(entity, TAXON_NAME, "taxon name").map((candidate) => candidate.value),
    ...stringClaimCandidates(entity, PSEUDONYM, "pseudonym").map((candidate) => candidate.value),
    ...sitelinkCandidates(entity, "sitelink title").map((candidate) => candidate.value),
    ...Object.values(entity.labels || {}).map((label) => label.value)
  ];
  const seen = new Set();

  return values
    .map(normalizeSelection)
    .filter((value) => {
      const key = createLookupKey(value);
      if (!key || excluded.has(key) || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function normalizeSitelinkTitle(value) {
  return normalizeSelection(String(value || "").replace(/_/g, " "));
}

function languageFromSitelink(value) {
  const match = String(value || "").toLowerCase().match(/^([a-z]{2,3})(?:[_-][a-z0-9]+)*wiki$/);
  return match?.[1] || "";
}

function languageHintSet(value) {
  return value instanceof Set
    ? value
    : new Set(normalizeWikidataSearchLanguageHints(value));
}

function matchesLanguageHint(language, hints = new Set()) {
  const base = String(language || "").trim().toLowerCase().split(/[-_]/)[0];
  return Boolean(base && hints.has(base));
}
