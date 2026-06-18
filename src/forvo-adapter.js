import {
  createLookupKey,
  createRemoteStructuredResult,
  normalizeSelection
} from "./resolver-core.js";

export const FORVO_API_ORIGIN = "https://apifree.forvo.com/";

export function buildForvoWordPronunciationsUrl(query, apiKey, options = {}) {
  const word = normalizeSelection(query);
  const key = normalizeApiKey(apiKey);
  if (!word || !key) {
    return "";
  }

  const parts = [
    "key",
    encodePathPart(key),
    "format",
    "json",
    "action",
    "word-pronunciations",
    "word",
    encodePathPart(word),
    "order",
    "rate-desc",
    "limit",
    String(clampInteger(options.limit, 1, 10, 5))
  ];
  const language = normalizeLanguageCode(options.language);
  if (language) {
    parts.push("language", encodePathPart(language));
  }

  return `${FORVO_API_ORIGIN}${parts.join("/")}`;
}

export function buildForvoResult(query, payload = {}, options = {}) {
  const selectedText = normalizeSelection(query);
  const rankedItems = rankedForvoItems(payload, {
    lookupWord: options.lookupWord,
    language: options.language
  });
  const item = rankedItems[0]?.item;
  if (!selectedText || !item) {
    return null;
  }

  const primaryAudio = forvoAudioItem(item);
  if (!primaryAudio) {
    return null;
  }

  const word = normalizeSelection(item.word || item.original || selectedText);
  const language = normalizeLanguageCode(item.code || item.lang_code || item.language);
  const languageName = normalizeSelection(item.langname || item.languageName);
  const username = normalizeSelection(item.username);
  const country = normalizeSelection(item.country);
  const rate = normalizeNumber(item.rate);
  const additionalAudio = additionalForvoAudioItems(item, rankedItems.slice(1));

  return createRemoteStructuredResult(selectedText, {
    id: `forvo:${normalizeSelection(item.id || word || selectedText)}`,
    display: word || selectedText,
    sourceForm: word || selectedText,
    language,
    languageName,
    category: "pronunciation-database",
    origin: country ? `Speaker country: ${country}` : "",
    pronunciation: {
      ipa: "",
      simple: "",
      audio: [primaryAudio, ...additionalAudio]
    },
    sourceStatus: "verified-audio",
    confidence: "high",
    evidence: [
      "Pronunciation audio from Forvo",
      languageName ? `Language: ${languageName}` : "",
      country ? `Speaker country: ${country}` : "",
      username ? `Speaker: ${username}` : "",
      Number.isFinite(rate) ? `Forvo rating: ${rate}` : "",
      additionalAudio.length ? `Additional Forvo recordings: ${additionalAudio.length}` : ""
    ].filter(Boolean),
    sources: [
      { label: "Pronunciations by Forvo", url: "https://forvo.com/" },
      { label: "Forvo word page", url: forvoWordUrl(word || selectedText, language) }
    ]
  });
}

export function selectBestForvoItem(payload = {}, options = {}) {
  return rankedForvoItems(payload, options)[0]?.item || null;
}

function rankedForvoItems(payload = {}, options = {}) {
  const items = normalizeForvoItems(payload);
  const expectedWordKey = createLookupKey(options.lookupWord);
  const expectedLanguage = normalizeLanguageCode(options.language);
  return items
    .map((item, index) => ({
      item,
      score: scoreForvoItem(item, index, {
        expectedWordKey,
        expectedLanguage
      })
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
}

function normalizeForvoItems(payload = {}) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  if (payload.items && typeof payload.items === "object") {
    return Object.values(payload.items).flatMap((value) => Array.isArray(value) ? value : [value]);
  }

  return [];
}

function scoreForvoItem(item = {}, index, expected = {}) {
  const audioUrl = normalizeLongValue(item.pathogg || item.pathmp3);
  if (!audioUrl) {
    return 0;
  }

  if (expected.expectedWordKey && forvoItemWordKey(item) !== expected.expectedWordKey) {
    return 0;
  }

  if (expected.expectedLanguage && forvoItemLanguage(item) !== expected.expectedLanguage) {
    return 0;
  }

  const rate = normalizeNumber(item.rate);
  const hits = normalizeNumber(item.hits);
  let score = Math.max(0, 20 - index);

  if (item.pathogg) {
    score += 6;
  }

  if (Number.isFinite(rate)) {
    score += Math.max(0, Math.min(20, rate * 4));
  }

  if (Number.isFinite(hits)) {
    score += Math.min(10, Math.log10(Math.max(1, hits)));
  }

  if (item.code || item.langname) {
    score += 4;
  }

  return score;
}

function additionalForvoAudioItems(primaryItem, rankedItems) {
  const primaryWordKey = forvoItemWordKey(primaryItem);
  const primaryLanguage = forvoItemLanguage(primaryItem);
  if (!primaryWordKey) {
    return [];
  }

  const seen = new Set([forvoAudioItem(primaryItem)?.url].filter(Boolean));
  const audio = [];

  for (const { item } of rankedItems) {
    if (forvoItemWordKey(item) !== primaryWordKey || forvoItemLanguage(item) !== primaryLanguage) {
      continue;
    }

    const candidate = forvoAudioItem(item);
    if (!candidate?.url || seen.has(candidate.url)) {
      continue;
    }

    seen.add(candidate.url);
    audio.push(candidate);

    if (audio.length >= 3) {
      break;
    }
  }

  return audio;
}

function forvoAudioItem(item = {}) {
  const audioUrl = normalizeLongValue(item.pathogg || item.pathmp3);
  if (!audioUrl) {
    return null;
  }

  const languageName = normalizeSelection(item.langname || item.languageName);
  const username = normalizeSelection(item.username);
  const country = normalizeSelection(item.country);
  const speaker = [username, country].filter(Boolean).join(", ");
  const label = [
    languageName ? `${languageName} pronunciation` : "Pronunciation audio",
    speaker ? `(${speaker})` : ""
  ].filter(Boolean).join(" ");

  return {
    url: audioUrl,
    label: normalizeSelection(label),
    source: "Forvo",
    quality: "verified"
  };
}

function forvoItemWordKey(item = {}) {
  return createLookupKey(item.word || item.original);
}

function forvoItemLanguage(item = {}) {
  return normalizeLanguageCode(item.code || item.lang_code || item.language);
}

function forvoWordUrl(word, language) {
  const encodedWord = encodeURIComponent(normalizeSelection(word).replace(/\s+/g, "_"));
  const encodedLanguage = normalizeLanguageCode(language);
  return encodedLanguage
    ? `https://forvo.com/word/${encodedWord}/#${encodeURIComponent(encodedLanguage)}`
    : `https://forvo.com/word/${encodedWord}/`;
}

function normalizeApiKey(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function normalizeLanguageCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)?.[0] || "";
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function normalizeLongValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2048);
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(number)));
}

function encodePathPart(value) {
  return encodeURIComponent(String(value || ""));
}
