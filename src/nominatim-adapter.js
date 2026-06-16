import {
  createLookupKey,
  createRemoteStructuredResult,
  detectScript,
  normalizeSelection
} from "./resolver-core.js";

const DEFAULT_LIMIT = 5;
const LOCAL_NAME_KEYS = new Set(["name", "official_name", "loc_name", "short_name"]);
const PLACE_TYPES = new Set([
  "administrative",
  "borough",
  "city",
  "country",
  "county",
  "district",
  "hamlet",
  "municipality",
  "neighbourhood",
  "province",
  "state",
  "suburb",
  "town",
  "village"
]);

export function buildNominatimSearchUrl(query, endpoint, options = {}) {
  const selectedText = normalizeSelection(query);
  const url = normalizeEndpoint(endpoint);
  if (!selectedText || !url) {
    return "";
  }

  url.searchParams.set("q", selectedText);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(clampInteger(options.limit, 1, 10, DEFAULT_LIMIT)));
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("dedupe", "1");

  const acceptLanguage = normalizeSelection(options.acceptLanguage);
  if (acceptLanguage) {
    url.searchParams.set("accept-language", acceptLanguage);
  }

  return url.toString();
}

export function buildNominatimResult(query, places = [], options = {}) {
  const selectedText = normalizeSelection(query);
  const languageHints = gazetteerLanguageHintSet(options.languageHints);
  const place = selectBestNominatimPlace(selectedText, places, { languageHints });
  if (!selectedText || !place) {
    return null;
  }

  const sourceCandidate = chooseSourceCandidate(selectedText, place, { languageHints });
  const sourceForm = sourceCandidate?.value || normalizeSelection(place.name || selectedText);
  const aliases = aliasCandidatesFromPlace(place, [selectedText, sourceForm]);
  const osmUrl = osmUrlFromPlace(place);
  const placeType = placeTypeLabel(place);
  const country = normalizeSelection(place.address?.country);
  const osmId = osmObjectLabel(place);
  const id = `nominatim:${osmId || createLookupKey(place.display_name || sourceForm)}`;
  const display = normalizeSelection(place.name || selectedText);
  const origin = [placeType, country].filter(Boolean).join("; ");

  const result = createRemoteStructuredResult(selectedText, {
    id,
    display,
    aliases,
    sourceForm,
    language: sourceCandidate?.language || "",
    languageName: "",
    category: "place",
    origin,
    pronunciation: {},
    sourceStatus: "structured-source",
    confidence: sourceCandidate?.confidence || "medium",
    evidence: placeEvidence(osmId, placeType, sourceCandidate?.source),
    sources: placeSources(osmUrl)
  });

  const alternateResults = alternateResultsFromPlace(selectedText, place, sourceCandidate, {
    id,
    display,
    origin,
    osmId,
    osmUrl,
    placeType,
    languageHints
  });

  return alternateResults.length
    ? { ...result, alternateResults }
    : result;
}

export function selectBestNominatimPlace(query, places = [], options = {}) {
  const languageHints = gazetteerLanguageHintSet(options.languageHints);
  const candidates = Array.isArray(places) ? places : [];
  return candidates
    .map((place, index) => ({
      place,
      score: scorePlace(query, place, index, { languageHints })
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.place || null;
}

export function nominatimAcceptLanguage(options = {}) {
  const values = [
    options.language,
    ...(Array.isArray(options.languageHints) ? options.languageHints : String(options.languageHints || "").split(/[\s,;]+/)),
    "en"
  ];
  const seen = new Set();
  const languages = [];

  for (const value of values) {
    const language = normalizeGazetteerLanguage(value);
    if (!language || seen.has(language)) {
      continue;
    }

    seen.add(language);
    languages.push(language);
    if (languages.length >= 5) {
      break;
    }
  }

  return languages.length > 1 || languages[0] !== "en"
    ? languages.join(",")
    : "";
}

function chooseSourceCandidate(query, place, options = {}) {
  const candidates = nameCandidates(place);
  if (!candidates.length) {
    return {
      value: normalizeSelection(place.name || query),
      language: "",
      source: "gazetteer name",
      confidence: "low"
    };
  }

  const selectedScript = detectScript(query).script;
  const languageHints = gazetteerLanguageHintSet(options.languageHints);
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreSourceCandidate(query, selectedScript, candidate, { languageHints })
    }))
    .sort((left, right) => right.score - left.score)[0];
}

function nameCandidates(place = {}) {
  const namedetails = place.namedetails && typeof place.namedetails === "object"
    ? place.namedetails
    : {};
  const candidates = [];

  addCandidate(candidates, "name", place.name, "gazetteer name");

  for (const [key, value] of Object.entries(namedetails)) {
    const source = sourceLabelForNameKey(key);
    for (const part of splitNameValue(value)) {
      addCandidate(candidates, key, part, source);
    }
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${createLookupKey(candidate.value)}:${candidate.language}:${candidate.source}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function aliasCandidatesFromPlace(place, excludedValues = []) {
  const excluded = new Set(excludedValues.map(createLookupKey).filter(Boolean));
  const aliases = [];
  const seen = new Set();

  for (const candidate of nameCandidates(place)) {
    const key = createLookupKey(candidate.value);
    if (!key || excluded.has(key) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    aliases.push(candidate.value);
  }

  return aliases.slice(0, 12);
}

function alternateResultsFromPlace(query, place, primaryCandidate, context) {
  const selectedScript = detectScript(query).script;
  const seen = new Set([nameCandidateKey(primaryCandidate)].filter(Boolean));
  const alternates = [];
  const languageHints = gazetteerLanguageHintSet(context.languageHints);

  const candidates = nameCandidates(place)
    .map((candidate) => ({
      ...candidate,
      score: scoreSourceCandidate(query, selectedScript, candidate, { languageHints })
    }))
    .sort((left, right) => right.score - left.score);

  for (const candidate of candidates) {
    const key = nameCandidateKey(candidate);
    if (!key || !candidate.language || seen.has(key)) {
      continue;
    }

    seen.add(key);
    alternates.push(createRemoteStructuredResult(query, {
      id: `${context.id}:alternate:${createLookupKey(candidate.value)}:${candidate.language}`,
      display: context.display,
      aliases: [],
      sourceForm: candidate.value,
      language: candidate.language,
      languageName: "",
      category: "place",
      origin: context.origin,
      pronunciation: {},
      sourceStatus: "structured-source",
      confidence: candidate.confidence || "low",
      evidence: placeEvidence(context.osmId, context.placeType, candidate.source),
      sources: placeSources(context.osmUrl)
    }));

    if (alternates.length >= 4) {
      break;
    }
  }

  return alternates;
}

function nameCandidateKey(candidate = {}) {
  const key = createLookupKey(candidate.value);
  return key ? `${key}:${candidate.language || ""}` : "";
}

function placeEvidence(osmId, placeType, source) {
  return [
    "Gazetteer match from Nominatim-compatible search",
    osmId ? `OpenStreetMap object ${osmId}` : "",
    placeType ? `Place type: ${placeType}` : "",
    source ? `Source form from ${source}` : "",
    "Data attribution: OpenStreetMap contributors"
  ].filter(Boolean);
}

function placeSources(osmUrl) {
  return [
    osmUrl ? { label: "OpenStreetMap", url: osmUrl } : null,
    { label: "OpenStreetMap attribution", url: "https://www.openstreetmap.org/copyright" }
  ].filter(Boolean);
}

function addCandidate(candidates, key, value, source) {
  const text = normalizeSelection(value);
  if (!text) {
    return;
  }

  candidates.push({
    value: text,
    language: languageFromNameKey(key),
    key,
    source,
    confidence: confidenceForNameKey(key)
  });
}

function splitNameValue(value) {
  return String(value || "")
    .split(";")
    .map(normalizeSelection)
    .filter(Boolean);
}

function sourceLabelForNameKey(key) {
  const base = String(key || "").split(":")[0];
  if (base === "official_name") {
    return "official gazetteer name";
  }
  if (base === "loc_name") {
    return "local gazetteer name";
  }
  if (base === "short_name") {
    return "short gazetteer name";
  }
  if (base === "alt_name") {
    return "alternate gazetteer name";
  }
  if (base === "old_name") {
    return "historical gazetteer name";
  }
  return "gazetteer name";
}

function languageFromNameKey(key) {
  const parts = String(key || "").split(":");
  if (parts.length < 2) {
    return "";
  }

  const language = parts[1].split(/[-_]/)[0].toLowerCase();
  return /^[a-z]{2,3}$/.test(language) ? language : "";
}

function confidenceForNameKey(key) {
  const base = String(key || "").split(":")[0];
  return LOCAL_NAME_KEYS.has(base) ? "medium" : "low";
}

function scoreSourceCandidate(query, selectedScript, candidate, options = {}) {
  const queryKey = createLookupKey(query);
  const candidateKey = createLookupKey(candidate.value);
  const script = detectScript(candidate.value).script;
  const base = String(candidate.key || "").split(":")[0];
  const languageHints = gazetteerLanguageHintSet(options.languageHints);
  let score = 0;

  if (base === "name") {
    score += 10;
  } else if (base === "official_name") {
    score += 8;
  } else if (base === "loc_name") {
    score += 7;
  } else if (base === "short_name") {
    score += 4;
  } else if (base === "alt_name") {
    score += 2;
  }

  if (candidate.language && candidate.language !== "en") {
    score += 6;
  }

  if (matchesGazetteerLanguageHint(candidate.language, languageHints)) {
    score += 8;
  }

  if (script && script !== "Unknown" && script !== selectedScript) {
    score += 5;
  }

  if (candidateKey === queryKey) {
    score += candidate.language === "en" ? 1 : 3;
  }

  if (candidate.language === "en" && candidateKey !== queryKey) {
    score -= 1;
  }

  return score;
}

function scorePlace(query, place = {}, index, options = {}) {
  const queryKey = createLookupKey(query);
  const languageHints = gazetteerLanguageHintSet(options.languageHints);
  const candidates = nameCandidates(place);
  const names = candidates.map((candidate) => createLookupKey(candidate.value));
  const displayKey = createLookupKey(place.display_name);
  const type = normalizeSelection(place.type || place.addresstype).toLowerCase();
  const category = normalizeSelection(place.category || place.class).toLowerCase();
  const importance = Number(place.importance || 0);
  let score = Math.max(0, 20 - index * 2);

  if (!queryKey) {
    return 0;
  }

  if (names.includes(queryKey)) {
    score += 42;
  } else if (names.some((name) => name.includes(queryKey) || queryKey.includes(name))) {
    score += 14;
  } else if (displayKey.includes(queryKey)) {
    score += 8;
  }

  if (candidates.some((candidate) => matchesGazetteerLanguageHint(candidate.language, languageHints))) {
    score += 6;
  }

  if (PLACE_TYPES.has(type) || PLACE_TYPES.has(category)) {
    score += 10;
  }

  if (category === "place" || category === "boundary" || category === "natural") {
    score += 6;
  }

  if (place.osm_id && place.osm_type) {
    score += 3;
  }

  if (Number.isFinite(importance) && importance > 0) {
    score += Math.min(14, importance * 20);
  }

  if (!place.name && !Object.keys(place.namedetails || {}).length) {
    score -= 10;
  }

  return score;
}

function placeTypeLabel(place = {}) {
  return [
    normalizeSelection(place.category || place.class),
    normalizeSelection(place.type || place.addresstype)
  ].filter(Boolean).join("/");
}

function osmObjectLabel(place = {}) {
  const type = normalizeSelection(place.osm_type).toLowerCase();
  const id = normalizeSelection(place.osm_id);
  return type && id ? `${type}/${id}` : "";
}

function osmUrlFromPlace(place = {}) {
  const label = osmObjectLabel(place);
  if (!label) {
    return "";
  }

  const [type, id] = label.split("/");
  const pathType = {
    n: "node",
    node: "node",
    w: "way",
    way: "way",
    r: "relation",
    relation: "relation"
  }[type];

  return pathType && id ? `https://www.openstreetmap.org/${pathType}/${encodeURIComponent(id)}` : "";
}

function normalizeEndpoint(endpoint) {
  try {
    const url = new URL(String(endpoint || "").trim());
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function gazetteerLanguageHintSet(value) {
  return value instanceof Set
    ? value
    : new Set(normalizeGazetteerLanguages(value));
}

function normalizeGazetteerLanguages(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[\s,;]+/);
  const seen = new Set();
  const languages = [];

  for (const item of values) {
    const language = normalizeGazetteerLanguage(item);
    if (!language || seen.has(language)) {
      continue;
    }

    seen.add(language);
    languages.push(language);
    if (languages.length >= 5) {
      break;
    }
  }

  return languages;
}

function normalizeGazetteerLanguage(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)?.[0]
    ?.split("-")[0] || "";
}

function matchesGazetteerLanguageHint(language, hints = new Set()) {
  const base = normalizeGazetteerLanguage(language);
  return Boolean(base && hints.has(base));
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(number)));
}
