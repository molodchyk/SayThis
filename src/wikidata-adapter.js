import {
  createRemoteStructuredResult,
  createLookupKey,
  detectScript,
  normalizeSelection
} from "./resolver-core.js";

const NATIVE_LABEL = "P1705";
const NATIVE_NAME = "P1559";
const OFFICIAL_NAME = "P1448";
const SHORT_NAME = "P1813";
const BIRTH_NAME = "P1477";
const NAME = "P2561";
const PRONUNCIATION_AUDIO = "P443";
const IPA_TRANSCRIPTION = "P898";
const SCRIPT_SEARCH_LANGUAGES = {
  Arabic: ["ar", "fa"],
  Armenian: ["hy"],
  Cyrillic: ["ru", "bg", "sr"],
  Devanagari: ["hi", "mr", "ne"],
  Greek: ["el"],
  Han: ["zh", "ja", "ko"],
  Hangul: ["ko"],
  Hebrew: ["he"],
  Hiragana: ["ja"],
  Katakana: ["ja"],
  Thai: ["th"]
};

export function buildWikidataResult(query, match, entity) {
  if (!match?.id || !entity) {
    return null;
  }

  const sourceCandidate = chooseSourceCandidate(query, match, entity);
  const description = entity.descriptions?.en?.value || match.description || "";
  const audioFile = firstStringClaimValue(entity, PRONUNCIATION_AUDIO);
  const ipa = firstStringClaimValue(entity, IPA_TRANSCRIPTION);
  const sourceForm = sourceCandidate?.value || match.label || query;
  const aliases = wikidataAliases(entity, [match.label, sourceForm]).slice(0, 8);

  return createRemoteStructuredResult(query, {
    id: `wikidata:${entity.id || match.id}`,
    display: match.label || query,
    aliases,
    sourceForm,
    language: sourceCandidate?.language || match.language || "en",
    languageName: "",
    category: description || "structured source match",
    origin: description,
    pronunciation: {
      ipa,
      simple: "",
      audio: audioFile ? [{
        url: commonsRedirectUrl(audioFile),
        label: "Pronunciation audio",
        source: "Wikimedia Commons",
        quality: "verified"
      }] : []
    },
    sourceStatus: audioFile ? "verified-audio" : "structured-source",
    confidence: audioFile ? "high" : confidenceForCandidate(query, sourceCandidate),
    evidence: [
      `Wikidata entity ${entity.id || match.id}`,
      sourceCandidate?.source ? `Source form from ${sourceCandidate.source}` : "",
      audioFile ? "Pronunciation audio from Wikidata" : "",
      ipa ? "IPA from Wikidata" : "",
      aliases.length ? `Aliases: ${aliases.join(", ")}` : ""
    ].filter(Boolean),
    sources: [
      { label: "Wikidata", url: `https://www.wikidata.org/wiki/${entity.id || match.id}` },
      audioFile ? { label: "Pronunciation audio", url: commonsRedirectUrl(audioFile) } : null
    ].filter(Boolean)
  });
}

export function selectBestWikidataResult(query, matches = [], entityById = {}) {
  const results = matches
    .filter((match) => match?.id)
    .map((match, index) => {
      const entity = entityById[match.id];
      const result = entity ? buildWikidataResult(query, match, entity) : createWikidataSearchOnlyResult(query, match);
      if (!result) {
        return null;
      }

      return {
        result,
        score: scoreWikidataResult(query, match, entity, result, index)
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

  return {
    ...best,
    evidence: [...(best.evidence || []), `Selected from ${results.length} Wikidata candidates`]
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

export function wikidataSearchLanguages(query) {
  const script = detectScript(query).script;
  return [...new Set(["en", ...(SCRIPT_SEARCH_LANGUAGES[script] || [])])].slice(0, 4);
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

function chooseSourceCandidate(query, match, entity) {
  const selectedScript = detectScript(query).script;
  const candidates = [
    ...monolingualClaimCandidates(entity, NATIVE_LABEL, "native label"),
    ...monolingualClaimCandidates(entity, NATIVE_NAME, "native name"),
    ...monolingualClaimCandidates(entity, OFFICIAL_NAME, "official name"),
    ...monolingualClaimCandidates(entity, BIRTH_NAME, "birth name"),
    ...monolingualClaimCandidates(entity, NAME, "name"),
    ...monolingualClaimCandidates(entity, SHORT_NAME, "short name"),
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
      score: scoreCandidate(candidate, selectedScript)
    }))
    .sort((left, right) => right.score - left.score)[0];
}

function scoreWikidataResult(query, match, entity, result, index) {
  const queryKey = createLookupKey(query);
  const labelKey = createLookupKey(match.label);
  const matchTextKey = createLookupKey(match.match?.text);
  const aliasKeys = wikidataAliases(entity || {}).map(createLookupKey);
  const sourceKey = createLookupKey(result.sourceForm);
  const description = String(match.description || entity?.descriptions?.en?.value || "").toLowerCase();
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

  if (description.includes("family name") || description.includes("given name") || description.includes("place") || description.includes("city")) {
    score += 4;
  }

  return score;
}

function scoreCandidate(candidate, selectedScript) {
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
  } else if (candidate.source === "short name") {
    score += 3;
  }

  if (candidate.language && candidate.language !== "en") {
    score += 4;
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

  return candidate.source === "native label" || candidate.source === "native name" || candidate.source === "official name" ? "medium" : "low";
}

function monolingualClaimCandidates(entity, propertyId, source) {
  const claims = entity.claims?.[propertyId] || [];
  return claims
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter((value) => value?.text)
    .map((value) => ({
      value: value.text,
      language: value.language || "",
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

function firstStringClaimValue(entity, propertyId) {
  const claims = entity.claims?.[propertyId] || [];
  for (const claim of claims) {
    const value = claim?.mainsnak?.datavalue?.value;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function wikidataAliases(entity, excludedValues = []) {
  const excluded = new Set(excludedValues.map(createLookupKey).filter(Boolean));
  const values = [
    ...Object.values(entity.aliases || {}).flat().map((alias) => alias.value),
    ...monolingualClaimCandidates(entity, NATIVE_LABEL, "native label").map((candidate) => candidate.value),
    ...monolingualClaimCandidates(entity, NATIVE_NAME, "native name").map((candidate) => candidate.value),
    ...monolingualClaimCandidates(entity, OFFICIAL_NAME, "official name").map((candidate) => candidate.value),
    ...monolingualClaimCandidates(entity, BIRTH_NAME, "birth name").map((candidate) => candidate.value),
    ...monolingualClaimCandidates(entity, NAME, "name").map((candidate) => candidate.value),
    ...monolingualClaimCandidates(entity, SHORT_NAME, "short name").map((candidate) => candidate.value),
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
