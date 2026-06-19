import {
  hasTopTierAudio,
  normalizeSelection
} from "../resolver-core.js";

export function shouldRefreshBeforeSpeech(result) {
  return Boolean(
    result &&
    !hasTopTierAudio(result) &&
    (hasGeneratedAudio(result) ||
      result.sourceStatus === "best-effort-fallback" ||
      normalizeSelection(result.sourceForm || result.display || result.query))
  );
}

export function isReusableResultForSelection(result, selection) {
  const text = normalizeSelection(selection);
  if (!result || !text) {
    return false;
  }

  return [
    result.query,
    result.display,
    result.sourceForm
  ].some((value) => normalizeSelection(value) === text);
}

function hasGeneratedAudio(result = {}) {
  const audio = Array.isArray(result?.pronunciation?.audio) ? result.pronunciation.audio : [];
  return result?.sourceStatus === "generated-audio" ||
    audio.some((item) => item?.url && normalizeSelection(item.quality).toLowerCase() === "generated");
}
