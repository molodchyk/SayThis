import {
  createLookupKey,
  createRemoteStructuredResult,
  mergeRemoteResult,
  normalizeSelection
} from "../../resolver-core.js";
import {
  pronunciationLookupCandidates
} from "../../pronunciation-source-plan.js";
import {
  languageNameFromCode
} from "../../resolver/language.js";
import {
  fetchWikimediaApi
} from "./wikimedia-api.js";

export async function resolveWithCommonsAudioCandidates(text, structuredResult) {
  const query = normalizeSelection(text);
  if (!query) {
    return null;
  }

  let result = null;
  for (const candidate of pronunciationLookupCandidates(query, structuredResult, {
    includeResolvedLanguageFallback: true
  }).slice(0, 4)) {
    const audioResult = await safeResolve(resolveWithCommonsAudioLookup, query, candidate.word, candidate.language, structuredResult);
    if (!audioResult) {
      continue;
    }

    result = mergeRemoteResult(result, audioResult);
    if (result?.sourceStatus === "verified-audio") {
      return result;
    }
  }

  return result;
}

export async function resolveWithCommonsAudioLookup(selectedText, lookupWord, language = "", baseResult = {}) {
  const selected = normalizeSelection(selectedText);
  const query = normalizeSelection(lookupWord);
  const urls = buildCommonsAudioSearchUrls(query);
  if (!selected || !query || !urls.length) {
    return null;
  }

  let matches = [];
  for (const url of urls) {
    const response = await fetchWikimediaApi(url, {
      method: "GET"
    });
    if (!response.ok) {
      continue;
    }

    const data = await response.json();
    matches = commonsAudioMatches(data, query, language || baseResult?.language).slice(0, 3);
    if (matches.length) {
      break;
    }
  }

  if (!matches.length) {
    return null;
  }

  return createRemoteStructuredResult(selected, {
    id: `commons:${createLookupKey(query)}`,
    display: baseResult?.display || selected,
    aliases: baseResult?.aliases || [],
    variants: baseResult?.variants || [],
    sourceForm: query,
    language: language || baseResult?.language || "",
    languageName: baseResult?.languageName || "",
    ttsLang: baseResult?.ttsLang || "",
    category: baseResult?.category || "term",
    origin: baseResult?.origin || "",
    pronunciation: {
      audio: matches.map((match) => match.audio)
    },
    sourceStatus: "verified-audio",
    confidence: "high",
    evidence: ["Audio from Wikimedia Commons"],
    sources: matches.map((match, index) => ({
      label: matches.length > 1 ? `Wikimedia Commons audio ${index + 1}` : "Wikimedia Commons audio",
      url: match.sourceUrl
    }))
  });
}

export function buildCommonsAudioSearchUrls(lookupWord) {
  return [
    buildCommonsAudioSearchUrl(lookupWord, { audioOnly: true }),
    buildCommonsAudioSearchUrl(lookupWord, { audioOnly: false })
  ].filter(Boolean);
}

export function buildCommonsAudioSearchUrl(lookupWord, options = {}) {
  const query = normalizeSelection(lookupWord);
  if (!query) {
    return "";
  }
  const search = options.audioOnly === false ? query : `filetype:audio ${query}`;

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: search,
    gsrnamespace: "6",
    gsrlimit: "12",
    gsrprop: "snippet|titlesnippet",
    prop: "imageinfo",
    iiprop: "url|mime|mediatype|extmetadata"
  });

  return `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
}

function commonsAudioMatches(data = {}, lookupWord, language = "") {
  const pages = Object.values(data.query?.pages || {});
  return pages
    .map((page, fallbackIndex) => {
      const match = commonsAudioMatch(page, lookupWord, language);
      return match
        ? {
          ...match,
          index: Number(page.index || fallbackIndex),
          score: scoreCommonsAudioMatch(page, lookupWord, language)
        }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

function commonsAudioMatch(page = {}, lookupWord, language = "") {
  const info = page.imageinfo?.[0] || {};
  const url = normalizeHttpsUrl(info.url);
  const sourceUrl = normalizeHttpsUrl(info.descriptionurl) || url;
  const mime = String(info.mime || "").toLowerCase();
  const mediaType = String(info.mediatype || "").toLowerCase();
  const fileName = stripMarkup(page.title).replace(/^File:/i, "");
  const lookupKey = createLookupKey(lookupWord);
  const pronunciationScore = scorePronunciationSignal(page, lookupWord, language);
  const matchText = createLookupKey([
    page.title,
    page.snippet,
    page.titlesnippet,
    commonsExtText(info.extmetadata)
  ].map(stripMarkup).join(" "));

  if (
    !url ||
    !lookupKey ||
    hasConflictingLanguagePrefix(fileName, language) ||
    !pronunciationScore ||
    !keyContainsLookup(matchText, lookupKey) ||
    (!mime.startsWith("audio/") && mediaType !== "audio")
  ) {
    return null;
  }

  return {
    audio: {
      url,
      label: "Wikimedia Commons audio",
      source: "Wikimedia Commons",
      quality: "verified"
    },
    sourceUrl
  };
}

function scoreCommonsAudioMatch(page = {}, lookupWord, language = "") {
  const languageCode = baseLanguage(language);
  const lookupKey = createLookupKey(lookupWord);
  const title = stripMarkup(page.title);
  const fileName = title.replace(/^File:/i, "");
  const filePrefix = fileLanguagePrefix(fileName);
  const matchText = createLookupKey([
    title,
    page.snippet,
    page.titlesnippet,
    commonsExtText(page.imageinfo?.[0]?.extmetadata)
  ].map(stripMarkup).join(" "));
  let score = 0;

  score += scorePronunciationSignal(page, lookupWord, language);

  if (lookupKey && keyContainsLookup(createLookupKey(fileName), lookupKey)) {
    score += 8;
  }

  if (!languageCode) {
    return score;
  }

  if (filePrefix === languageCode) {
    score += 50;
  } else if (filePrefix && filePrefix !== "ll") {
    score -= 8;
  }

  const languageName = createLookupKey(languageNameFromCode(languageCode));
  if (languageName && keyContainsLookup(matchText, languageName)) {
    score += 12;
  }

  return score;
}

function scorePronunciationSignal(page = {}, lookupWord, language = "") {
  const lookupKey = createLookupKey(lookupWord);
  const languageCode = baseLanguage(language);
  const title = stripMarkup(page.title);
  const fileName = title.replace(/^File:/i, "");
  const fileKey = createLookupKey(fileName);
  const filePrefix = fileLanguagePrefix(fileName);
  const text = createLookupKey([
    title,
    page.snippet,
    page.titlesnippet,
    commonsExtText(page.imageinfo?.[0]?.extmetadata)
  ].map(stripMarkup).join(" "));

  if (!lookupKey || !keyContainsLookup(text, lookupKey)) {
    return 0;
  }

  if (isLinguaLibreFile(fileName)) {
    return 40;
  }

  if (filePrefix && keyContainsLookup(fileKey, lookupKey)) {
    if (languageCode && filePrefix !== languageCode) {
      return 0;
    }

    return filePrefix === languageCode ? 42 : 28;
  }

  if (hasPronunciationText(text)) {
    return 24;
  }

  return 0;
}

function hasPronunciationText(text) {
  return [
    "pronunciation",
    "pronounced",
    "spoken pronunciation",
    "spoken word"
  ].some((phrase) => text.includes(createLookupKey(phrase)));
}

function keyContainsLookup(textKey, lookupKey) {
  const text = boundaryLookupKey(textKey);
  const lookup = boundaryLookupKey(lookupKey);
  if (!text || !lookup) {
    return false;
  }

  return text === lookup ||
    text.startsWith(`${lookup} `) ||
    text.endsWith(` ${lookup}`) ||
    text.includes(` ${lookup} `);
}

function boundaryLookupKey(value) {
  return createLookupKey(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLinguaLibreFile(fileName) {
  return /^LL[-_]/i.test(String(fileName || "").trim());
}

function fileLanguagePrefix(fileName) {
  return String(fileName || "")
    .trim()
    .toLowerCase()
    .match(/^([a-z]{2,3})(?:[-_][a-z0-9]{2,8})?[-_\s]/)?.[1] || "";
}

function hasConflictingLanguagePrefix(fileName, language) {
  const languageCode = baseLanguage(language);
  const filePrefix = fileLanguagePrefix(fileName);
  return Boolean(languageCode && filePrefix && filePrefix !== "ll" && filePrefix !== languageCode);
}

function baseLanguage(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .match(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)?.[0]
    ?.split("-")[0] || "";
}

async function safeResolve(resolver, ...args) {
  try {
    return await resolver(...args);
  } catch {
    return null;
  }
}

function commonsExtText(ext = {}) {
  return Object.values(ext || {})
    .map((item) => item?.value)
    .filter(Boolean)
    .join(" ");
}

function stripMarkup(value) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}

function normalizeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
