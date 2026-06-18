import {
  hasPreferredAudio,
  normalizeSelection
} from "../resolver-core.js";

export function shouldRefreshBeforeSpeech(result) {
  return Boolean(
    result &&
    !hasPreferredAudio(result) &&
    (hasGeneratedAudio(result) ||
      result.sourceStatus === "best-effort-fallback" ||
      normalizeSelection(result.sourceForm || result.display || result.query))
  );
}

function hasGeneratedAudio(result = {}) {
  const audio = Array.isArray(result?.pronunciation?.audio) ? result.pronunciation.audio : [];
  return result?.sourceStatus === "generated-audio" ||
    audio.some((item) => item?.url && normalizeSelection(item.quality).toLowerCase() === "generated");
}
