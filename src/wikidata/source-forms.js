import {
  createLookupKey,
  normalizeSelection
} from "../resolver/text.js";

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

export function sourceFormCandidates(entity) {
  return [
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
}

export function wikidataAliases(entity, excludedValues = []) {
  const excluded = new Set(excludedValues.map(createLookupKey).filter(Boolean));
  const values = sourceFormCandidates(entity).map((candidate) => candidate.value);
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

export function wikidataVariants(entity, excludedValues = []) {
  const excluded = new Set(excludedValues.map(createLookupKey).filter(Boolean));
  const seen = new Set();
  const variantSources = new Set([
    "native label",
    "native name",
    "official name",
    "birth name",
    "name",
    "short name",
    "nickname",
    "title",
    "taxon common name",
    "taxon name",
    "pseudonym",
    "sitelink title",
    "label"
  ]);

  return sourceFormCandidates(entity)
    .filter((candidate) => variantSources.has(candidate.source))
    .map((candidate) => candidate.value)
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

function normalizeSitelinkTitle(value) {
  return normalizeSelection(String(value || "").replace(/_/g, " "));
}

function languageFromSitelink(value) {
  const match = String(value || "").toLowerCase().match(/^([a-z]{2,3})(?:[_-][a-z0-9]+)*wiki$/);
  return match?.[1] || "";
}
