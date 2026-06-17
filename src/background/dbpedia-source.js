import {
  createLookupKey,
  createRemoteStructuredResult,
  normalizeSelection
} from "../resolver-core.js";
import {
  normalizeHttpsEndpoint
} from "../shared/settings.js";

export function buildDbpediaLookupUrl(query, endpoint, options = {}) {
  const selectedText = normalizeSelection(query);
  const url = endpointUrl(endpoint);
  if (!selectedText || !url) {
    return "";
  }

  url.searchParams.set("query", selectedText);
  url.searchParams.set("format", "json");
  url.searchParams.set("maxResults", String(clampNumber(options.limit || 5, 1, 20)));
  return url.toString();
}

export function buildDbpediaResult(query, payload = {}, options = {}) {
  const selectedText = normalizeSelection(query);
  const label = normalizeSelection(options.label || "DBpedia");
  const candidates = dbpediaCandidates(payload)
    .map((item, index) => ({
      item,
      score: scoreCandidate(selectedText, item, index)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
  const primary = candidates[0]?.item;
  if (!selectedText || !primary) {
    return null;
  }

  const result = dbpediaCandidateResult(selectedText, primary, label);
  const alternateResults = candidates
    .slice(1)
    .map((candidate) => dbpediaCandidateResult(selectedText, candidate.item, label))
    .filter((candidate) => candidate.sourceForm)
    .slice(0, 4);

  return alternateResults.length
    ? { ...result, alternateResults }
    : result;
}

function dbpediaCandidateResult(selectedText, item, label) {
  const uri = normalizeUrl(firstValue(item.uri, item.URI, item.resource, item.Resource));
  const sourceForm = normalizeSelection(firstValue(item.label, item.Label, item.name, item.Name)) ||
    labelFromUri(uri) ||
    selectedText;
  const description = normalizeSelection(firstValue(item.description, item.Description, item.comment, item.Comment, item.abstract));
  const domainHint = domainHintFromCandidate(item);
  const variants = variantsForCandidate(selectedText, item, uri, sourceForm);

  return createRemoteStructuredResult(selectedText, {
    id: `dbpedia:${createLookupKey(uri || sourceForm)}`,
    display: sourceForm,
    sourceForm,
    aliases: aliasesForCandidate(selectedText, item, uri),
    variants,
    language: normalizeSelection(item.language || "en"),
    languageName: normalizeSelection(item.languageName || "English"),
    category: categoryFromCandidate(item),
    domainHint,
    confidence: description || domainHint ? "medium" : "low",
    sourceStatus: "structured-source",
    evidence: [
      `Structured result from ${label}`,
      domainHint ? `Domain: ${domainHint}` : "",
      variants.length ? `${label} variants: ${variants.length}` : "",
      description
    ].filter(Boolean).slice(0, 4),
    sources: uri ? [{ label, url: uri }] : [],
    notes: description
  });
}

function dbpediaCandidates(payload = {}) {
  if (Array.isArray(payload.docs)) {
    return payload.docs;
  }
  if (Array.isArray(payload.results)) {
    return payload.results;
  }
  if (Array.isArray(payload.Results)) {
    return payload.Results;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return [];
}

function scoreCandidate(query, item, index) {
  const lookupKey = createLookupKey(query);
  const forms = [
    firstValue(item.label, item.Label, item.name, item.Name),
    labelFromUri(firstValue(item.uri, item.URI, item.resource, item.Resource)),
    ...arrayValues(item.aliases, item.Aliases),
    ...variantValuesForCandidate(item)
  ].map(createLookupKey).filter(Boolean);
  let score = Math.max(0, 80 - index);

  if (forms.includes(lookupKey)) {
    score += 120;
  }
  if (forms.some((form) => form.includes(lookupKey) || lookupKey.includes(form))) {
    score += 35;
  }
  if (firstValue(item.description, item.Description, item.comment, item.Comment, item.abstract)) {
    score += 15;
  }
  if (domainHintFromCandidate(item)) {
    score += 10;
  }
  if (normalizeUrl(firstValue(item.uri, item.URI, item.resource, item.Resource))) {
    score += 10;
  }

  return forms.length ? score : 0;
}

function aliasesForCandidate(selectedText, item, uri) {
  return uniqueValues([
    selectedText,
    labelFromUri(uri),
    ...arrayValues(item.aliases, item.Aliases)
  ]).filter((value) => createLookupKey(value) !== createLookupKey(firstValue(item.label, item.Label, item.name, item.Name)));
}

function variantsForCandidate(selectedText, item, uri, sourceForm) {
  const excluded = new Set([
    selectedText,
    sourceForm,
    labelFromUri(uri)
  ].map(createLookupKey).filter(Boolean));
  const seen = new Set();
  const variants = [];

  for (const value of variantValuesForCandidate(item)) {
    const text = normalizeSelection(value);
    const key = createLookupKey(text);
    if (!key || excluded.has(key) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    variants.push(text);
    if (variants.length >= 12) {
      break;
    }
  }

  return variants;
}

function variantValuesForCandidate(item) {
  return arrayValues(
    item.variants,
    item.Variants,
    item.variant,
    item.Variant,
    item.variantLabels,
    item.VariantLabels,
    item.alternateLabels,
    item.AlternateLabels,
    item.altLabels,
    item.AltLabels,
    item.altLabel,
    item.AltLabel,
    item.redirectlabel,
    item.redirectLabel,
    item.RedirectLabel,
    item.redirectLabels,
    item.RedirectLabels,
    item.redirect,
    item.Redirect,
    item.redirects,
    item.Redirects
  ).map((value) => labelFromUri(value) || value);
}

function categoryFromCandidate(item) {
  return normalizeSelection(firstValue(item.category, item.Category)) ||
    normalizeSelection(lastPathSegment(firstValue(...arrayValues(item.classes, item.Classes, item.type, item.Type)))) ||
    "knowledge-graph-entity";
}

function domainHintFromCandidate(item) {
  return normalizeSelection(firstValue(item.domainHint, item.domain, item.Domain)) ||
    normalizeSelection(lastPathSegment(firstValue(...arrayValues(item.classes, item.Classes, item.type, item.Type)))) ||
    normalizeSelection(lastPathSegment(firstValue(...arrayValues(item.categories, item.Categories))));
}

function endpointUrl(endpoint) {
  const normalized = normalizeHttpsEndpoint(endpoint);
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function firstValue(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const found = value.map(firstValue).find(Boolean);
      if (found) {
        return found;
      }
    } else if (value && typeof value === "object") {
      const found = firstValue(value.label, value.value, value.uri, value.id);
      if (found) {
        return found;
      }
    } else {
      const text = normalizeSelection(value);
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function arrayValues(...values) {
  return values.flatMap((value) => Array.isArray(value) ? value.map(firstValue).filter(Boolean) : firstValue(value) ? [firstValue(value)] : []);
}

function uniqueValues(values = []) {
  return [...new Set(values.map(normalizeSelection).filter(Boolean))].slice(0, 12);
}

function labelFromUri(value) {
  const url = normalizeUrl(value);
  if (!url) {
    return "";
  }

  return decodeURIComponent(lastPathSegment(url))
    .replace(/_/g, " ")
    .trim();
}

function lastPathSegment(value) {
  return String(value || "")
    .split(/[\/#]/)
    .filter(Boolean)
    .at(-1) || "";
}

function normalizeUrl(value) {
  const text = normalizeSelection(value);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    if (url.protocol === "http:" && url.hostname.endsWith("dbpedia.org")) {
      url.protocol = "https:";
    }
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function clampNumber(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, Math.floor(number)))
    : min;
}
