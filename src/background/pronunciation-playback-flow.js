import {
  hasPreferredAudio,
  hasTopTierAudio
} from "../resolver-core.js";

const DEFAULT_SHARED_AUDIO_WAIT_MS = 450;

export async function resolvePlayableResult(selectedText, result, options = {}, dependencies = {}) {
  if (!result) {
    return result;
  }

  if (hasTopTierAudio(result)) {
    return result;
  }

  let playableResult = result;
  try {
    if (options.useOnline !== true && options.skipOnlineRetry !== true) {
      const retryOptions = withoutPlaybackOnlyOptions(options);
      playableResult = await dependencies.resolveSelection?.(selectedText, {
        ...retryOptions,
        useOnline: true,
        localResult: result
      }) || result;
    }
  } catch {
    playableResult = result;
  }

  if (
    hasTopTierAudio(playableResult) ||
    options.skipSharedAudio ||
    typeof dependencies.requestSharedAudio !== "function"
  ) {
    return playableResult;
  }

  try {
    return await requestSharedAudioWithinWait(selectedText, playableResult, options, dependencies) || playableResult;
  } catch {
    return playableResult;
  }
}

export function hasPlayableAudio(result = {}) {
  return hasPreferredAudio(result);
}

async function requestSharedAudioWithinWait(selectedText, result, options = {}, dependencies = {}) {
  const request = Promise.resolve(dependencies.requestSharedAudio(
    selectedText,
    result,
    withoutPlaybackOnlyOptions(options)
  ));
  const waitMs = normalizeWaitMs(dependencies.sharedAudioWaitMs, DEFAULT_SHARED_AUDIO_WAIT_MS);
  if (!waitMs || typeof setTimeout !== "function") {
    return request;
  }

  let timeoutId;
  try {
    return await Promise.race([
      request,
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(null), waitMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeWaitMs(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function withoutPlaybackOnlyOptions(options = {}) {
  const { skipOnlineRetry, skipSharedAudio, ...resolverOptions } = options;
  return resolverOptions;
}
