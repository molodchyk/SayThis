import {
  normalizeSearchLanguageHints
} from "./search-languages.js";

const LANGUAGE_CLAIM_PROPERTIES = [
  { id: "P407", source: "language of name", score: 16 },
  { id: "P364", source: "original language", score: 12 },
  { id: "P103", source: "native language", score: 8 },
  { id: "P37", source: "official language", score: 6 }
];
const COUNTRY_CLAIM_PROPERTIES = [
  { id: "P17", source: "country language hint", score: 4 },
  { id: "P495", source: "origin country language hint", score: 3 }
];
const LANGUAGE_CODE_BY_ENTITY_ID = {
  Q150: "fr",
  Q188: "de",
  Q256: "tr",
  Q397: "la",
  Q652: "it",
  Q809: "pl",
  Q1321: "es",
  Q1412: "fi",
  Q1568: "hi",
  Q5146: "pt",
  Q5287: "ja",
  Q6654: "hr",
  Q7411: "nl",
  Q7737: "ru",
  Q7850: "zh",
  Q7913: "ro",
  Q7918: "bg",
  Q8785: "hy",
  Q8798: "uk",
  Q9027: "sv",
  Q9035: "da",
  Q9043: "no",
  Q9056: "cs",
  Q9067: "hu",
  Q9129: "el",
  Q9142: "ga",
  Q9168: "fa",
  Q9176: "ko",
  Q9199: "vi",
  Q9217: "th",
  Q9288: "he",
  Q9299: "sr",
  Q13955: "ar",
  Q1860: "en"
};
const COUNTRY_LANGUAGE_CODE_BY_ENTITY_ID = {
  Q17: "ja",
  Q29: "es",
  Q30: "en",
  Q36: "pl",
  Q38: "it",
  Q41: "el",
  Q43: "tr",
  Q45: "pt",
  Q142: "fr",
  Q145: "en",
  Q148: "zh",
  Q155: "pt",
  Q159: "ru",
  Q183: "de",
  Q212: "uk",
  Q884: "ko"
};

export function wikidataClaimedLanguage(entity, options = {}) {
  const hints = languageHintSet(options.languageHints);
  const candidates = [
    ...claimLanguageCandidates(entity, LANGUAGE_CLAIM_PROPERTIES, LANGUAGE_CODE_BY_ENTITY_ID, hints),
    ...claimLanguageCandidates(entity, COUNTRY_CLAIM_PROPERTIES, COUNTRY_LANGUAGE_CODE_BY_ENTITY_ID, hints)
  ];

  return strongestLanguageCandidate(candidates);
}

export function wikidataLanguageCodeFromClaimValue(value) {
  return normalizeLanguageCode(LANGUAGE_CODE_BY_ENTITY_ID[entityIdFromClaimValue(value)]);
}

export function wikidataResultLanguage(sourceCandidate, claimedLanguage, match = {}) {
  const candidateLanguage = sourceCandidate?.language || "";
  if (shouldUseClaimedLanguage(candidateLanguage, sourceCandidate, claimedLanguage)) {
    return claimedLanguage.code;
  }

  return candidateLanguage || claimedLanguage?.code || match.language || "en";
}

function claimLanguageCandidates(entity, properties, codeById, hints) {
  const candidates = [];

  for (const property of properties) {
    for (const id of claimEntityIds(entity, property.id)) {
      const code = normalizeLanguageCode(codeById[id]);
      if (!code) {
        continue;
      }

      candidates.push({
        id,
        code,
        source: property.source,
        score: property.score + (hints.has(code) ? 10 : 0)
      });
    }
  }

  return candidates;
}

function strongestLanguageCandidate(candidates) {
  const seen = new Set();
  return candidates
    .filter((candidate) => {
      const key = `${candidate.code}:${candidate.source}`;
      if (!candidate.code || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .sort((left, right) => right.score - left.score)[0] || null;
}

function claimEntityIds(entity, propertyId) {
  return (entity?.claims?.[propertyId] || [])
    .map((claim) => entityIdFromClaimValue(claim?.mainsnak?.datavalue?.value))
    .filter(Boolean);
}

function entityIdFromClaimValue(value) {
  if (typeof value?.id === "string" && /^Q\d+$/.test(value.id)) {
    return value.id;
  }

  const numericId = Number(value?.["numeric-id"]);
  return Number.isInteger(numericId) && numericId > 0 ? `Q${numericId}` : "";
}

function languageHintSet(value) {
  return new Set(normalizeSearchLanguageHints(value));
}

function normalizeLanguageCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)?.[0]
    ?.split("-")[0] || "";
}

function shouldUseClaimedLanguage(candidateLanguage, sourceCandidate, claimedLanguage) {
  if (!claimedLanguage?.code) {
    return false;
  }

  if (!candidateLanguage || candidateLanguage === claimedLanguage.code) {
    return true;
  }

  return candidateLanguage === "en" && !["native label", "native name"].includes(sourceCandidate?.source);
}
