import { normalizeSelection } from "./text.js";
import { normalizeLongValue } from "./values.js";

export function getBestAudio(result) {
  const audio = result?.pronunciation?.audio;
  if (!Array.isArray(audio) || !audio.length) {
    return null;
  }

  return rankedAudioItems(audio)[0] || null;
}

export function mapResultAudioUrls(result, resolveUrl) {
  if (!result?.pronunciation?.audio?.length || typeof resolveUrl !== "function") {
    return result;
  }

  return {
    ...result,
    pronunciation: {
      ...result.pronunciation,
      audio: result.pronunciation.audio.map((item) => ({
        ...item,
        url: shouldResolveAudioUrl(item.url) ? resolveUrl(item.url) : item.url
      }))
    }
  };
}

export function mergeAudioItems(...groups) {
  const seen = new Set();
  const audio = [];

  for (const item of groups.flatMap((group) => Array.isArray(group) ? group : [])) {
    const url = normalizeLongValue(item?.url);
    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    audio.push(item);
  }

  return rankedAudioItems(audio);
}

export function normalizePronunciation(pronunciation = {}) {
  const value = pronunciation || {};
  return {
    ipa: value.ipa || "",
    simple: value.simple || "",
    audio: rankedAudioItems(normalizeAudio(value.audio))
  };
}

export function rankedAudioItems(audio = []) {
  return (Array.isArray(audio) ? audio : [])
    .filter((item) => item?.url)
    .map((item, index) => ({ item, index }))
    .sort((left, right) =>
      audioScore(right.item) - audioScore(left.item) ||
      left.index - right.index)
    .map(({ item }) => item);
}

function audioScore(item = {}) {
  return qualityScore(item.quality) + sourceScore(item.source || item.label);
}

function qualityScore(value) {
  const quality = normalizeSelection(value).toLowerCase();
  if (quality === "verified") {
    return 100;
  }

  if (quality === "generated") {
    return 0;
  }

  return 40;
}

function sourceScore(value) {
  const source = normalizeSelection(value).toLowerCase();
  if (source.includes("forvo")) {
    return 8;
  }
  if (source.includes("wiktionary")) {
    return 7;
  }
  if (source.includes("wikidata")) {
    return 6;
  }
  if (source.includes("commons")) {
    return 5;
  }
  if (source.includes("community")) {
    return 4;
  }
  return 1;
}

function normalizeAudio(audio) {
  if (!Array.isArray(audio)) {
    return [];
  }

  return audio
    .map((item) => ({
      url: normalizeLongValue(item?.url),
      label: normalizeSelection(item?.label),
      source: normalizeSelection(item?.source),
      quality: normalizeSelection(item?.quality)
    }))
    .filter((item) => item.url);
}

function shouldResolveAudioUrl(url) {
  return Boolean(url && !/^(?:https?:|chrome-extension:|data:|blob:)/i.test(url));
}
