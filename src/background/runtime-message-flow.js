import {
  MESSAGE_TYPES
} from "../message-contracts.js";
import {
  createLookupKey,
  getBestAudio,
  normalizeSelection
} from "../resolver-core.js";
import {
  normalizeLanguageHints
} from "../shared/settings.js";
import {
  resolvePlayableResult
} from "./pronunciation-playback-flow.js";

const DEFAULT_DIRECT_SHARED_AUDIO_WAIT_MS = 450;
const DEFAULT_STORED_RESULT_GRACE_MS = 10;

export function handleRuntimeMessage(message = {}, sendResponse = () => {}, dependencies = {}) {
  if (message?.type === MESSAGE_TYPES.resolve) {
    respondWithResult(
      dependencies.resolveSelection(message.text, useOnlineMessageOptions(message)),
      sendResponse,
      (result) => ({ ok: true, result }),
      "Resolve failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.speak) {
    const selectedText = normalizeSelection(message.text);
    if (!selectedText) {
      sendResponse({ ok: false, error: "No text selected." });
      return true;
    }

    recordSelectionTrigger(selectedText, message.trace, dependencies);
    const options = {
      ...useOnlineMessageOptions(message),
      ...(shouldPreferImmediatePlayback(message) ? {
        useOnline: false,
        skipOnlineRetry: true
      } : {}),
      ...(message.trace ? { trace: message.trace } : {})
    };
    const resolverOptions = withoutPlaybackOnlyOptions(options);
    startPreparingPlayback(dependencies, message.trace);
    let directSharedAudioResult = null;
    let resolvedPlayableResult = null;
    let storedPlayableResult = null;
    const storedResultPromise = message.result
      ? Promise.resolve(null)
      : awaitStoredPlayableResult(selectedText, dependencies, message.trace).then((result) => {
        storedPlayableResult = result;
        return result;
      });
    const storedResultGraceMs = dependencies.storedResultGraceMs ?? DEFAULT_STORED_RESULT_GRACE_MS;
    const storedResultWaitMs = dependencies.storedResultWaitMs ?? DEFAULT_DIRECT_SHARED_AUDIO_WAIT_MS;
    const directSharedAudioPromise = message.result
      ? Promise.resolve(null)
      : waitForStoredResultGrace(storedResultPromise, storedResultGraceMs).then((storedResult) => storedResult
        ? null
        : requestDirectSharedAudio(selectedText, message, dependencies)).then((result) => {
          directSharedAudioResult = result;
          return result;
        });
    const resolvedSelectionPromise = message.result
      ? Promise.resolve(message.result)
      : withHandledRejection(waitForStoredResultGrace(storedResultPromise, storedResultGraceMs)
        .then((result) => result || dependencies.resolveSelection(selectedText, resolverOptions)));
    const resolvedPlayablePromise = message.result
      ? Promise.resolve(null)
      : withHandledRejection(resolvedSelectionPromise.then(async (result) => {
        const playableResult = await resolvePlayableResult(selectedText, result, {
          ...options,
          skipSharedAudio: true
        }, dependencies);
        resolvedPlayableResult = getBestAudio(playableResult)?.url ? playableResult : null;
        return resolvedPlayableResult;
      }));
    const resultPromise = message.result
      ? Promise.resolve(message.result)
      : firstNonNullResult([
        promiseWithinWait(storedResultPromise, storedResultWaitMs),
        promiseWithinWait(
          directSharedAudioPromise,
          dependencies.directSharedAudioWaitMs ?? DEFAULT_DIRECT_SHARED_AUDIO_WAIT_MS
        ),
        promiseWithinWait(
          resolvedPlayablePromise,
          dependencies.directSharedAudioWaitMs ?? DEFAULT_DIRECT_SHARED_AUDIO_WAIT_MS
        )
      ]).then((fastResult) => fastResult || resolvedSelectionPromise);
    respondWithResult(
      resultPromise.then(async (result) => {
        const isDirectSharedAudio = directSharedAudioResult && directSharedAudioResult === result;
        const isResolvedPlayable = resolvedPlayableResult && resolvedPlayableResult === result;
        const isStoredAudio = storedPlayableResult && storedPlayableResult === result;
        const playableResult = isStoredAudio || isDirectSharedAudio || isResolvedPlayable
          ? result
          : await resolvePlayableResult(selectedText, result, options, dependencies);
        const playback = await playResolvedAudio(playableResult, message.rate, dependencies, message.trace);
        if (playback) {
          return { result: playableResult, speech: playback };
        }

        const speech = await dependencies.speakResult(playableResult, speechOptions({
          rate: message.rate,
          lang: message.lang,
          trace: message.trace
        }));
        if (!speech || speech.spoken === false) {
          throw new Error(speech?.error || "Speech unavailable.");
        }
        return { result: playableResult, speech: speechSummary(speech) };
      }),
      sendResponse,
      ({ result, speech }) => ({
        ok: true,
        result,
        ...(speech ? { speech } : {})
      }),
      "Speech failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.playAudio) {
    respondWithResult(
      Promise.resolve(dependencies.playAudio?.(message.audio, message.rate, message.trace)).then((played) => {
        if (!played) {
          throw new Error("Audio playback failed.");
        }
        return played;
      }),
      sendResponse,
      (playback) => ({
        ok: true,
        ...(typeof playback === "object" ? { playback } : {})
      }),
      "Audio playback failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.preparePlayback) {
    startPreparingPlayback(dependencies, message.trace);
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.stop) {
    respondWithResult(
      Promise.resolve(dependencies.stopPlayback()).catch(() => null),
      sendResponse,
      () => ({ ok: true }),
      "Stop failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.feedback) {
    respondWithResult(
      dependencies.saveFeedback(message.text, message.feedback || {}),
      sendResponse,
      (result) => ({ ok: true, result }),
      "Feedback failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.flushSync) {
    respondWithResult(
      dependencies.flushCommunitySync(),
      sendResponse,
      (summary) => ({ ok: true, summary }),
      "Sync failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.pullApproved) {
    respondWithResult(
      dependencies.pullApprovedCommunityEntries(),
      sendResponse,
      (summary) => ({ ok: true, summary }),
      "Refresh failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.getDebugState) {
    respondWithResult(
      typeof dependencies.getDebugState === "function"
        ? dependencies.getDebugState()
        : Promise.reject(new Error("Debug diagnostics unavailable.")),
      sendResponse,
      (diagnostics) => ({ ok: true, diagnostics }),
      "Debug diagnostics failed."
    );
    return true;
  }

  if (message?.type === MESSAGE_TYPES.debugEvent) {
    dependencies.recordDebugEvent?.(message.kind, message.payload || {});
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.requestSharedAudio) {
    const selectedText = normalizeSelection(message.text);
    if (!selectedText) {
      sendResponse({ ok: false, error: "No text selected." });
      return true;
    }

    respondWithResult(
      typeof dependencies.requestSharedAudio === "function"
        ? dependencies.requestSharedAudio(selectedText, message.result || null, compactOptions({
          rate: message.rate,
          trace: message.trace
        }))
        : Promise.reject(new Error("Shared audio unavailable.")),
      sendResponse,
      (result) => ({ ok: true, result }),
      "Shared audio failed."
    );
    return true;
  }

  return false;
}

async function requestDirectSharedAudio(selectedText, message = {}, dependencies = {}) {
  if (typeof dependencies.requestSharedAudio !== "function") {
    return null;
  }

  try {
    return await dependencies.requestSharedAudio(selectedText, null, compactOptions({
      rate: message.rate,
      trace: message.trace,
      directLookup: true,
      skipRefresh: true
    }));
  } catch {
    return null;
  }
}

async function promiseWithinWait(promise, waitMs) {
  const normalizedWaitMs = Math.max(0, Number(waitMs) || 0);
  if (!normalizedWaitMs || typeof setTimeout !== "function") {
    return promise;
  }

  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(null), normalizedWaitMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function waitForStoredResultGrace(storedResultPromise, waitMs) {
  return promiseWithinWait(storedResultPromise, waitMs);
}

function firstNonNullResult(promises = []) {
  const pending = promises.filter(Boolean);
  if (!pending.length) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let remaining = pending.length;
    pending.forEach((promise) => {
      Promise.resolve(promise)
        .then((value) => {
          if (value) {
            resolve(value);
            return;
          }

          remaining -= 1;
          if (!remaining) {
            resolve(null);
          }
        })
        .catch(() => {
          remaining -= 1;
          if (!remaining) {
            resolve(null);
          }
        });
    });
  });
}

function withHandledRejection(promise) {
  promise?.catch?.(() => {});
  return promise;
}

async function awaitStoredPlayableResult(selectedText, dependencies = {}, trace = null) {
  const key = dependencies.lastResultKey || "lastResult";
  let stored = {};
  try {
    stored = await dependencies.getStorage?.([key]) || {};
  } catch (error) {
    dependencies.recordDebugEvent?.("stored-result:error", {
      text: selectedText,
      error: error?.message || String(error || "Unknown storage error"),
      trace
    });
    return null;
  }

  const result = stored[key];
  const missReason = storedResultMissReason(result, selectedText);
  if (missReason) {
    recordStoredResultMiss(selectedText, result, missReason, dependencies, trace);
    return null;
  }

  dependencies.recordDebugEvent?.("stored-result:hit", {
    text: selectedText,
    sourceStatus: result.sourceStatus || "",
    audioQuality: getBestAudio(result)?.quality || "",
    trace
  });
  return result;
}

function recordStoredResultMiss(selectedText, result = {}, reason = "", dependencies = {}, trace = null) {
  const audio = getBestAudio(result);
  dependencies.recordDebugEvent?.("stored-result:miss", {
    text: selectedText,
    reason,
    sourceStatus: result?.sourceStatus || "",
    storedDisplay: result?.display || result?.query || "",
    audioQuality: audio?.quality || "",
    trace
  });
}

function storedResultMissReason(result = {}, selectedText = "") {
  if (!result) {
    return "missing";
  }

  if (!getBestAudio(result)?.url) {
    return "no-audio";
  }

  if (!matchesSelection(result, selectedText)) {
    return "selection-mismatch";
  }

  return "";
}

function matchesSelection(result = {}, selectedText = "") {
  const selectedKey = createLookupKey(selectedText);
  if (!selectedKey) {
    return false;
  }

  return [
    result.query,
    result.display,
    result.sourceForm,
    result.speakText,
    ...(Array.isArray(result.aliases) ? result.aliases : []),
    ...(Array.isArray(result.variants) ? result.variants : [])
  ].some((value) => createLookupKey(value) === selectedKey);
}

async function playResolvedAudio(result, rate, dependencies = {}, trace) {
  const audio = getBestAudio(result);
  if (!audio?.url || typeof dependencies.playAudio !== "function") {
    return null;
  }

  try {
    const played = await dependencies.playAudio(audio, rate, trace);
    return played
      ? {
        fallback: "audio",
        text: normalizeSelection(audio.label || audio.source || "Pronunciation audio")
      }
      : null;
  } catch {
    return null;
  }
}

export function useOnlineMessageOptions(message = {}) {
  const languageHints = normalizeLanguageHints(message.languageHints);
  const options = Object.prototype.hasOwnProperty.call(message, "useOnline")
    ? {
      useOnline: Boolean(message.useOnline),
      ...(languageHints.length ? { languageHints } : {})
    }
    : languageHints.length ? { languageHints } : {};

  return message.skipSharedAudio ? { ...options, skipSharedAudio: true } : options;
}

function shouldPreferImmediatePlayback(message = {}) {
  return message.useOnline !== true &&
    message.trace?.source === "content-selection" &&
    message.trace?.action === "select-to-hear";
}

function respondWithResult(promise, sendResponse, buildResponse, fallbackError) {
  Promise.resolve(promise)
    .then((value) => {
      sendResponse(buildResponse(value));
    })
    .catch((error) => {
      sendResponse({ ok: false, error: error?.message || fallbackError });
    });
}

function startPreparingPlayback(dependencies = {}, trace = null) {
  try {
    const prepared = dependencies.preparePlayback?.(trace);
    if (prepared && typeof prepared.catch === "function") {
      prepared.catch(() => {});
    }
  } catch {
    // Playback can still try to prepare its surface at the point of use.
  }
}

function recordSelectionTrigger(selectedText, trace = null, dependencies = {}) {
  if (trace?.source !== "content-selection" || trace?.action !== "select-to-hear") {
    return;
  }

  dependencies.recordDebugEvent?.("ui:selection-auto-speak", {
    text: selectedText,
    trace
  });
}

function speechSummary(speech = {}) {
  const fallback = normalizeSelection(speech.fallback);
  const text = normalizeSelection(speech.text);

  if (!fallback && !text) {
    return null;
  }

  return {
    ...(fallback ? { fallback } : {}),
    ...(text ? { text } : {})
  };
}

function compactOptions(options = {}) {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined)
  );
}

function withoutPlaybackOnlyOptions(options = {}) {
  const { skipOnlineRetry, skipSharedAudio, ...resolverOptions } = options;
  return resolverOptions;
}

function speechOptions(options = {}) {
  return {
    rate: options.rate,
    lang: options.lang,
    ...(options.trace ? { trace: options.trace } : {})
  };
}
