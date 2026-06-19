import {
  MESSAGE_TYPES
} from "../message-contracts.js";
import {
  getBestAudio,
  normalizeSelection
} from "../resolver-core.js";
import {
  normalizeLanguageHints
} from "../shared/settings.js";
import {
  resolvePlayableResult
} from "./pronunciation-playback-flow.js";

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

    const options = useOnlineMessageOptions(message);
    const resultPromise = message.result
      ? Promise.resolve(message.result)
      : dependencies.resolveSelection(selectedText, options);
    respondWithResult(
      resultPromise.then(async (result) => {
        const playableResult = await resolvePlayableResult(selectedText, result, options, dependencies);
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

function respondWithResult(promise, sendResponse, buildResponse, fallbackError) {
  Promise.resolve(promise)
    .then((value) => {
      sendResponse(buildResponse(value));
    })
    .catch((error) => {
      sendResponse({ ok: false, error: error?.message || fallbackError });
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

function speechOptions(options = {}) {
  return {
    rate: options.rate,
    lang: options.lang,
    ...(options.trace ? { trace: options.trace } : {})
  };
}
