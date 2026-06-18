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
    matches = commonsAudioMatches(data, query).slice(0, 3);
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

function commonsAudioMatches(data = {}, lookupWord) {
  const pages = Object.values(data.query?.pages || {});
  return pages
    .sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
    .map((page) => commonsAudioMatch(page, lookupWord))
    .filter(Boolean);
}

function commonsAudioMatch(page = {}, lookupWord) {
  const info = page.imageinfo?.[0] || {};
  const url = normalizeHttpsUrl(info.url);
  const sourceUrl = normalizeHttpsUrl(info.descriptionurl) || url;
  const mime = String(info.mime || "").toLowerCase();
  const mediaType = String(info.mediatype || "").toLowerCase();
  const lookupKey = createLookupKey(lookupWord);
  const matchText = createLookupKey([
    page.title,
    page.snippet,
    page.titlesnippet,
    commonsExtText(info.extmetadata)
  ].map(stripMarkup).join(" "));

  if (!url || !lookupKey || !matchText.includes(lookupKey) || (!mime.startsWith("audio/") && mediaType !== "audio")) {
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
