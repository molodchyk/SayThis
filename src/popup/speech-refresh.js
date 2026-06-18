import {
  getBestAudio,
  normalizeSelection
} from "../resolver-core.js";

export function shouldRefreshBeforeSpeech(result) {
  return Boolean(
    result &&
    !getBestAudio(result) &&
    !normalizeSelection(result.pronunciation?.simple)
  );
}
