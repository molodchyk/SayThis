import {
  hasPreferredAudio
} from "../resolver-core.js";

export async function resolvePlayableResult(selectedText, result, options = {}, dependencies = {}) {
  if (!result) {
    return result;
  }

  if (hasPlayableAudio(result)) {
    return result;
  }

  let playableResult = result;
  try {
    if (options.useOnline !== true) {
      playableResult = await dependencies.resolveSelection?.(selectedText, {
        ...options,
        useOnline: true,
        localResult: result
      }) || result;
    }
  } catch {
    playableResult = result;
  }

  if (hasPlayableAudio(playableResult) || typeof dependencies.requestSharedAudio !== "function") {
    return playableResult;
  }

  try {
    return await dependencies.requestSharedAudio(selectedText, playableResult, options) || playableResult;
  } catch {
    return playableResult;
  }
}

export function hasPlayableAudio(result = {}) {
  return hasPreferredAudio(result);
}
