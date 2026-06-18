import {
  getBestAudio,
  normalizeSelection
} from "../resolver-core.js";

export function shouldRefreshBeforeSpeech(result) {
  return Boolean(
    result &&
    !getBestAudio(result) &&
    (result.sourceStatus === "best-effort-fallback" ||
      !normalizeSelection(result.pronunciation?.simple))
  );
}
