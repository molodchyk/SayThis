import {
  createLookupKey
} from "../resolver/text.js";
import {
  wikidataLanguageCodeFromClaimValue
} from "./language-claims.js";

const PRONUNCIATION_AUDIO = "P443";
const LANGUAGE_OF_WORK_OR_NAME = "P407";

export function wikidataPronunciationAudioFiles(entity, language = "") {
  const targetLanguage = baseLanguage(language);
  const seen = new Set();
  const values = [];

  for (const [index, claim] of (entity.claims?.[PRONUNCIATION_AUDIO] || []).entries()) {
    const value = claim?.mainsnak?.datavalue?.value;
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }

    const qualifierLanguage = claimLanguageQualifier(claim);
    if (targetLanguage && qualifierLanguage && qualifierLanguage !== targetLanguage) {
      continue;
    }

    const text = value.trim();
    const key = createLookupKey(text);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    values.push({
      value: text,
      score: qualifierLanguage && targetLanguage && qualifierLanguage === targetLanguage ? 20 : 0,
      index
    });
  }

  return values
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.value);
}

function claimLanguageQualifier(claim = {}) {
  return (claim.qualifiers?.[LANGUAGE_OF_WORK_OR_NAME] || [])
    .map((qualifier) => wikidataLanguageCodeFromClaimValue(qualifier?.datavalue?.value))
    .filter(Boolean)[0] || "";
}

function baseLanguage(language) {
  return String(language || "").trim().toLowerCase().split(/[-_]/)[0];
}
