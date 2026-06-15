import {
  createRemoteStructuredResult,
  detectScript,
  normalizeSelection
} from "./resolver-core.js";

const NATIVE_LABEL = "P1705";
const OFFICIAL_NAME = "P1448";
const SHORT_NAME = "P1813";
const PRONUNCIATION_AUDIO = "P443";
const IPA_TRANSCRIPTION = "P898";

export function buildWikidataResult(query, match, entity) {
  if (!match?.id || !entity) {
    return null;
  }

  const sourceCandidate = chooseSourceCandidate(query, match, entity);
  const description = entity.descriptions?.en?.value || match.description || "";
  const audioFile = firstStringClaimValue(entity, PRONUNCIATION_AUDIO);
  const ipa = firstStringClaimValue(entity, IPA_TRANSCRIPTION);
  const aliases = wikidataAliases(entity).slice(0, 8);
  const sourceForm = sourceCandidate?.value || match.label || query;

  return createRemoteStructuredResult(query, {
    id: `wikidata:${entity.id || match.id}`,
    display: match.label || query,
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

export function createWikidataSearchOnlyResult(query, match) {
  return createRemoteStructuredResult(query, {
    id: `wikidata:${match.id}`,
    display: match.label || query,
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

function chooseSourceCandidate(query, match, entity) {
  const selectedScript = detectScript(query).script;
  const candidates = [
    ...monolingualClaimCandidates(entity, NATIVE_LABEL, "native label"),
    ...monolingualClaimCandidates(entity, OFFICIAL_NAME, "official name"),
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

function scoreCandidate(candidate, selectedScript) {
  const script = detectScript(candidate.value).script;
  let score = 0;

  if (candidate.source === "native label") {
    score += 8;
  } else if (candidate.source === "official name") {
    score += 6;
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

  return candidate.source === "native label" || candidate.source === "official name" ? "medium" : "low";
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

function wikidataAliases(entity) {
  return Object.values(entity.aliases || {})
    .flat()
    .map((alias) => alias.value)
    .filter(Boolean);
}

