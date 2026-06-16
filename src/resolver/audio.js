import { normalizeSelection } from "./text.js";
import { normalizeLongValue } from "./values.js";

export function getBestAudio(result) {
  const audio = result?.pronunciation?.audio;
  if (!Array.isArray(audio) || !audio.length) {
    return null;
  }

  return audio.find((item) => item?.url && item.quality === "verified") || audio.find((item) => item?.url) || null;
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

  return audio;
}

export function normalizePronunciation(pronunciation = {}) {
  const value = pronunciation || {};
  return {
    ipa: value.ipa || "",
    simple: value.simple || "",
    audio: normalizeAudio(value.audio)
  };
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
